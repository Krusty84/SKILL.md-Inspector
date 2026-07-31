import { describe, expect, it, vi } from 'vitest';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';
import {
  RemoteLinkCheckSession,
  type RemoteHttpRequest,
  type RemoteLinkDependencies,
  type ResolvedAddress,
} from '../../src/online/remoteLinkChecker';

/**
 * Plan 17 Parts G and H. The limiter's `release → drain → start → release`
 * chain recurses synchronously, so cancelling a large queue overflowed the stack
 * and left every queued `run()` promise unsettled — `checkDocument`'s
 * `Promise.all` then never resolved. And only `addresses[0]` was ever tried, so
 * on an IPv6-only network every dual-stack host reported unavailable after the
 * full 10 s timeout.
 */

const PUBLIC_IPV4 = '93.184.216.34';
const PUBLIC_IPV6 = '2606:2800:220:1:248:1893:25c8:1946';

function document(...urls: string[]) {
  return parseSkillFile(
    '/workspace/demo/SKILL.md',
    `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n${urls
      .map((url, index) => `[link ${index}](${url})`)
      .join('\n')}`,
  );
}

function dependencies(options: {
  resolve?: () => readonly ResolvedAddress[];
  request?: (request: RemoteHttpRequest) => Promise<{ statusCode: number; connectedAddress?: string }>;
}): RemoteLinkDependencies {
  return {
    dns: {
      resolve: vi.fn(async () => options.resolve?.() ?? [{ address: PUBLIC_IPV4, family: 4 as const }]),
    },
    transport: {
      request: vi.fn(async (item: RemoteHttpRequest) => {
        const response = (await options.request?.(item)) ?? { statusCode: 200 };
        return { ...response, connectedAddress: response.connectedAddress ?? item.address };
      }),
    },
  };
}

describe('G — cancelling a large queue settles every promise', () => {
  it('settles 5,000 queued checks without a RangeError', async () => {
    const session = new RemoteLinkCheckSession(
      // Never settles on its own; only cancellation can release these.
      dependencies({ request: () => new Promise(() => {}) }),
      { maxConcurrency: 1 },
    );
    const urls = Array.from({ length: 5_000 }, (_, i) => `https://example.com/page-${i}`);
    const pending = session.checkDocument(document(...urls));
    session.dispose();
    // The assertion is that this resolves at all: an unsettled queued promise
    // leaves `Promise.all` hanging, and the recursion threw before that.
    await expect(pending).resolves.toBeInstanceOf(Array);
  });
});

describe('H — every validated address is tried, not only the first', () => {
  it('falls through to the next address when the first is unreachable', async () => {
    const tried: string[] = [];
    const session = new RemoteLinkCheckSession(
      dependencies({
        resolve: () => [
          { address: PUBLIC_IPV4, family: 4 },
          { address: PUBLIC_IPV6, family: 6 },
        ],
        request: async (item) => {
          tried.push(item.address);
          if (item.address === PUBLIC_IPV4) {
            throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
          }
          return { statusCode: 200 };
        },
      }),
      { maxConcurrency: 1 },
    );
    try {
      const diagnostics = await session.checkDocument(document('https://example.com/'));
      expect(tried).toContain(PUBLIC_IPV4);
      expect(tried).toContain(PUBLIC_IPV6);
      expect(diagnostics).toHaveLength(0);
    } finally {
      session.dispose();
    }
  });

  it('reports a failure only when every address fails', async () => {
    const session = new RemoteLinkCheckSession(
      dependencies({
        resolve: () => [
          { address: PUBLIC_IPV4, family: 4 },
          { address: PUBLIC_IPV6, family: 6 },
        ],
        request: async () => {
          throw Object.assign(new Error('connect EHOSTUNREACH'), { code: 'EHOSTUNREACH' });
        },
      }),
      { maxConcurrency: 1 },
    );
    try {
      const diagnostics = await session.checkDocument(document('https://example.com/'));
      expect(diagnostics.map((d) => d.code)).toContain(DiagnosticCode.LinkRemoteCheckFailed);
    } finally {
      session.dispose();
    }
  });

  it('still blocks when any resolved address is prohibited', async () => {
    const session = new RemoteLinkCheckSession(
      dependencies({
        resolve: () => [
          { address: PUBLIC_IPV4, family: 4 },
          { address: '127.0.0.1', family: 4 },
        ],
      }),
      { maxConcurrency: 1 },
    );
    try {
      const diagnostics = await session.checkDocument(document('https://example.com/'));
      expect(diagnostics.map((d) => d.code)).toContain(DiagnosticCode.LinkRemoteCheckBlocked);
    } finally {
      session.dispose();
    }
  });
});
