import { describe, expect, it, vi } from 'vitest';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { genericProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import { augmentWithRemoteDiagnostics } from '../src/online/augmentRemoteDiagnostics';
import {
  RemoteLinkCheckSession,
  isPublicIpAddress,
  type RemoteHttpRequest,
  type RemoteLinkDependencies,
  type ResolvedAddress,
} from '../src/online/remoteLinkChecker';

const PUBLIC_IP = '93.184.216.34';

function document(...urls: string[]) {
  return parseSkillFile(
    '/workspace/demo/SKILL.md',
    `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n${urls
      .map((url, index) => `[link ${index}](${url})`)
      .join('\n')}`,
  );
}

function fakeDependencies(options: {
  response?: (request: RemoteHttpRequest) =>
    | { statusCode: number; location?: string; connectedAddress?: string }
    | Promise<{ statusCode: number; location?: string; connectedAddress?: string }>;
  resolve?: (hostname: string) => readonly ResolvedAddress[] | Promise<readonly ResolvedAddress[]>;
} = {}) {
  const requests: RemoteHttpRequest[] = [];
  const resolve = vi.fn(async (hostname: string) =>
    (await options.resolve?.(hostname)) ?? [{ address: PUBLIC_IP, family: 4 as const }],
  );
  const request = vi.fn(async (item: RemoteHttpRequest) => {
    requests.push(item);
    const response = (await options.response?.(item)) ?? { statusCode: 200 };
    return { ...response, connectedAddress: response.connectedAddress ?? item.address };
  });
  return {
    dependencies: { dns: { resolve }, transport: { request } } satisfies RemoteLinkDependencies,
    requests,
    resolve,
    request,
  };
}

async function diagnosticsFor(
  urls: string[],
  options: Parameters<typeof fakeDependencies>[0] = {},
  maximum = 4,
) {
  const fake = fakeDependencies(options);
  const session = new RemoteLinkCheckSession(fake.dependencies, { maxConcurrency: maximum });
  const diagnostics = await session.checkDocument(document(...urls));
  session.dispose();
  return { diagnostics, ...fake };
}

describe('remote link status behavior', () => {
  it.each([200, 204, 403])('accepts HTTP %s', async (statusCode) => {
    const { diagnostics } = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode }),
    });
    expect(diagnostics).toEqual([]);
  });

  it.each([
    [404, 'skill.link.remoteUnavailable'],
    [410, 'skill.link.remoteUnavailable'],
    [500, 'skill.link.remoteUnavailable'],
  ])('reports HTTP %s as unavailable', async (statusCode, code) => {
    const { diagnostics } = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: Number(statusCode) }),
    });
    expect(diagnostics).toMatchObject([{ code, severity: 'warning', kind: 'compatibility' }]);
    expect(diagnostics[0].message).toContain(`HTTP ${statusCode}`);
  });

  it.each([
    [301, '/final', 200],
    [302, 'https://other.example/final', 403],
  ])('accepts %s redirect to terminal %s', async (redirect, location, terminal) => {
    const { diagnostics, requests } = await diagnosticsFor(['https://example.com/start'], {
      response: ({ url }) =>
        url.pathname === '/start'
          ? { statusCode: Number(redirect), location: String(location) }
          : { statusCode: Number(terminal) },
    });
    expect(diagnostics).toEqual([]);
    expect(requests.map((request) => request.url.href)).toEqual([
      'https://example.com/start',
      new URL(String(location), 'https://example.com/start').href,
    ]);
  });

  it.each([405, 501])('falls back from HEAD %s to a range GET', async (statusCode) => {
    const { diagnostics, requests } = await diagnosticsFor(['https://example.com/a'], {
      response: ({ method }) => ({ statusCode: method === 'HEAD' ? statusCode : 200 }),
    });
    expect(diagnostics).toEqual([]);
    expect(requests.map(({ method }) => method)).toEqual(['HEAD', 'GET']);
    expect(requests[1].headers).toEqual({ Range: 'bytes=0-0' });
  });

  it('reports redirects without Location and redirect loops as indeterminate failures', async () => {
    const missing = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 301 }),
    });
    const loop = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 302, location: '/a' }),
    });
    for (const result of [missing, loop]) {
      expect(result.diagnostics).toMatchObject([
        {
          code: DiagnosticCode.LinkRemoteCheckFailed,
          severity: 'information',
          kind: 'compatibility',
        },
      ]);
    }
  });

  it('reports an invalid redirect Location as an indeterminate failure', async () => {
    const { diagnostics } = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 302, location: 'http://[' }),
    });
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckFailed });
    expect(diagnostics[0].message).toContain('valid URL');
  });

  it('reports redirect-limit exhaustion', async () => {
    const { diagnostics, requests } = await diagnosticsFor(['https://example.com/0'], {
      response: ({ url }) => ({
        statusCode: 301,
        location: `/${Number(url.pathname.slice(1)) + 1}`,
      }),
    });
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckFailed });
    expect(diagnostics[0].message).toContain('redirect limit');
    expect(requests).toHaveLength(6);
  });

  it.each(['request timed out', 'connection refused', 'TLS certificate failure'])(
    'does not claim a network failure is a broken link: %s',
    async (message) => {
      const { diagnostics } = await diagnosticsFor(['https://example.com/a'], {
        response: () => {
          throw new Error(message);
        },
      });
      expect(diagnostics).toMatchObject([
        { code: DiagnosticCode.LinkRemoteCheckFailed, severity: 'information' },
      ]);
      expect(diagnostics[0].message).toContain(message);
    },
  );

  it('reports DNS failures without issuing a request', async () => {
    const { diagnostics, request } = await diagnosticsFor(['https://example.com/a'], {
      resolve: () => {
        throw new Error('DNS unavailable');
      },
    });
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckFailed });
    expect(request).not.toHaveBeenCalled();
  });

  it('deduplicates normalized URLs while retaining occurrence diagnostics', async () => {
    const { diagnostics, request, resolve } = await diagnosticsFor([
      'HTTPS://EXAMPLE.COM:443/a#first',
      'https://example.com/a#second',
    ], {
      response: () => ({ statusCode: 404 }),
    });
    expect(request).toHaveBeenCalledOnce();
    expect(resolve).toHaveBeenCalledOnce();
    expect(diagnostics).toHaveLength(2);
    expect(diagnostics[0].range).not.toEqual(diagnostics[1].range);
  });

  it('bounds concurrency across all documents sharing a session', async () => {
    let active = 0;
    let maximum = 0;
    const fake = fakeDependencies({
      response: async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 5));
        active -= 1;
        return { statusCode: 200 };
      },
    });
    const session = new RemoteLinkCheckSession(fake.dependencies, { maxConcurrency: 2 });
    await Promise.all([
      session.checkDocument(document('https://a.example/1', 'https://b.example/2')),
      session.checkDocument(document('https://c.example/3', 'https://d.example/4')),
    ]);
    expect(maximum).toBe(2);
    session.dispose();
  });
});

describe('remote link SSRF protection', () => {
  it.each([
    '127.0.0.1',
    '10.1.2.3',
    '100.64.0.1',
    '169.254.169.254',
    '192.0.2.1',
    '198.18.0.1',
    '224.0.0.1',
    '::1',
    'fc00::1',
    'fe80::1',
    '::ffff:127.0.0.1',
    '2001:db8::1',
  ])('blocks direct non-public address %s', async (address) => {
    const host = address.includes(':') ? `[${address}]` : address;
    const { diagnostics, resolve, request } = await diagnosticsFor([`http://${host}/a`]);
    expect(diagnostics[0]).toMatchObject({
      code: DiagnosticCode.LinkRemoteCheckBlocked,
      severity: 'warning',
      kind: 'security',
    });
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('blocks private and mixed DNS answers before connecting', async () => {
    for (const addresses of [
      [{ address: '192.168.1.10', family: 4 as const }],
      [
        { address: PUBLIC_IP, family: 4 as const },
        { address: '10.0.0.5', family: 4 as const },
      ],
    ]) {
      const { diagnostics, request } = await diagnosticsFor(['https://example.com/a'], {
        resolve: () => addresses,
      });
      expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckBlocked });
      expect(request).not.toHaveBeenCalled();
    }
  });

  it('validates redirect destinations before connecting', async () => {
    const { diagnostics, requests } = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 302, location: 'http://169.254.169.254/latest' }),
    });
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckBlocked });
    expect(requests).toHaveLength(1);
  });

  it('rejects HTTPS-to-HTTP redirects before resolving the target', async () => {
    const { diagnostics, resolve, requests } = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 302, location: 'http://public.example/final' }),
    });
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckBlocked });
    expect(requests).toHaveLength(1);
    expect(resolve).toHaveBeenCalledOnce();
  });

  it('never checks protocol-relative URLs or unsupported schemes', async () => {
    const { diagnostics, resolve, request } = await diagnosticsFor([
      '//example.com/a',
      'ftp://example.com/a',
    ]);
    expect(diagnostics).toEqual([]);
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it.each([
    'http://user:password@example.com/a',
    'http://localhost/a',
    'http://service.internal/a',
  ])('blocks unsafe hostname or credential form %s without network work', async (url) => {
    const { diagnostics, resolve, request } = await diagnosticsFor([url]);
    expect(diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckBlocked });
    expect(resolve).not.toHaveBeenCalled();
    expect(request).not.toHaveBeenCalled();
  });

  it('connects to the validated address and rejects a different connected peer', async () => {
    const accepted = await diagnosticsFor(['https://example.com/a']);
    expect(accepted.requests[0].address).toBe(PUBLIC_IP);
    const changed = await diagnosticsFor(['https://example.com/a'], {
      response: () => ({ statusCode: 200, connectedAddress: '1.1.1.1' }),
    });
    expect(changed.diagnostics[0]).toMatchObject({ code: DiagnosticCode.LinkRemoteCheckBlocked });
  });

  it('classifies public and special-purpose IP representations', () => {
    expect(isPublicIpAddress(PUBLIC_IP)).toBe(true);
    expect(isPublicIpAddress('2606:4700:4700::1111')).toBe(true);
    expect(isPublicIpAddress('::ffff:93.184.216.34')).toBe(true);
    expect(isPublicIpAddress('::ffff:169.254.169.254')).toBe(false);
  });
});

describe('online augmentation opt-in boundary', () => {
  it('disabled full validation performs no DNS resolutions or requests', async () => {
    const analysis = analyzeSkill(
      '/workspace/demo/SKILL.md',
      `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n[x](https://example.com/a)`,
      genericProfile,
      { discover: () => [] },
    );
    const fake = fakeDependencies();
    const session = new RemoteLinkCheckSession(fake.dependencies, { maxConcurrency: 4 });
    const result = await augmentWithRemoteDiagnostics(analysis, genericProfile, false, session);
    expect(result).toBe(analysis);
    expect(fake.resolve).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
    session.dispose();
  });

  it('text-only core analysis never performs network work even beside an enabled session', () => {
    const fake = fakeDependencies();
    analyzeSkill(
      '/workspace/demo/SKILL.md',
      `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n[x](https://example.com/a)`,
      genericProfile,
      { mode: 'text-only' },
    );
    expect(fake.resolve).not.toHaveBeenCalled();
    expect(fake.request).not.toHaveBeenCalled();
  });

  it('applies severity overrides when online diagnostics are merged', async () => {
    const analysis = analyzeSkill(
      '/workspace/demo/SKILL.md',
      `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n[x](https://example.com/a)`,
      genericProfile,
      { discover: () => [] },
    );
    const fake = fakeDependencies({ response: () => ({ statusCode: 404 }) });
    const session = new RemoteLinkCheckSession(fake.dependencies, { maxConcurrency: 4 });
    const result = await augmentWithRemoteDiagnostics(
      analysis,
      {
        ...genericProfile,
        severityOverrides: { [DiagnosticCode.LinkRemoteUnavailable]: 'off' },
      },
      true,
      session,
    );
    expect(result.diagnostics.map((item) => item.code)).not.toContain(
      DiagnosticCode.LinkRemoteUnavailable,
    );
    expect(result.diagnostics.map((item) => item.code)).toContain(
      DiagnosticCode.LinkRemoteSuspicious,
    );
    session.dispose();
  });
});
