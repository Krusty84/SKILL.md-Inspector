import * as dns from 'node:dns/promises';
import * as http from 'node:http';
import * as https from 'node:https';
import * as net from 'node:net';
import * as tls from 'node:tls';
import {
  addressesEqual,
  isPublicIpAddress,
  RemoteTargetBlockedError,
  type RemoteHttpRequest,
  type RemoteHttpResponse,
  type RemoteLinkDependencies,
} from './remoteLinkChecker';

export const nodeRemoteLinkDependencies: RemoteLinkDependencies = {
  dns: {
    async resolve(hostname) {
      const [ipv4, ipv6] = await Promise.all([
        resolveFamily(() => dns.resolve4(hostname)),
        resolveFamily(() => dns.resolve6(hostname)),
      ]);
      return [
        ...ipv4.map((address) => ({ address, family: 4 as const })),
        ...ipv6.map((address) => ({ address, family: 6 as const })),
      ];
    },
  },
  transport: {
    request: requestValidatedAddress,
  },
};

/** Connects to the supplied IP first and releases no HTTP bytes until the peer is revalidated. */
function requestValidatedAddress(request: RemoteHttpRequest): Promise<RemoteHttpResponse> {
  return new Promise((resolve, reject) => {
    const isHttps = request.url.protocol === 'https:';
    const port = Number(request.url.port || (isHttps ? 443 : 80));
    const servername = request.url.hostname.replace(/^\[|\]$/g, '');
    const socket = isHttps
      ? tls.connect({ host: request.address, port, servername })
      : net.connect({ host: request.address, port });
    let nodeRequest: http.ClientRequest | undefined;
    let settled = false;

    const cleanup = (): void => {
      clearTimeout(timeout);
      request.signal?.removeEventListener('abort', onAbort);
    };
    const fail = (error: Error): void => {
      if (settled) return;
      settled = true;
      cleanup();
      nodeRequest?.destroy();
      socket.destroy();
      reject(error);
    };
    const onAbort = (): void => fail(new Error('request cancelled'));
    const timeout = setTimeout(
      () => fail(new Error(`request timed out after ${request.timeoutMs}ms`)),
      request.timeoutMs,
    );
    socket.once('error', fail);
    request.signal?.addEventListener('abort', onAbort, { once: true });
    if (request.signal?.aborted) {
      onAbort();
      return;
    }

    socket.once(isHttps ? 'secureConnect' : 'connect', () => {
      const connectedAddress = socket.remoteAddress;
      if (
        !connectedAddress ||
        !isPublicIpAddress(connectedAddress) ||
        !addressesEqual(connectedAddress, request.address)
      ) {
        fail(
          new RemoteTargetBlockedError(
            'the connected socket did not use the validated public address',
          ),
        );
        return;
      }

      const client = isHttps ? https : http;
      nodeRequest = client.request(
        {
          protocol: request.url.protocol,
          hostname: request.address,
          port,
          method: request.method,
          path: `${request.url.pathname}${request.url.search}`,
          headers: {
            Host: request.url.host,
            Accept: '*/*',
            'User-Agent': 'SKILL.md-Inspector/remote-link-check',
            ...request.headers,
          },
          agent: false,
          createConnection: () => socket,
          ...(isHttps ? { servername } : {}),
        },
        (response) => {
          response.destroy();
          if (settled) return;
          settled = true;
          cleanup();
          const location = Array.isArray(response.headers.location)
            ? response.headers.location[0]
            : response.headers.location;
          resolve({
            statusCode: response.statusCode ?? 0,
            ...(location ? { location } : {}),
            connectedAddress,
          });
        },
      );
      nodeRequest.once('error', fail);
      nodeRequest.end();
    });
  });
}

async function resolveFamily(resolve: () => Promise<string[]>): Promise<string[]> {
  try {
    return await resolve();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code === 'ENODATA' || code === 'ENOTFOUND') return [];
    throw error;
  }
}
