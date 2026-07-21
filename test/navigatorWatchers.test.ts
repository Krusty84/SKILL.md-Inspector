import { beforeEach, describe, expect, it, vi } from 'vitest';

// Captures the watchers/handlers registered against the mocked `vscode` module so
// each test can fire file events and assert exactly which views were poked.
const state = vi.hoisted(() => ({
  watchers: [] as any[],
  skillWatcher: undefined as any,
  agentsWatcher: undefined as any,
  renameHandler: undefined as ((event: any) => unknown) | undefined,
}));

vi.mock('vscode', () => {
  const makeWatcher = (pattern: string) => {
    const watcher: any = {
      pattern,
      create: undefined as ((uri: any) => void) | undefined,
      change: undefined as ((uri: any) => void) | undefined,
      delete: undefined as ((uri: any) => void) | undefined,
      onDidCreate: vi.fn((handler) => (watcher.create = handler)),
      onDidChange: vi.fn((handler) => (watcher.change = handler)),
      onDidDelete: vi.fn((handler) => (watcher.delete = handler)),
      dispose: vi.fn(),
    };
    return watcher;
  };
  return {
    workspace: {
      createFileSystemWatcher: vi.fn((pattern: string) => {
        const watcher = makeWatcher(pattern);
        state.watchers.push(watcher);
        if (pattern.includes('SKILL.md')) state.skillWatcher = watcher;
        if (pattern.includes('AGENTS.md')) state.agentsWatcher = watcher;
        return watcher;
      }),
      onDidRenameFiles: vi.fn((handler: (event: any) => unknown) => {
        state.renameHandler = handler;
        return { dispose: vi.fn() };
      }),
    },
  };
});

import { registerNavigatorWatchers } from '../src/navigator/navigatorWatchers';
import { FAVORITES_KEY } from '../src/navigator/favoritesStore';

function uri(value: string): any {
  return { toString: () => value };
}

function setup(favorites: { uri: string }[] = []) {
  state.watchers = [];
  state.skillWatcher = undefined;
  state.agentsWatcher = undefined;
  state.renameHandler = undefined;
  const store = new Map<string, unknown>([[FAVORITES_KEY, favorites]]);
  const deps = {
    refreshSkillsPanel: vi.fn(),
    onWorkspaceFilesCreatedOrDeleted: vi.fn(),
    onWorkspaceFilesRenamed: vi.fn(),
    refreshFavorites: vi.fn(),
    updateFavoritesContext: vi.fn(),
  };
  const host = {
    globalState: {
      get: vi.fn((key: string) => store.get(key)),
      update: vi.fn(async (key: string, value: unknown) => {
        store.set(key, value);
      }),
    },
    subscriptions: { push: vi.fn() },
  };
  registerNavigatorWatchers(host as any, deps);
  return { deps, host, store };
}

describe('registerNavigatorWatchers', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers SKILL.md and AGENTS.md watchers plus a rename listener as disposables', () => {
    const { host } = setup();
    expect(state.skillWatcher).toBeTruthy();
    expect(state.agentsWatcher).toBeTruthy();
    expect(state.renameHandler).toBeTypeOf('function');
    // skillWatcher + agentsWatcher + renameListener
    expect(host.subscriptions.push).toHaveBeenCalledTimes(1);
    expect((host.subscriptions.push as any).mock.calls[0]).toHaveLength(3);
  });

  it('creating a non-favorite SKILL.md refreshes only the Skills panel and WORKSPACE tree', () => {
    const { deps } = setup([]);
    state.skillWatcher.create(uri('file:///ws/new/SKILL.md'));
    expect(deps.refreshSkillsPanel).toHaveBeenCalledTimes(1);
    expect(deps.onWorkspaceFilesCreatedOrDeleted).toHaveBeenCalledTimes(1);
    // FAVORITES stays put — the created file is not a favorite.
    expect(deps.refreshFavorites).not.toHaveBeenCalled();
  });

  it('deleting a favorited SKILL.md also refreshes FAVORITES (its badge flips)', () => {
    const favorite = 'file:///ws/fav/SKILL.md';
    const { deps } = setup([{ uri: favorite }]);
    state.skillWatcher.delete(uri(favorite));
    expect(deps.refreshSkillsPanel).toHaveBeenCalledTimes(1);
    expect(deps.onWorkspaceFilesCreatedOrDeleted).toHaveBeenCalledTimes(1);
    expect(deps.refreshFavorites).toHaveBeenCalledTimes(1);
  });

  it('deleting a non-favorite SKILL.md never refreshes FAVORITES', () => {
    const { deps } = setup([{ uri: 'file:///ws/fav/SKILL.md' }]);
    state.skillWatcher.delete(uri('file:///ws/unrelated/SKILL.md'));
    expect(deps.onWorkspaceFilesCreatedOrDeleted).toHaveBeenCalledTimes(1);
    expect(deps.refreshFavorites).not.toHaveBeenCalled();
  });

  it('AGENTS.md changes only update the WORKSPACE tree', () => {
    const { deps } = setup();
    state.agentsWatcher.change(uri('file:///ws/AGENTS.md'));
    expect(deps.onWorkspaceFilesCreatedOrDeleted).toHaveBeenCalledTimes(1);
    expect(deps.refreshSkillsPanel).not.toHaveBeenCalled();
    expect(deps.refreshFavorites).not.toHaveBeenCalled();
  });

  it('renaming a favorited file rewrites the favorite and refreshes FAVORITES + WORKSPACE', async () => {
    const { deps, host } = setup([{ uri: 'file:///ws/a/SKILL.md' }]);
    await state.renameHandler!({
      files: [{ oldUri: uri('file:///ws/a/SKILL.md'), newUri: uri('file:///ws/b/SKILL.md') }],
    });
    expect(host.globalState.update).toHaveBeenCalledWith(FAVORITES_KEY, [
      { uri: 'file:///ws/b/SKILL.md' },
    ]);
    expect(deps.updateFavoritesContext).toHaveBeenCalledTimes(1);
    expect(deps.refreshFavorites).toHaveBeenCalledTimes(1);
    expect(deps.onWorkspaceFilesRenamed).toHaveBeenCalledTimes(1);
  });

  it('renaming an unrelated file updates only the WORKSPACE tree, leaving FAVORITES untouched', async () => {
    const { deps, host } = setup([{ uri: 'file:///ws/a/SKILL.md' }]);
    await state.renameHandler!({
      files: [{ oldUri: uri('file:///ws/notes.txt'), newUri: uri('file:///ws/renamed.txt') }],
    });
    expect(deps.onWorkspaceFilesRenamed).toHaveBeenCalledTimes(1);
    expect(host.globalState.update).not.toHaveBeenCalled();
    expect(deps.updateFavoritesContext).not.toHaveBeenCalled();
    expect(deps.refreshFavorites).not.toHaveBeenCalled();
  });
});
