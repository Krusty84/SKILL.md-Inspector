import { beforeEach, describe, expect, it, vi } from 'vitest';

const testState = vi.hoisted(() => ({
  emitters: [] as { fire: ReturnType<typeof vi.fn> }[],
  progressError: undefined as Error | undefined,
  fsEntries: new Map<string, [string, number][]>(),
}));

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly fsPath: string) {}
    get path(): string {
      return this.fsPath;
    }
    static file(value: string): Uri {
      return new Uri(value);
    }
    static parse(value: string): Uri {
      return new Uri(value.replace(/^file:\/\//, ''));
    }
    static joinPath(parent: Uri, ...parts: string[]): Uri {
      return new Uri([parent.fsPath.replace(/\/$/, ''), ...parts].join('/'));
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
    FileType: { File: 1, Directory: 2 },
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
    workspace: {
      getConfiguration: vi.fn(() => ({ get: vi.fn(() => []) })),
      fs: {
        readDirectory: vi.fn((uri: { toString(): string }) => {
          const entries = testState.fsEntries.get(uri.toString());
          return entries ? Promise.resolve(entries) : Promise.reject(new Error('missing'));
        }),
      },
    },
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
  type InstalledAgentsNode,
} from '../src/ui/installedAgentsTreeProvider';
import { discoverExternalFiles } from '../src/navigator/discoverExternalFiles';
import { resolveBuiltInAgentSources } from '../src/navigator/builtInAgentSources';
import type { AgentSource, DiscoveredFile } from '../src/navigator/types';

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
    ['AGENTS.md', '/tmp/AGENTS.md', 'AGENTS.md'],
    ['CLAUDE.md', '/tmp/CLAUDE.md', 'CLAUDE.md'],
  ] as const)(
    'labels %s correctly and lets the file icon theme resolve its icon',
    (fileName, absolutePath, label) => {
      const item = provider.getTreeItem({
        type: 'file',
        file: file(fileName, absolutePath),
        favorite: false,
      });

      expect(item.label).toBe(label);
      expect(item.resourceUri?.fsPath).toBe(absolutePath);
      expect(item.iconPath).toBeUndefined();
      expect(item.contextValue).toBe('skillMdInspector.installedAgentsFile');
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

describe('InstalledAgentsTreeProvider skill folders', () => {
  async function loadWith(
    files: DiscoveredFile[],
    favorites: { uri: string }[] = [],
  ): Promise<InstalledAgentsTreeProvider> {
    vi.mocked(discoverExternalFiles).mockResolvedValue({ files, messages: [] });
    const created = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => favorites) } } as never,
      { appendLine: vi.fn() } as never,
    );
    await created.refresh();
    return created;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async function skillNodeOf(p: InstalledAgentsTreeProvider): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = (await p.getChildren()) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [group] = (await p.getChildren(agent)) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [skill] = (await p.getChildren(group)) as any[];
    return skill;
  }

  beforeEach(() => {
    testState.fsEntries.clear();
  });

  it('renders each SKILL.md as a collapsible folder named after its directory', async () => {
    const p = await loadWith([file('SKILL.md', '/skills/example/SKILL.md')]);
    const skill = await skillNodeOf(p);

    expect(skill).toMatchObject({
      type: 'skill',
      name: 'example',
      skillMdPath: '/skills/example/SKILL.md',
    });
    expect(skill.uri.fsPath).toBe('/skills/example');

    const item = p.getTreeItem(skill);
    expect(item.label).toBe('example');
    expect(item.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(item.resourceUri?.fsPath).toBe('/skills/example');
    expect(item.iconPath).toBeUndefined();
    expect(item.contextValue).toBe('skillMdInspector.skillFolder');
  });

  it('keeps AGENTS.md as a leaf rather than a folder', async () => {
    const p = await loadWith([file('AGENTS.md', '/skills/AGENTS.md')]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = (await p.getChildren()) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [group] = (await p.getChildren(agent)) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [leaf] = (await p.getChildren(group)) as any[];
    expect(leaf.type).toBe('file');
  });

  it('lists the real folder contents (directories first) when expanded', async () => {
    testState.fsEntries.set('file:///skills/example', [
      ['SKILL.md', vscode.FileType.File],
      ['references', vscode.FileType.Directory],
    ]);
    const p = await loadWith(
      [file('SKILL.md', '/skills/example/SKILL.md')],
      [{ uri: 'file:///skills/example/SKILL.md' }],
    );
    const skill = await skillNodeOf(p);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (await p.getChildren(skill)) as any[];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(children.map((c: any) => [c.type, c.name])).toEqual([
      ['workspaceDirectory', 'references'],
      ['workspaceFile', 'SKILL.md'],
    ]);

    const dirItem = p.getTreeItem(children[0]);
    expect(dirItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.Collapsed);
    expect(dirItem.contextValue).toBe('skillMdInspector.installedAgentsDirectory');
    expect(dirItem.command).toBeUndefined();

    const skillItem = p.getTreeItem(children[1]);
    expect(skillItem.label).toBe('SKILL.md');
    expect(skillItem.collapsibleState).toBe(vscode.TreeItemCollapsibleState.None);
    expect(skillItem.contextValue).toBe('skillMdInspector.favoriteSkillFile');
    expect((skillItem.command as { command: string }).command).toBe('vscode.open');
  });

  it('expands nested subfolders (recursion)', async () => {
    testState.fsEntries.set('file:///skills/example', [
      ['references', vscode.FileType.Directory],
    ]);
    testState.fsEntries.set('file:///skills/example/references', [
      ['guide.md', vscode.FileType.File],
    ]);
    const p = await loadWith([file('SKILL.md', '/skills/example/SKILL.md')]);
    const skill = await skillNodeOf(p);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [references] = (await p.getChildren(skill)) as any[];
    expect(references).toMatchObject({ type: 'workspaceDirectory', name: 'references' });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const nested = (await p.getChildren(references)) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect(nested.map((c: any) => c.name)).toEqual(['guide.md']);
    expect(p.getTreeItem(nested[0]).contextValue).toBe('skillMdInspector.installedAgentsFile');
  });

  it('shows a message node when a skill folder cannot be read', async () => {
    const append = vi.fn();
    vi.mocked(discoverExternalFiles).mockResolvedValue({
      files: [file('SKILL.md', '/skills/example/SKILL.md')],
      messages: [],
    });
    const p = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => []) } } as never,
      { appendLine: append } as never,
    );
    await p.refresh();
    const skill = await skillNodeOf(p);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const children = (await p.getChildren(skill)) as any[];
    expect(children).toEqual([{ type: 'message', label: 'Unable to read this folder.' }]);
    expect(append).toHaveBeenCalledWith(
      expect.stringContaining('Unable to read installed skill folder'),
    );
  });
});

describe('InstalledAgentsTreeProvider.resolveSkillMdPathsForNode', () => {
  async function providerWith(files: DiscoveredFile[]): Promise<InstalledAgentsTreeProvider> {
    vi.mocked(discoverExternalFiles).mockResolvedValue({ files, messages: [] });
    const p = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => []) } } as never,
      { appendLine: vi.fn() } as never,
    );
    await p.refresh();
    return p;
  }

  it('resolves a skill folder node to its own SKILL.md', async () => {
    const p = await providerWith([file('SKILL.md', '/skills/example/SKILL.md')]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = (await p.getChildren()) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [group] = (await p.getChildren(agent)) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [skill] = (await p.getChildren(group)) as any[];
    expect(p.resolveSkillMdPathsForNode(skill)).toEqual(['/skills/example/SKILL.md']);
  });

  it('resolves an agent node to all of its skills', async () => {
    const p = await providerWith([
      file('SKILL.md', '/skills/a/SKILL.md'),
      file('SKILL.md', '/skills/b/SKILL.md'),
    ]);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = (await p.getChildren()) as any[];
    expect(p.resolveSkillMdPathsForNode(agent).sort()).toEqual([
      '/skills/a/SKILL.md',
      '/skills/b/SKILL.md',
    ]);
  });

  it("resolves a group node to only that group's skills", async () => {
    const sources: AgentSource[] = [
      {
        id: 'g1',
        agentId: 'agent',
        agentLabel: 'Agent',
        groupLabel: 'Alpha',
        rootPath: '/a',
        files: ['SKILL.md'],
        recursive: true,
      },
      {
        id: 'g2',
        agentId: 'agent',
        agentLabel: 'Agent',
        groupLabel: 'Beta',
        rootPath: '/b',
        files: ['SKILL.md'],
        recursive: true,
      },
    ];
    vi.mocked(resolveBuiltInAgentSources).mockReturnValueOnce(sources);
    vi.mocked(discoverExternalFiles)
      .mockResolvedValueOnce({ files: [file('SKILL.md', '/a/one/SKILL.md')], messages: [] })
      .mockResolvedValueOnce({ files: [file('SKILL.md', '/b/two/SKILL.md')], messages: [] });
    const p = new InstalledAgentsTreeProvider(
      { globalState: { get: vi.fn(() => []) } } as never,
      { appendLine: vi.fn() } as never,
    );
    await p.refresh();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [agent] = (await p.getChildren()) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const groups = (await p.getChildren(agent)) as any[];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const alpha = groups.find((g: any) => g.label === 'Alpha');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const beta = groups.find((g: any) => g.label === 'Beta');
    expect(p.resolveSkillMdPathsForNode(alpha)).toEqual(['/a/one/SKILL.md']);
    expect(p.resolveSkillMdPathsForNode(beta)).toEqual(['/b/two/SKILL.md']);
    expect(p.resolveSkillMdPathsForNode(agent).sort()).toEqual([
      '/a/one/SKILL.md',
      '/b/two/SKILL.md',
    ]);
  });

  it('resolves a subfolder node to the SKILL.md files under it (or none)', async () => {
    const p = await providerWith([file('SKILL.md', '/skills/example/SKILL.md')]);
    const inside: InstalledAgentsNode = {
      type: 'workspaceDirectory',
      id: 'installed-directory:file:///skills/example',
      uri: vscode.Uri.file('/skills/example'),
      name: 'example',
      parentUri: vscode.Uri.file('/skills'),
    };
    expect(p.resolveSkillMdPathsForNode(inside)).toEqual(['/skills/example/SKILL.md']);
    const outside: InstalledAgentsNode = {
      type: 'workspaceDirectory',
      id: 'installed-directory:file:///skills/other',
      uri: vscode.Uri.file('/skills/other'),
      name: 'other',
      parentUri: vscode.Uri.file('/skills'),
    };
    expect(p.resolveSkillMdPathsForNode(outside)).toEqual([]);
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

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const [loading] = loadingProvider.getChildren() as any[];
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
