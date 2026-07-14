import { beforeEach, describe, expect, it, vi } from 'vitest';

type Entry = [string, number];
const hoisted = vi.hoisted(() => ({ Directory: 2, File: 1, state: { folders: [] as any[], entries: new Map<string, Entry[]>(), readCount: new Map<string, number>(), excludes: {} as Record<string, boolean>, watchers: [] as any[] } }));
const Directory = hoisted.Directory;
const File = hoisted.File;
const state = hoisted.state;

vi.mock('vscode', () => {
  class Uri {
    scheme: string; path: string; fsPath: string;
    constructor(scheme: string, path: string) { this.scheme = scheme; this.path = path; this.fsPath = path; }
    static parse(value: string): Uri { const parsed = new URL(value); return new Uri(parsed.protocol.slice(0, -1), parsed.pathname); }
    static joinPath(parent: Uri, child: string): Uri { return new Uri(parent.scheme, `${parent.path.replace(/\/$/, '')}/${child}`); }
    toString(): string { return `${this.scheme}://${this.path}`; }
    with(change: { path?: string }): Uri { return new Uri(this.scheme, change.path ?? this.path); }
  }
  return {
    Uri,
    FileType: { File: hoisted.File, Directory: hoisted.Directory },
    EventEmitter: class { event = vi.fn(); fire = vi.fn(); },
    RelativePattern: class { constructor(readonly base: any, readonly pattern: string) {} },
    workspace: {
      get workspaceFolders() { return state.folders; },
      fs: { readDirectory: vi.fn(async (uri: any) => { const key = uri.toString(); state.readCount.set(key, (state.readCount.get(key) ?? 0) + 1); const result = state.entries.get(key); if (!result) throw new Error('missing'); return result; }) },
      getConfiguration: vi.fn(() => ({ get: vi.fn((_key: string, fallback: unknown) => Object.keys(state.excludes).length ? state.excludes : fallback) })),
      getWorkspaceFolder: vi.fn((uri: any) => state.folders.find((folder) => uri.toString().startsWith(folder.uri.toString()))),
      createFileSystemWatcher: vi.fn(() => { const watcher = { onDidCreate: vi.fn(), onDidDelete: vi.fn(), onDidChange: vi.fn(), dispose: vi.fn() }; state.watchers.push(watcher); return watcher; }),
    },
    TreeItem: class { constructor(public label: string, public collapsibleState: number) {} },
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
  };
});

import * as vscode from 'vscode';
import { WorkspaceExplorer } from '../src/navigator/workspaceExplorer';
import { compareWorkspaceNodes } from '../src/navigator/workspaceSorting';
import { matchesFilesExclude } from '../src/navigator/workspaceExcludes';

function uri(value: string): vscode.Uri { return vscode.Uri.parse(value); }
function folder(value: string, name: string, index: number): vscode.WorkspaceFolder { return { uri: uri(value), name, index }; }

beforeEach(() => { state.folders = []; state.entries.clear(); state.readCount.clear(); state.excludes = {}; state.watchers = []; });

describe('WorkspaceExplorer', () => {
  it('returns stable workspace roots in VS Code order', () => {
    state.folders = [folder('mem:///a', 'a', 0), folder('mem:///b', 'b', 1)];
    const explorer = new WorkspaceExplorer({ appendLine: vi.fn() } as any);
    expect(explorer.getRoots().map((root) => root.id)).toEqual(['workspace-root:mem:///a', 'workspace-root:mem:///b']);
  });

  it('loads direct children lazily and caches expanded directories', async () => {
    state.folders = [folder('mem:///root', 'root', 0)];
    state.entries.set('mem:///root', [['src', Directory], ['README.md', File], ['SKILL.md', File], ['AGENTS.md', File], ['.hidden', Directory]]);
    state.entries.set('mem:///root/src', [['index.ts', File]]);
    const explorer = new WorkspaceExplorer({ appendLine: vi.fn() } as any);
    const [root] = explorer.getRoots();
    expect(state.readCount.size).toBe(0);
    const children = await explorer.getChildren(root!);
    expect(children.map((child) => child.type === 'workspaceDirectory' || child.type === 'workspaceFile' ? child.name : 'label' in child ? child.label : child.folder.name)).toEqual(['.hidden', 'src', 'AGENTS.md', 'README.md', 'SKILL.md']);
    expect(state.readCount.get('mem:///root')).toBe(1);
    await explorer.getChildren(root!);
    expect(state.readCount.get('mem:///root')).toBe(1);
    expect(state.readCount.has('mem:///root/src')).toBe(false);
    await explorer.getChildren(children.find((child): child is any => child.type === 'workspaceDirectory' && child.name === 'src')!);
    expect(state.readCount.get('mem:///root/src')).toBe(1);
  });

  it('invalidates only selected directory cache entries', async () => {
    state.folders = [folder('mem:///root', 'root', 0)];
    state.entries.set('mem:///root', [['src', Directory]]);
    state.entries.set('mem:///root/src', [['a.ts', File]]);
    const explorer = new WorkspaceExplorer({ appendLine: vi.fn() } as any);
    const [root] = explorer.getRoots();
    const [src] = await explorer.getChildren(root!);
    await explorer.getChildren(src as any);
    explorer.invalidate((src as any).uri);
    await explorer.getChildren(root!);
    await explorer.getChildren(src as any);
    expect(state.readCount.get('mem:///root')).toBe(1);
    expect(state.readCount.get('mem:///root/src')).toBe(2);
  });

  it('honors files.exclude without applying skill discovery exclusions', async () => {
    state.folders = [folder('mem:///root', 'root', 0)];
    state.excludes = { '**/node_modules': true, '*.log': true };
    state.entries.set('mem:///root', [['node_modules', Directory], ['debug.log', File], ['package.json', File], ['SKILL.md', File]]);
    const explorer = new WorkspaceExplorer({ appendLine: vi.fn() } as any);
    const children = await explorer.getChildren(explorer.getRoots()[0]!);
    expect(children.map((child: any) => child.name)).toEqual(['package.json', 'SKILL.md']);
  });

  it('logs read errors and returns a safe message child', async () => {
    state.folders = [folder('mem:///missing', 'missing', 0)];
    const appendLine = vi.fn();
    const explorer = new WorkspaceExplorer({ appendLine } as any);
    const children = await explorer.getChildren(explorer.getRoots()[0]!);
    expect(children).toEqual([expect.objectContaining({ type: 'workspaceError', label: 'Unable to read this folder.' })]);
    expect(appendLine).toHaveBeenCalled();
  });

  it('matches standard exclude glob shapes used by files.exclude', () => {
    expect(matchesFilesExclude(uri('mem:///root'), uri('mem:///root/dist'), 'dist', '**/dist')).toBe(true);
    expect(matchesFilesExclude(uri('mem:///root'), uri('mem:///root/src/a.log'), 'a.log', '*.log')).toBe(true);
    expect(matchesFilesExclude(uri('mem:///root'), uri('mem:///root/src/a.ts'), 'a.ts', '*.log')).toBe(false);
  });

  it('sorts directories before files with case-insensitive numeric names', () => {
    const nodes = [
      { type: 'workspaceFile', id: 'f10', name: 'file10.txt' },
      { type: 'workspaceDirectory', id: 'd10', name: 'folder10' },
      { type: 'workspaceFile', id: 'f2', name: 'file2.txt' },
      { type: 'workspaceDirectory', id: 'd2', name: 'folder2' },
    ] as any[];
    expect(nodes.sort(compareWorkspaceNodes).map((node) => node.name)).toEqual(['folder2', 'folder10', 'file2.txt', 'file10.txt']);
  });
});
