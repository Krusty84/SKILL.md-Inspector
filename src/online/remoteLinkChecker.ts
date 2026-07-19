import { isIP } from 'node:net';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { DiagnosticCode } from '../types/DiagnosticCode';
import { diag } from '../validation/util';

const MAX_REDIRECTS = 5;
const DEFAULT_TIMEOUT_MS = 10_000;

export interface ResolvedAddress {
  address: string;
  family: 4 | 6;
}

export interface RemoteDnsResolver {
  resolve(hostname: string): Promise<readonly ResolvedAddress[]>;
}

export interface RemoteHttpRequest {
  url: URL;
  method: 'HEAD' | 'GET';
  /** A previously resolved and validated address. The transport must connect to this address. */
  address: string;
  timeoutMs: number;
  headers: Readonly<Record<string, string>>;
  signal?: AbortSignal;
}

export interface RemoteHttpResponse {
  statusCode: number;
  location?: string;
  /** The address of the connected peer, used to verify the transport honored `address`. */
  connectedAddress: string;
}

export interface RemoteHttpTransport {
  request(request: RemoteHttpRequest): Promise<RemoteHttpResponse>;
}

export interface RemoteLinkDependencies {
  dns: RemoteDnsResolver;
  transport: RemoteHttpTransport;
}

export interface CancellationSignal {
  isCancellationRequested: boolean;
  onCancellationRequested?(listener: () => void): { dispose(): void };
}

export interface RemoteLinkCheckSessionOptions {
  maxConcurrency: number;
  cancellation?: CancellationSignal;
  timeoutMs?: number;
}

export class RemoteTargetBlockedError extends Error {}

type CheckResult =
  | { kind: 'reachable' }
  | { kind: 'unavailable'; statusCode: number }
  | { kind: 'failed'; reason: string }
  | { kind: 'blocked'; reason: string }
  | { kind: 'cancelled' };

/**
 * One validation-operation scope. It owns the global limiter and URL-result
 * cache, so workspace checks share both across every skill.
 */
export class RemoteLinkCheckSession {
  private readonly cache = new Map<string, Promise<CheckResult>>();
  private readonly limiter: AsyncLimiter;
  private readonly abortController = new AbortController();
  private readonly cancellationSubscription?: { dispose(): void };
  private readonly timeoutMs: number;

  constructor(
    private readonly dependencies: RemoteLinkDependencies,
    options: RemoteLinkCheckSessionOptions,
  ) {
    this.limiter = new AsyncLimiter(clampConcurrency(options.maxConcurrency));
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    if (options.cancellation?.isCancellationRequested) {
      this.abortController.abort();
    } else {
      this.cancellationSubscription = options.cancellation?.onCancellationRequested?.(() =>
        this.abortController.abort(),
      );
    }
  }

  async checkDocument(document: SkillDocument): Promise<SkillDiagnostic[]> {
    const checks = document.links
      .filter((link) => link.kind === 'remote' && /^https?:\/\//i.test(link.raw))
      .map(async (link) => {
        const result = await this.check(link.raw);
        return diagnosticForResult(result, link.raw, link.range);
      });
    const online = (await Promise.all(checks)).filter(
      (diagnostic): diagnostic is SkillDiagnostic => diagnostic !== undefined,
    );
    return online;
  }

  dispose(): void {
    this.abortController.abort();
    this.cancellationSubscription?.dispose();
  }

  private check(raw: string): Promise<CheckResult> {
    if (this.abortController.signal.aborted) {
      return Promise.resolve({ kind: 'cancelled' });
    }

    const parsed = parseHttpUrl(raw);
    if ('error' in parsed) {
      return Promise.resolve({ kind: 'blocked', reason: parsed.error });
    }
    parsed.url.hash = '';
    const key = parsed.url.href;
    const existing = this.cache.get(key);
    if (existing) {
      return existing;
    }
    const pending = this.limiter.run(
      () => this.follow(parsed.url),
      this.abortController.signal,
    );
    this.cache.set(key, pending);
    return pending;
  }

  private async follow(initialUrl: URL): Promise<CheckResult> {
    let current = initialUrl;
    let redirects = 0;
    const visited = new Set<string>([current.href]);

    while (!this.abortController.signal.aborted) {
      const response = await this.request(current, 'HEAD');
      if ('kind' in response) {
        return response;
      }

      let terminal = response;
      if (response.statusCode === 405 || response.statusCode === 501) {
        const fallback = await this.request(current, 'GET');
        if ('kind' in fallback) {
          return fallback;
        }
        terminal = fallback;
      }

      if (isReachableStatus(terminal.statusCode)) {
        return { kind: 'reachable' };
      }
      if (isRedirectStatus(terminal.statusCode)) {
        if (!terminal.location) {
          return { kind: 'failed', reason: `HTTP ${terminal.statusCode} redirect has no Location header` };
        }
        if (redirects >= MAX_REDIRECTS) {
          return { kind: 'failed', reason: `redirect limit of ${MAX_REDIRECTS} was exceeded` };
        }
        let next: URL;
        try {
          next = new URL(terminal.location, current);
        } catch {
          return { kind: 'failed', reason: 'redirect Location is not a valid URL' };
        }
        const parsed = parseHttpUrl(next.href);
        if ('error' in parsed) {
          return {
            kind: 'blocked',
            reason: `the redirect target ${parsed.error.replace(/^the URL /, '')}`,
          };
        }
        next = parsed.url;
        next.hash = '';
        if (current.protocol === 'https:' && next.protocol === 'http:') {
          return { kind: 'blocked', reason: 'an HTTPS link redirected to insecure HTTP' };
        }
        if (visited.has(next.href)) {
          return { kind: 'failed', reason: 'redirect loop detected' };
        }
        redirects += 1;
        visited.add(next.href);
        current = next;
        continue;
      }
      if (terminal.statusCode >= 400 && terminal.statusCode <= 599) {
        return { kind: 'unavailable', statusCode: terminal.statusCode };
      }
      return { kind: 'failed', reason: `unexpected terminal HTTP status ${terminal.statusCode}` };
    }

    return { kind: 'cancelled' };
  }

  private async request(
    url: URL,
    method: 'HEAD' | 'GET',
  ): Promise<RemoteHttpResponse | CheckResult> {
    if (this.abortController.signal.aborted) {
      return { kind: 'cancelled' };
    }

    const target = await validateTarget(
      url,
      this.dependencies.dns,
      this.timeoutMs,
      this.abortController.signal,
    );
    if ('kind' in target) {
      return target;
    }

    try {
      const response = await this.dependencies.transport.request({
        url,
        method,
        address: target.address,
        timeoutMs: this.timeoutMs,
        headers: method === 'GET' ? { Range: 'bytes=0-0' } : {},
        signal: this.abortController.signal,
      });
      if (
        !isPublicIpAddress(response.connectedAddress) ||
        !addressesEqual(response.connectedAddress, target.address)
      ) {
        return {
          kind: 'blocked',
          reason: 'the connected socket did not use the validated public address',
        };
      }
      return response;
    } catch (error) {
      if (this.abortController.signal.aborted) {
        return { kind: 'cancelled' };
      }
      if (error instanceof RemoteTargetBlockedError) {
        return { kind: 'blocked', reason: error.message };
      }
      return { kind: 'failed', reason: networkFailureMessage(error) };
    }
  }
}

async function validateTarget(
  url: URL,
  dns: RemoteDnsResolver,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<{ address: string } | CheckResult> {
  const parsed = parseHttpUrl(url.href);
  if ('error' in parsed) {
    return { kind: 'blocked', reason: parsed.error };
  }
  const hostname = unbracket(parsed.url.hostname);
  if (isIP(hostname)) {
    return isPublicIpAddress(hostname)
      ? { address: hostname }
      : { kind: 'blocked', reason: `${hostname} is a prohibited non-public destination` };
  }

  let addresses: readonly ResolvedAddress[];
  try {
    addresses = await waitForResolution(dns.resolve(hostname), timeoutMs, signal);
  } catch (error) {
    if (signal.aborted) {
      return { kind: 'cancelled' };
    }
    return { kind: 'failed', reason: networkFailureMessage(error, 'DNS resolution failed') };
  }
  if (addresses.length === 0) {
    return { kind: 'failed', reason: 'DNS resolution returned no addresses' };
  }
  const invalid = addresses.find(
    (entry) => entry.family !== isIP(entry.address) || !isPublicIpAddress(entry.address),
  );
  if (invalid) {
    return {
      kind: 'blocked',
      reason: `${hostname} resolved to prohibited destination ${invalid.address}`,
    };
  }
  return { address: addresses[0].address };
}

function waitForResolution<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal: AbortSignal,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const onAbort = (): void => finish(() => reject(new Error('request cancelled')));
    const timeout = setTimeout(
      () => finish(() => reject(new Error(`request timed out after ${timeoutMs}ms`))),
      timeoutMs,
    );
    let settled = false;
    const finish = (complete: () => void): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal.removeEventListener('abort', onAbort);
      complete();
    };
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) {
      onAbort();
      return;
    }
    void promise.then(
      (value) => finish(() => resolve(value)),
      (error: unknown) => finish(() => reject(error)),
    );
  });
}

function parseHttpUrl(raw: string): { url: URL } | { error: string } {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'the URL is malformed' };
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { error: 'the URL uses a prohibited scheme' };
  }
  if (url.username || url.password) {
    return { error: 'the URL contains embedded credentials' };
  }
  const hostname = unbracket(url.hostname);
  if (!isValidHostname(hostname)) {
    return { error: 'the URL has a malformed or local-only hostname' };
  }
  return { url };
}

function isValidHostname(hostname: string): boolean {
  if (!hostname || hostname.includes('%')) {
    return false;
  }
  if (isIP(hostname)) {
    return true;
  }
  const normalized = hostname.toLowerCase().replace(/\.$/, '');
  if (
    !normalized.includes('.') ||
    normalized === 'localhost' ||
    normalized.endsWith('.localhost') ||
    /\.(local|localdomain|internal|home|lan)$/.test(normalized)
  ) {
    return false;
  }
  if (normalized.length > 253) {
    return false;
  }
  return normalized.split('.').every(
    (label) =>
      label.length > 0 &&
      label.length <= 63 &&
      /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/i.test(label),
  );
}

function isReachableStatus(status: number): boolean {
  return (status >= 200 && status <= 299) || status === 403;
}

function isRedirectStatus(status: number): boolean {
  return status >= 300 && status <= 399;
}

function diagnosticForResult(
  result: CheckResult,
  raw: string,
  range: SkillDiagnostic['range'],
): SkillDiagnostic | undefined {
  switch (result.kind) {
    case 'reachable':
    case 'cancelled':
      return undefined;
    case 'unavailable':
      return diag(
        DiagnosticCode.LinkRemoteUnavailable,
        'warning',
        `Remote link is unavailable (HTTP ${result.statusCode}): ${raw}`,
        range,
      );
    case 'failed':
      return diag(
        DiagnosticCode.LinkRemoteCheckFailed,
        'information',
        `Could not determine remote link availability for ${raw}: ${result.reason}.`,
        range,
      );
    case 'blocked':
      return diag(
        DiagnosticCode.LinkRemoteCheckBlocked,
        'warning',
        `Remote link was not requested because ${result.reason}: ${raw}`,
        range,
      );
  }
}

function networkFailureMessage(error: unknown, prefix?: string): string {
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return prefix ? `${prefix}: ${detail}` : detail;
}

function clampConcurrency(value: number): number {
  return Math.min(10, Math.max(1, Math.trunc(value) || 1));
}

class AsyncLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly maximum: number) {}

  run(task: () => Promise<CheckResult>, signal: AbortSignal): Promise<CheckResult> {
    return new Promise((resolve) => {
      const start = (): void => {
        if (signal.aborted) {
          resolve({ kind: 'cancelled' });
          this.release();
          return;
        }
        void task().then(resolve, (error: unknown) =>
          resolve({ kind: 'failed', reason: networkFailureMessage(error) }),
        ).finally(() => this.release());
      };
      this.queue.push(start);
      this.drain();
    });
  }

  private drain(): void {
    while (this.active < this.maximum && this.queue.length > 0) {
      this.active += 1;
      this.queue.shift()!();
    }
  }

  private release(): void {
    this.active -= 1;
    this.drain();
  }
}

/** Returns true only for globally routable addresses accepted by the checker. */
export function isPublicIpAddress(address: string): boolean {
  const normalized = unbracket(address.split('%')[0]);
  const family = isIP(normalized);
  if (family === 4) {
    return isPublicIpv4(ipv4Value(normalized));
  }
  if (family !== 6) {
    return false;
  }
  const value = ipv6Value(normalized);
  if (value === undefined) {
    return false;
  }

  // IPv4-mapped IPv6. Validate the embedded IPv4 rather than allowing a bypass.
  if (value >> 32n === 0xffffn) {
    return isPublicIpv4(Number(value & 0xffff_ffffn));
  }
  // The well-known NAT64 prefix also embeds an IPv4 destination.
  if (inIpv6Prefix(value, ipv6Value('64:ff9b::')!, 96)) {
    return isPublicIpv4(Number(value & 0xffff_ffffn));
  }

  const blocked: Array<[string, number]> = [
    ['::', 96], // unspecified and deprecated IPv4-compatible space
    ['64:ff9b:1::', 48], // local-use translation prefix
    ['100::', 64], // discard-only
    ['2001::', 32], // Teredo
    ['2001:2::', 48], // benchmarking
    ['2001:10::', 28], // deprecated ORCHID
    ['2001:20::', 28], // ORCHIDv2
    ['2001:db8::', 32], // documentation
    ['2002::', 16], // deprecated 6to4
    ['3fff::', 20], // documentation
    ['5f00::', 16], // segment-routing reserved block
    ['fc00::', 7], // unique-local
    ['fe80::', 10], // link-local
    ['fec0::', 10], // deprecated site-local
    ['ff00::', 8], // multicast
  ];
  return !blocked.some(([prefix, bits]) => inIpv6Prefix(value, ipv6Value(prefix)!, bits));
}

function isPublicIpv4(value: number): boolean {
  const blocked: Array<[number, number]> = [
    [ipv4Value('0.0.0.0'), 8],
    [ipv4Value('10.0.0.0'), 8],
    [ipv4Value('100.64.0.0'), 10],
    [ipv4Value('127.0.0.0'), 8],
    [ipv4Value('169.254.0.0'), 16],
    [ipv4Value('172.16.0.0'), 12],
    [ipv4Value('192.0.0.0'), 24],
    [ipv4Value('192.0.2.0'), 24],
    [ipv4Value('192.88.99.0'), 24],
    [ipv4Value('192.168.0.0'), 16],
    [ipv4Value('198.18.0.0'), 15],
    [ipv4Value('198.51.100.0'), 24],
    [ipv4Value('203.0.113.0'), 24],
    [ipv4Value('224.0.0.0'), 4],
    [ipv4Value('240.0.0.0'), 4],
  ];
  return !blocked.some(([prefix, bits]) => inIpv4Prefix(value, prefix, bits));
}

function ipv4Value(address: string): number {
  return address.split('.').reduce((value, octet) => (value << 8) + Number(octet), 0) >>> 0;
}

function inIpv4Prefix(value: number, prefix: number, bits: number): boolean {
  const shift = 32 - bits;
  return (value >>> shift) === (prefix >>> shift);
}

function ipv6Value(address: string): bigint | undefined {
  let normalized = unbracket(address).toLowerCase();
  const lastColon = normalized.lastIndexOf(':');
  const dottedTail = normalized.slice(lastColon + 1);
  if (dottedTail.includes('.')) {
    if (isIP(dottedTail) !== 4) return undefined;
    const embedded = ipv4Value(dottedTail);
    normalized = `${normalized.slice(0, lastColon + 1)}${(embedded >>> 16).toString(16)}:${(
      embedded & 0xffff
    ).toString(16)}`;
  }
  const halves = normalized.split('::');
  if (halves.length > 2) return undefined;
  const left = halves[0] ? halves[0].split(':') : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - left.length - right.length;
  if ((halves.length === 1 && missing !== 0) || missing < 0) return undefined;
  const parts = [...left, ...Array.from({ length: missing }, () => '0'), ...right];
  if (parts.length !== 8 || parts.some((part) => !/^[0-9a-f]{1,4}$/.test(part))) {
    return undefined;
  }
  return parts.reduce((value, part) => (value << 16n) + BigInt(`0x${part}`), 0n);
}

function inIpv6Prefix(value: bigint, prefix: bigint, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return value >> shift === prefix >> shift;
}

export function addressesEqual(left: string, right: string): boolean {
  const leftValue = canonicalAddress(left);
  const rightValue = canonicalAddress(right);
  return leftValue !== undefined && leftValue === rightValue;
}

function canonicalAddress(address: string): string | undefined {
  const normalized = unbracket(address.split('%')[0]);
  if (isIP(normalized) === 4) return `4:${ipv4Value(normalized)}`;
  const value = ipv6Value(normalized);
  if (value === undefined) return undefined;
  if (value >> 32n === 0xffffn) return `4:${Number(value & 0xffff_ffffn)}`;
  return `6:${value}`;
}

function unbracket(value: string): string {
  return value.startsWith('[') && value.endsWith(']') ? value.slice(1, -1) : value;
}
