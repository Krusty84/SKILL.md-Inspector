import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { RemoteLinkDependencies } from '../src/online/remoteLinkChecker';

const hoisted = vi.hoisted(() => ({
  onlineEnabled: false,
  maximum: 4,
  published: new Map<string, Array<{ code?: string }>>(),
  workspaceDocuments: [] as Array<{ uri: { toString(): string } }>,
}));

vi.mock('vscode', () => {
  class Position {
    constructor(
      readonly line: number,
      readonly character: number,
    ) {}
  }
  class Range {
    constructor(..._args: unknown[]) {}
  }
  class Diagnostic {
    source?: string;
    code?: string;
    constructor(
      readonly range: Range,
      readonly message: string,
      readonly severity: number,
    ) {}
  }
  return {
    Position,
    Range,
    Diagnostic,
    DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2 },
    languages: {
      createDiagnosticCollection: () => ({
        set: (uri: { toString(): string }, diagnostics: Array<{ code?: string }>) =>
          hoisted.published.set(uri.toString(), diagnostics),
        delete: (uri: { toString(): string }) => hoisted.published.delete(uri.toString()),
        dispose: vi.fn(),
      }),
    },
    workspace: {
      workspaceFolders: [],
      findFiles: async () => hoisted.workspaceDocuments.map((document) => document.uri),
      openTextDocument: async (uri: { toString(): string }) =>
        hoisted.workspaceDocuments.find((document) => document.uri.toString() === uri.toString()),
      getConfiguration: () => ({
        get: (key: string, fallback?: unknown) => {
          if (key === 'links.onlineCheck.enabled') return hoisted.onlineEnabled;
          if (key === 'links.onlineCheck.maxConcurrency') return hoisted.maximum;
          return fallback;
        },
      }),
    },
  };
});

import { readConfig } from '../src/config';
import { DiagnosticsProvider } from '../src/diagnostics/diagnosticsProvider';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

function textDocument(
  filePath = '/workspace/demo/SKILL.md',
  url = 'https://example.com/a',
) {
  const state = {
    version: 1,
    content:
      `---\nname: demo\ndescription: Check links. Use when auditing docs. Do not use for deployment.\n---\n\n[x](${url})`,
  };
  const uri = {
    scheme: 'file',
    fsPath: filePath,
    toString: () => `file://${filePath}`,
  };
  return {
    state,
    document: {
      uri,
      get version() {
        return state.version;
      },
      getText: () => state.content,
      lineCount: state.content.split('\n').length,
      lineAt: (line: number) => ({ text: state.content.split('\n')[line] ?? '' }),
    },
  };
}

beforeEach(() => {
  hoisted.onlineEnabled = false;
  hoisted.maximum = 4;
  hoisted.published.clear();
  hoisted.workspaceDocuments = [];
});

describe('DiagnosticsProvider online validation boundary', () => {
  it('resolves online settings to disabled and concurrency four by default', () => {
    const config = readConfig();
    expect(config.onlineCheckEnabled).toBe(false);
    expect(config.onlineCheckMaxConcurrency).toBe(4);
  });

  it('does no network work for disabled full validation', async () => {
    const dependencies: RemoteLinkDependencies = {
      dns: { resolve: vi.fn() },
      transport: { request: vi.fn() },
    };
    const provider = new DiagnosticsProvider(dependencies);
    await provider.validate(textDocument().document as never);
    expect(dependencies.dns.resolve).not.toHaveBeenCalled();
    expect(dependencies.transport.request).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('does no network work in text-only mode when online checking is enabled', async () => {
    hoisted.onlineEnabled = true;
    const dependencies: RemoteLinkDependencies = {
      dns: { resolve: vi.fn() },
      transport: { request: vi.fn() },
    };
    const provider = new DiagnosticsProvider(dependencies);
    await provider.validate(textDocument().document as never, { mode: 'text-only' });
    expect(dependencies.dns.resolve).not.toHaveBeenCalled();
    expect(dependencies.transport.request).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('does no network work for the typing path even when online checking is enabled', async () => {
    hoisted.onlineEnabled = true;
    const dependencies: RemoteLinkDependencies = {
      dns: { resolve: vi.fn() },
      transport: { request: vi.fn() },
    };
    const provider = new DiagnosticsProvider(dependencies);
    // The debounced while-typing runs use full mode with online disabled.
    await provider.validate(textDocument().document as never, { online: false });
    expect(dependencies.dns.resolve).not.toHaveBeenCalled();
    expect(dependencies.transport.request).not.toHaveBeenCalled();
    provider.dispose();
  });

  it('keeps filesystem diagnostics live on the typing path where text-only drops them', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = textDocument('/workspace/demo/SKILL.md', 'references/missing.md');

    // The old typing path: filesystem rules skipped, so the missing-link error
    // is absent — the "diagnostics vanish 300ms after a keystroke" flicker.
    await provider.validate(document as never, { mode: 'text-only' });
    const textOnly = hoisted.published.get(document.uri.toString()) ?? [];
    expect(textOnly.map((item) => item.code)).not.toContain(DiagnosticCode.LinkMissing);

    // The typing path now: full mode served from caches keeps it visible.
    await provider.validate(document as never, { online: false });
    const typing = hoisted.published.get(document.uri.toString()) ?? [];
    expect(typing.map((item) => item.code)).toContain(DiagnosticCode.LinkMissing);
    provider.dispose();
  });

  it('prevents an older document result from overwriting newer diagnostics', async () => {
    hoisted.onlineEnabled = true;
    let releaseFirst: (() => void) | undefined;
    let requestCount = 0;
    const dependencies: RemoteLinkDependencies = {
      dns: {
        resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
      },
      transport: {
        request: vi.fn(async ({ address }) => {
          requestCount += 1;
          if (requestCount === 1) {
            await new Promise<void>((resolve) => {
              releaseFirst = resolve;
            });
            return { statusCode: 200, connectedAddress: address };
          }
          return { statusCode: 404, connectedAddress: address };
        }),
      },
    };
    const provider = new DiagnosticsProvider(dependencies);
    const { document, state } = textDocument();

    const older = provider.validate(document as never);
    await vi.waitFor(() => expect(requestCount).toBe(1));
    state.version = 2;
    const newer = provider.validate(document as never);
    await newer;
    releaseFirst?.();
    await older;

    const published = hoisted.published.get(document.uri.toString()) ?? [];
    expect(published.map((item) => item.code)).toContain(DiagnosticCode.LinkRemoteUnavailable);
    provider.dispose();
  });

  it('uses one concurrency bound across a complete workspace validation', async () => {
    hoisted.onlineEnabled = true;
    hoisted.maximum = 2;
    hoisted.workspaceDocuments = Array.from({ length: 5 }, (_, index) =>
      textDocument(
        `/workspace/skill-${index}/SKILL.md`,
        `https://host-${index}.example/link`,
      ).document,
    );
    let active = 0;
    let maximum = 0;
    const dependencies: RemoteLinkDependencies = {
      dns: {
        resolve: vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }]),
      },
      transport: {
        request: vi.fn(async ({ address }) => {
          active += 1;
          maximum = Math.max(maximum, active);
          await new Promise((resolve) => setTimeout(resolve, 5));
          active -= 1;
          return { statusCode: 200, connectedAddress: address };
        }),
      },
    };
    const provider = new DiagnosticsProvider(dependencies);
    const result = await provider.validateWorkspace();
    expect(result).toEqual({ processed: 5, total: 5, cancelled: false });
    expect(maximum).toBe(2);
    provider.dispose();
  });
});
