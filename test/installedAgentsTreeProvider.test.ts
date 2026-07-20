import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  emitters: [] as { fire: ReturnType<typeof vi.fn> }[],
  progressError: undefined as Error | undefined,
}));

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly fsPath: string) {}
    static file(value: string): Uri {
      return new Uri(value);
    }
    static parse(value: string): Uri {
      return new Uri(value.replace(/^file:\/\//, ''));
    }
    toString(): string {
      return `file://${this.fsPath}`;
    }
  }
  class TreeItem {
    resourceUri?: Uri;
    description?: string;
    tooltip?: string;
    command?: unknown;
    contextValue?: string;
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
      constructor() {
        testState.emitters.push(this);
      }
    },
    workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn(() => []) })) },
    window: {
      showWarningMessage: vi.fn(),
      withProgress: vi.fn((_options, task) =>
        testState.progressError ? Promise.reject(testState.progressError) : task(),
      ),
    },
  };
});

vi.mock('../src/navigator/builtInAgentSources', () => ({
  resolveBuiltInAgentSources: vi.fn(() => [
    {
      id: 'skills',
      agentId: 'agent',
      agentLabel: 'Agent',
      groupLabel: 'Skills',
      rootPath: '/skills',
      files: ['SKILL.md'],
      recursive: true,
    },
  ]),
}));

vi.mock('../src/navigator/discoverExternalFiles', () => ({ discoverExternalFiles: vi.fn() }));

import * as vscode from 'vscode';
import {
  deduplicateDiscoveredFiles,
  InstalledAgentsTreeProvider,
} from '../src/ui/installedAgentsTreeProvider';
import { discoverExternalFiles } from '../src/navigator/discoverExternalFiles';
import type { DiscoveredFile } from '../src/navigator/types';

function file(fileName: DiscoveredFile['fileName'], absolutePath: string): DiscoveredFile {
  return {
    sourceId: 'source',
    sourceLabel: 'Agent/Group',
    fileName,
    absolutePath,
    relativePath: fileName,
  };
}

const provider = new InstalledAgentsTreeProvider(
  { globalState: { get: vi.fn(() => []) } } as never,
  { appendLine: vi.fn() } as never,
);

beforeEach(() => {
  testState.progressError = undefined;
  vi.mocked(discoverExternalFiles).mockReset();
});

describe('InstalledAgentsTreeProvider file items', () => {
  it.each([
    ['SKILL.md', '/tmp/example-skill/SKILL.md', 'example-skill'],
    ['AGENTS.md', '/tmp/AGENTS.md', 'AGENTS.md'],
    ['CLAUDE.md', '/tmp/CLAUDE.md', 'CLAUDE.md'],
  ] as const)(
    'labels %s correctly and lets the file icon theme resolve its icon',
    (fileName, absolutePath, label) => {
      const item = provider.getTreeItem({
        type: 'file',
        file: file(fileName, absolutePath),
        favorite: fileName === 'SKILL.md',
      });

      expect(item.label).toBe(label);
      expect(item.resourceUri?.fsPath).toBe(absolutePath);
      expect(item.iconPath).toBeUndefined();
      expect(item.contextValue).toBe(
        fileName === 'SKILL.md'
          ? 'skillMdInspector.favoriteSkillFile'
          : 'skillMdInspector.installedAgentsFile',
      );
    },
  );

  it('deduplicates canonical files while preserving the first source', () => {
    const first = file('SKILL.md', '/real/skills/example/SKILL.md');
    const duplicate = { ...first, sourceId: 'other' };
    expect(deduplicateDiscoveredFiles([first, duplicate])).toEqual([first]);
    expect(
      deduplicateDiscoveredFiles(
        [
          { ...first, absolutePath: 'C:\\Skills\\SKILL.md' },
          { ...duplicate, absolutePath: 'c:\\skills\\skill.md' },
        ],
        'win32',
      ),
    ).toHaveLength(1);
  });
});

describe('InstalledAgentsTreeProvider loading', () => {
  it('shows a spinner, emits completion, and reuses the active discovery', async () => {
    let resolveDiscovery!: (value: { files: DiscoveredFile[]; messages: string[] }) => void;
    vi.mocked(discoverExternalFiles).mockReturnValue(
      new Promise((resolve) => {
        resolveDiscovery = resolve;
      }),
    );
    const output = { appendLine: vi.fn() };
    const loadingProvider = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => []) } } as never,
      output as never,
    );

    const [loading] = loadingProvider.getChildren();
    const item = loadingProvider.getTreeItem(loading!);
    const first = loadingProvider.refresh();
    const second = loadingProvider.refresh();

    expect(loading).toEqual({ type: 'loading', label: 'Discovering installed agent skills…' });
    expect((item.iconPath as { id: string }).id).toBe('loading~spin');
    expect(item.command).toBeUndefined();
    expect(first).toBe(second);
    const refreshesBeforeCompletion = testState.emitters.at(-1)?.fire.mock.calls.length ?? 0;
    resolveDiscovery({ files: [file('SKILL.md', '/skills/example/SKILL.md')], messages: [] });
    await first;
    expect(discoverExternalFiles).toHaveBeenCalledTimes(1);
    expect(testState.emitters.at(-1)?.fire.mock.calls.length).toBeGreaterThan(
      refreshesBeforeCompletion,
    );
    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      { location: { viewId: 'skillMdInspectorInstalledAgents' } },
      expect.any(Function),
    );
    expect(loadingProvider.getChildren()).toEqual([
      expect.objectContaining({ type: 'agent', label: 'Agent' }),
    ]);
  });

  it('keeps cached results during refresh and allows retry after failure', async () => {
    vi.mocked(discoverExternalFiles).mockResolvedValue({
      files: [file('SKILL.md', '/skills/example/SKILL.md')],
      messages: [],
    });
    const output = { appendLine: vi.fn() };
    const loadingProvider = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => []) } } as never,
      output as never,
    );
    await loadingProvider.refresh();

    let resolveRefresh!: (value: { files: DiscoveredFile[]; messages: string[] }) => void;
    vi.mocked(discoverExternalFiles).mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      }),
    );
    const refresh = loadingProvider.refresh();
    expect(loadingProvider.getChildren()).toEqual([
      expect.objectContaining({ type: 'agent', label: 'Agent' }),
    ]);
    resolveRefresh({ files: [file('SKILL.md', '/skills/example/SKILL.md')], messages: [] });
    await refresh;

    testState.progressError = new Error('failed');
    await expect(loadingProvider.refresh()).rejects.toThrow('failed');
    expect(loadingProvider.getChildren()).toEqual([
      expect.objectContaining({ type: 'agent', label: 'Agent' }),
    ]);
    testState.progressError = undefined;
    await loadingProvider.refresh();
    expect(output.appendLine).toHaveBeenCalledWith(
      expect.stringContaining('Installed agent skills discovery failed'),
    );
  });
});
