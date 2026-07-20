import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  folder: undefined as any,
  watchers: [] as any[],
  emitters: [] as { fire: ReturnType<typeof vi.fn> }[],
}));

vi.mock('vscode', () => {
  class Uri {
    readonly scheme: string;
    readonly path: string;
    constructor(readonly value: string) {
      const parsed = new URL(value);
      this.scheme = parsed.protocol.slice(0, -1);
      this.path = parsed.pathname;
    }
    static parse(value: string): Uri {
      return new Uri(value);
    }
    toString(): string {
      return this.value;
    }
  }
  class TreeItem {
    id?: string;
    resourceUri?: Uri;
    contextValue?: string;
    description?: string;
    tooltip?: string;
    command?: unknown;
    iconPath?: unknown;
    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }
  return {
    Uri,
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
      dispose = vi.fn();
      constructor() {
        state.emitters.push(this);
      }
    },
    RelativePattern: class {
      constructor(
        readonly base: Uri,
        readonly pattern: string,
      ) {}
    },
    commands: { executeCommand: vi.fn(async () => undefined) },
    window: {
      withProgress: vi.fn((_options, task) => task()),
      showWarningMessage: vi.fn(),
    },
    workspace: {
      getConfiguration: vi.fn(() => ({ get: vi.fn((_key, fallback) => fallback) })),
      createFileSystemWatcher: vi.fn(() => {
        const watcher = {
          create: undefined as (() => void) | undefined,
          change: undefined as (() => void) | undefined,
          delete: undefined as (() => void) | undefined,
          onDidCreate: vi.fn((handler) => (watcher.create = handler)),
          onDidChange: vi.fn((handler) => (watcher.change = handler)),
          onDidDelete: vi.fn((handler) => (watcher.delete = handler)),
          dispose: vi.fn(),
        };
        state.watchers.push(watcher);
        return watcher;
      }),
    },
  };
});

vi.mock('../src/opencode/sessionDiscovery', () => ({
  DEFAULT_OPEN_CODE_DISCOVERY: {
    maxFileSizeBytes: 1,
    maxDiscoveredSessions: 1,
    scanRecursively: true,
    maxPreviewCharacters: 1000,
  },
  discoverOpenCodeSessions: vi.fn(),
}));

import * as vscode from 'vscode';
import { discoverOpenCodeSessions } from '../src/opencode/sessionDiscovery';
import { OpenCodeSessionsTreeProvider } from '../src/ui/openCodeSessionsTreeProvider';
import type { SessionSummary } from '../src/opencode/model';

function session(title: string): SessionSummary {
  const uri = vscode.Uri.parse(`file:///${title}.json`);
  return {
    uri,
    uriString: uri.toString(),
    fileName: `${title}.json`,
    size: 10,
    mtime: 1,
    title,
    toolCalls: 0,
    skillCalls: 0,
    errors: 0,
    children: [],
  };
}

function provider(): OpenCodeSessionsTreeProvider {
  return new OpenCodeSessionsTreeProvider(
    { get: () => state.folder } as never,
    { appendLine: vi.fn() } as never,
  );
}

beforeEach(() => {
  state.folder = vscode.Uri.parse('file:///sessions');
  state.watchers = [];
  state.emitters = [];
  vi.mocked(discoverOpenCodeSessions).mockReset();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('OpenCodeSessionsTreeProvider loading', () => {
  it('shows a spinner, reuses the active scan, and retains sessions during refresh', async () => {
    let resolveInitial!: (sessions: SessionSummary[]) => void;
    vi.mocked(discoverOpenCodeSessions).mockReturnValue(
      new Promise((resolve) => {
        resolveInitial = resolve;
      }),
    );
    const tree = provider();

    const [loading] = tree.getChildren();
    const first = tree.refresh();
    const second = tree.refresh();

    expect(first).toBe(second);
    expect(loading?.label).toBe('Scanning OpenCode sessions…');
    expect((loading?.iconPath as { id: string }).id).toBe('loading~spin');
    expect(loading?.command).toBeUndefined();
    expect(loading?.resourceUri).toBeUndefined();
    resolveInitial([session('existing')]);
    await first;
    expect(discoverOpenCodeSessions).toHaveBeenCalledTimes(1);
    expect(state.emitters.at(-1)?.fire).toHaveBeenCalled();
    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      { location: { viewId: 'skillMdInspectorOpenCodeSessions' } },
      expect.any(Function),
    );

    let resolveRefresh!: (sessions: SessionSummary[]) => void;
    vi.mocked(discoverOpenCodeSessions).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const refresh = tree.refresh();
    expect(tree.getChildren().map((item) => item.label)).toEqual(['existing']);
    resolveRefresh([session('updated')]);
    await refresh;
    expect(tree.getChildren().map((item) => item.label)).toEqual(['updated']);
  });

  it('debounces watcher events and disposes a pending timer', async () => {
    vi.useFakeTimers();
    vi.mocked(discoverOpenCodeSessions).mockResolvedValue([session('existing')]);
    const tree = provider();
    await tree.refresh();
    const watcher = state.watchers.at(-1)!;

    watcher.create();
    watcher.change();
    watcher.delete();
    await vi.advanceTimersByTimeAsync(249);
    expect(discoverOpenCodeSessions).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    await Promise.resolve();
    expect(discoverOpenCodeSessions).toHaveBeenCalledTimes(2);

    state.watchers.at(-1)!.change();
    tree.dispose();
    await vi.advanceTimersByTimeAsync(250);
    expect(discoverOpenCodeSessions).toHaveBeenCalledTimes(2);
  });

  it('clears a failed scan so a later refresh can retry', async () => {
    vi.mocked(discoverOpenCodeSessions).mockRejectedValueOnce(new Error('failed'));
    const tree = provider();
    await tree.refresh();

    vi.mocked(discoverOpenCodeSessions).mockResolvedValue([session('retry')]);
    await tree.refresh();
    expect(discoverOpenCodeSessions).toHaveBeenCalledTimes(2);
    expect(tree.getChildren().map((item) => item.label)).toEqual(['retry']);
  });
});
