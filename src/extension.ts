import * as path from 'node:path';
import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { createResourceWatcherScheduler } from './diagnostics/resourceWatcherScheduler';
import { matchesAnyGlob } from './parser/globMatch';
import { SkillCodeActionProvider } from './codeActions/skillCodeActions';
import { registerCommands } from './commands';
import { isSkillFile } from './diagnostics/mapping';
import { invalidateConfigCache, readConfig } from './config';
import { SkillTreeProvider } from './ui/skillTreeProvider';
import { FavoritesTreeProvider } from './ui/favoritesTreeProvider';
import { WorkspaceTreeProvider } from './ui/workspaceTreeProvider';
import { InstalledAgentsTreeProvider } from './ui/installedAgentsTreeProvider';
import { registerWorkspaceCommands } from './commands/workspace/registerWorkspaceCommands';
import { registerWorkspaceContextCommands } from './commands/workspace/registerWorkspaceContextCommands';
import { createBuiltInCommandAdapter } from './commands/workspace/vscodeBuiltInCommandAdapter';
import {
  addFavorite,
  FAVORITES_KEY,
  removeFavorite,
  restoreFavorites,
} from './navigator/favoritesStore';
import { resolveSkillUri } from './commands/resolveSkillTarget';
import { OpenCodeSessionFolderStore } from './opencode/sessionFolderStore';
import {
  OpenCodeSessionsNode,
  OpenCodeSessionsTreeProvider,
} from './ui/openCodeSessionsTreeProvider';
import { registerOpenCodeCommands } from './commands/opencode/registerOpenCodeCommands';
import { registerInstalledAgentsCommands } from './commands/installedAgents/registerInstalledAgentsCommands';
import {
  refreshAfterConfigurationChange,
  type NavigatorConfigSnapshot,
} from './configurationRefresh';
import { registerNavigatorWatchers } from './navigator/navigatorWatchers';
import { warmUpO200kTokenizer } from './analysis/o200kTokenizer';
import { createKeyedDebouncer } from './ui/debounce';

const CHANGE_DEBOUNCE_MS = 250;
const CHANGE_MAX_WAIT_MS = 1000;
const RESOURCE_EVENT_DEBOUNCE_MS = 250;
const RESOURCE_EVENT_MAX_WAIT_MS = 2000;
const SAVE_TREE_REFRESH_DEBOUNCE_MS = 1000;
const SAVE_TREE_REFRESH_MAX_WAIT_MS = 5000;
const TOKENIZER_WARM_UP_DELAY_MS = 2000;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('SKILL.md Inspector');
  context.subscriptions.push(output);
  // Activation marker: if this line reappears (and the channel resets) right
  // after adding/removing a workspace folder, VS Code terminated and restarted
  // the extension host (see the updateWorkspaceFolders API note) — every view
  // in the window reloads then, which no extension can prevent.
  output.appendLine(
    `SKILL.md Inspector activated (extension host session started ${new Date().toISOString()})`,
  );
  // Every refresh of a sidebar view below logs its trigger through this helper,
  // so cross-view refresh reports can be traced to an exact cause.
  const logViewRefresh = (reason: string): void => output.appendLine(`[view-refresh] ${reason}`);

  const treeProvider = new SkillTreeProvider(output);
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skillMdInspectorSkills', treeProvider),
  );

  const favoritesProvider = new FavoritesTreeProvider(context);
  const favoritesView = vscode.window.createTreeView('skillMdInspectorFavorites', {
    treeDataProvider: favoritesProvider,
  });
  context.subscriptions.push(favoritesView);

  const workspaceProvider = new WorkspaceTreeProvider(context, output);
  const workspaceView = vscode.window.createTreeView('skillMdInspectorWorkspace', {
    treeDataProvider: workspaceProvider,
    canSelectMany: true,
    showCollapseAll: true,
  });
  context.subscriptions.push(workspaceProvider, workspaceView);

  const installedAgentsProvider = new InstalledAgentsTreeProvider(context, output);
  const installedAgentsView = vscode.window.createTreeView('skillMdInspectorInstalledAgents', {
    treeDataProvider: installedAgentsProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(installedAgentsView);

  const openCodeSessionFolderStore = new OpenCodeSessionFolderStore(context);
  const openCodeSessionsProvider = new OpenCodeSessionsTreeProvider(
    openCodeSessionFolderStore,
    output,
  );
  context.subscriptions.push(openCodeSessionsProvider);
  try {
    const openCodeSessionsView: vscode.TreeView<OpenCodeSessionsNode> =
      vscode.window.createTreeView('skillMdInspectorOpenCodeSessions', {
        treeDataProvider: openCodeSessionsProvider,
        showCollapseAll: true,
      });
    context.subscriptions.push(openCodeSessionsView);
    logViewRefresh('OPENCODE SESSIONS: initial scan on activation');
    void openCodeSessionsProvider.refresh();
  } catch (error) {
    output.appendLine(
      `OpenCode sessions view initialization failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
  }

  const provider = new DiagnosticsProvider();
  context.subscriptions.push(provider);
  registerCommands(context, provider);
  registerInstalledAgentsCommands(context, {
    installedProvider: installedAgentsProvider,
    diagnostics: provider,
  });

  let configurationWarningState = '';
  const reportConfigurationWarnings = (): void => {
    const scope =
      vscode.window.activeTextEditor?.document.uri ?? vscode.workspace.workspaceFolders?.[0]?.uri;
    const warnings = readConfig(scope).configurationWarnings;
    const nextState = JSON.stringify(warnings);
    if (nextState === configurationWarningState) return;
    const hadWarnings = configurationWarningState !== '' && configurationWarningState !== '[]';
    configurationWarningState = nextState;
    if (warnings.length === 0) {
      if (hadWarnings) output.appendLine('Heuristic dictionary configuration warnings cleared.');
      return;
    }
    output.appendLine(`Heuristic dictionary configuration warnings (${warnings.length}):`);
    for (const warning of warnings) {
      output.appendLine(`- ${warning.setting}: ${warning.message}`);
    }
    void vscode.window.showWarningMessage(
      `SKILL.md Inspector ignored invalid heuristic dictionary configuration (${warnings.length} ${warnings.length === 1 ? 'warning' : 'warnings'}). See the SKILL.md Inspector output for details.`,
    );
  };
  registerOpenCodeCommands(context, {
    provider: openCodeSessionsProvider,
    store: openCodeSessionFolderStore,
    output,
  });
  registerWorkspaceCommands(context, { provider: workspaceProvider, view: workspaceView, output });
  void createBuiltInCommandAdapter(output)
    .then((adapter) =>
      registerWorkspaceContextCommands(context, { provider: workspaceProvider, adapter }),
    )
    .catch((error: unknown) => {
      output.appendLine(
        `Optional WORKSPACE context actions initialization failed: ${String(error)}`,
      );
    });
  const refreshNavigator = (): void => {
    logViewRefresh('FAVORITES + WORKSPACE + INSTALLED AGENTS: refreshNavigator command');
    favoritesProvider.refresh();
    workspaceProvider.refresh();
    void installedAgentsProvider.refresh();
  };
  const updateFavoritesContext = (): void => {
    const favorites = restoreFavorites(context.globalState.get(FAVORITES_KEY));
    void vscode.commands.executeCommand(
      'setContext',
      'skillMdInspector.hasFavorites',
      favorites.length > 0,
    );
  };
  updateFavoritesContext();
  // Favorites commands re-render every view that shows a favorite star: the
  // FAVORITES list itself plus the star context values in the WORKSPACE and
  // INSTALLED AGENTS trees. This is the one deliberate cross-view refresh, and
  // it runs only on explicit favorite actions.
  const refreshFavoriteSurfaces = (reason: string): void => {
    logViewRefresh(`FAVORITES + WORKSPACE + INSTALLED AGENTS: ${reason}`);
    updateFavoritesContext();
    favoritesProvider.refresh();
    workspaceProvider.refresh();
    void installedAgentsProvider.refresh();
  };
  // Keep the SKILL.md navigator views in sync with workspace file changes
  // without coupling them together: each event is routed only to the views that
  // depend on the changed file. FAVORITES refreshes only when the changed file
  // is a favorite, and INSTALLED AGENTS / OPENCODE SESSIONS (whose data lives
  // outside the workspace) are never touched here.
  registerNavigatorWatchers(context, {
    refreshSkillsPanel: () => void treeProvider.refresh(),
    onWorkspaceFilesCreatedOrDeleted: (uris) => workspaceProvider.onFilesCreatedOrDeleted(uris),
    onWorkspaceFilesRenamed: (files) => workspaceProvider.onFilesRenamed(files),
    refreshFavorites: () => {
      logViewRefresh('FAVORITES: a favorited SKILL.md changed on disk');
      favoritesProvider.refresh();
    },
    updateFavoritesContext,
  });

  // Watch bundled resource files so adding/removing/renaming one refreshes the
  // tree and re-validates the owning skill (Task 60). Renames fire delete+create.
  // The glob matches those directory names anywhere in the workspace, so events
  // are filtered against the resource-exclusion globs (a node_modules install
  // must not thrash the tree) and coalesced per burst: one invalidation sweep,
  // one Skills refresh, one revalidation — instead of one of each per file.
  const resourceWatcher = vscode.workspace.createFileSystemWatcher(
    '**/{references,scripts,assets,templates}/**',
  );
  const resourceScheduler = createResourceWatcherScheduler({
    debounceMs: RESOURCE_EVENT_DEBOUNCE_MS,
    maxWaitMs: RESOURCE_EVENT_MAX_WAIT_MS,
    // Fail-open: patterns anchored to a skill directory (e.g. `dist/**`) do not
    // match an absolute path, and their events just proceed to the batch.
    ignore: (fsPath) =>
      matchesAnyGlob(toPosixPath(fsPath), readConfig(vscode.Uri.file(fsPath)).resourceExclude),
    flush: (paths) => {
      for (const fsPath of paths) {
        provider.invalidateResource(fsPath);
      }
      void treeProvider.refresh();
      revalidateVisible(provider);
    },
  });
  const onResourceChange = (uri: vscode.Uri): void => resourceScheduler.notify(uri.fsPath);
  resourceWatcher.onDidCreate(onResourceChange);
  resourceWatcher.onDidDelete(onResourceChange);
  resourceWatcher.onDidChange(onResourceChange);
  context.subscriptions.push(new vscode.Disposable(() => resourceScheduler.dispose()));

  context.subscriptions.push(
    vscode.commands.registerCommand('skillMdInspector.refreshSkills', () => treeProvider.refresh()),
    vscode.commands.registerCommand('skillMdInspector.refreshNavigator', refreshNavigator),
    vscode.commands.registerCommand('skillMdInspector.refreshFavorites', () =>
      favoritesProvider.refresh(),
    ),
    vscode.commands.registerCommand('skillMdInspector.refreshWorkspace', () =>
      workspaceProvider.refresh(),
    ),
    vscode.commands.registerCommand('skillMdInspector.refreshInstalledAgents', () =>
      installedAgentsProvider.refresh(),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.addToFavorites',
      async (target?: FavoriteCommandTarget) => {
        const uri = resolveFavoriteTarget(target);
        if (!uri || uri.path.split('/').pop() !== 'SKILL.md') {
          void vscode.window.showWarningMessage(
            'Only files named SKILL.md can be added to Favorites.',
          );
          return;
        }
        const current = restoreFavorites(context.globalState.get(FAVORITES_KEY));
        const result = addFavorite(current, uri.toString());
        if (!result.added) {
          void vscode.window.showInformationMessage('This SKILL.md is already in Favorites.');
          return;
        }
        await context.globalState.update(FAVORITES_KEY, result.entries);
        refreshFavoriteSurfaces('addToFavorites command');
      },
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.removeFromFavorites',
      async (target?: FavoriteCommandTarget) => {
        const uri = resolveFavoriteTarget(target);
        if (!uri) {
          return;
        }
        await context.globalState.update(
          FAVORITES_KEY,
          removeFavorite(restoreFavorites(context.globalState.get(FAVORITES_KEY)), uri.toString()),
        );
        refreshFavoriteSurfaces('removeFromFavorites command');
      },
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.toggleFavorite',
      async (target?: FavoriteCommandTarget) => {
        const uri = resolveFavoriteTarget(target);
        if (!uri || uri.path.split('/').pop() !== 'SKILL.md') {
          void vscode.window.showWarningMessage(
            'Only files named SKILL.md can be added to or removed from Favorites.',
          );
          return;
        }
        const current = restoreFavorites(context.globalState.get(FAVORITES_KEY));
        const uriString = uri.toString();
        const exists = current.some((entry) => entry.uri === uriString);
        await context.globalState.update(
          FAVORITES_KEY,
          exists ? removeFavorite(current, uriString) : addFavorite(current, uriString).entries,
        );
        refreshFavoriteSurfaces('toggleFavorite command');
      },
    ),
    vscode.commands.registerCommand('skillMdInspector.clearFavorites', async () => {
      const current = restoreFavorites(context.globalState.get(FAVORITES_KEY));
      if (current.length === 0) {
        return;
      }
      const choice = await vscode.window.showWarningMessage(
        'Clear all SKILL.md Inspector Favorites?',
        { modal: true },
        'Clear Favorites',
      );
      if (choice !== 'Clear Favorites') {
        return;
      }
      await context.globalState.update(FAVORITES_KEY, []);
      refreshFavoriteSurfaces('clearFavorites command');
    }),
    vscode.commands.registerCommand('skillMdInspector.openFavorite', async (uriString: string) => {
      const uri = vscode.Uri.parse(uriString);
      try {
        await vscode.workspace.fs.stat(uri);
        await vscode.commands.executeCommand('vscode.open', uri);
      } catch {
        void vscode.window.showWarningMessage(`Favorite is unavailable: ${uriString}`);
      }
    }),
    resourceWatcher,
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'markdown', scheme: 'file' },
      new SkillCodeActionProvider(provider),
      { providedCodeActionKinds: SkillCodeActionProvider.providedCodeActionKinds },
    ),
  );

  // Debounced re-validation while typing, keyed by document URI: trailing
  // edge after each pause, but never later than CHANGE_MAX_WAIT_MS after the
  // first coalesced change, so diagnostics keep refreshing during continuous
  // typing instead of freezing until the user stops.
  const changeDebouncer = createKeyedDebouncer(CHANGE_DEBOUNCE_MS, CHANGE_MAX_WAIT_MS);
  const saveRefreshDebouncer = createKeyedDebouncer(
    SAVE_TREE_REFRESH_DEBOUNCE_MS,
    SAVE_TREE_REFRESH_MAX_WAIT_MS,
  );
  const scheduleValidate = (document: vscode.TextDocument): void => {
    if (!isSkillFile(document)) {
      return;
    }
    changeDebouncer.schedule(document.uri.toString(), () => {
      // While typing, run the full pipeline served from the resource and
      // token caches, so filesystem diagnostics (missing links, unreferenced
      // resources) stay stable instead of vanishing until the next save.
      // Online link checking stays off this path: no network per keystroke.
      void provider.validate(document, { online: false });
    });
  };

  // Baseline of the settings the sidebar views depend on, updated on every
  // handled configuration change so refreshes fire only on real value changes.
  let navigatorConfigSnapshot = readNavigatorConfigSnapshot();

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void provider.validate(document)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidate(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSkillFile(document)) {
        if (readConfig(document.uri).runOnSave) {
          void provider.validate(document);
        }
        // Saving only changes the file's analysis, so refresh just the Skills
        // panel. The WORKSPACE and FAVORITES file lists don't depend on file
        // contents and stay independent. Coalesced: the workspace re-analysis
        // is synchronous and heavy, so rapid saves must not stack runs.
        saveRefreshDebouncer.schedule('skills-tree', () => void treeProvider.refresh());
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isSkillFile(document)) {
        provider.clear(document.uri);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() =>
      workspaceProvider.onWorkspaceFoldersChanged(),
    ),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (!event.affectsConfiguration('skillMdInspector')) return;
      // Before anything below re-reads settings: the memoized configs are stale.
      invalidateConfigCache();
      reportConfigurationWarnings();
      // Compare the settings each sidebar view actually reads against the last
      // snapshot so a view refreshes only when its own value changed. Adding or
      // removing a workspace folder re-fires this event without changing these
      // values, so INSTALLED AGENTS and OPENCODE SESSIONS stay put; FAVORITES and
      // the WORKSPACE tree read no skillMdInspector setting and are never here.
      const nextSnapshot = readNavigatorConfigSnapshot();
      refreshAfterConfigurationChange(
        {
          affectsSkillMdInspector: true,
          previous: navigatorConfigSnapshot,
          next: nextSnapshot,
        },
        {
          clearResourceCache: () => provider.clearResourceCache(),
          revalidateVisible: () => revalidateVisible(provider),
          refreshSkills: () => void treeProvider.refresh(),
          refreshInstalledAgents: () => {
            logViewRefresh('INSTALLED AGENTS: navigator.additionalRoots setting changed');
            void installedAgentsProvider.refresh();
          },
          refreshOpenCodeSessions: () => {
            logViewRefresh('OPENCODE SESSIONS: openCode.* discovery settings changed');
            void openCodeSessionsProvider.refresh();
          },
        },
      );
      navigatorConfigSnapshot = nextSnapshot;
    }),
    new vscode.Disposable(() => changeDebouncer.dispose()),
    new vscode.Disposable(() => saveRefreshDebouncer.dispose()),
  );

  reportConfigurationWarnings();
  revalidateVisible(provider);

  // Any full validation constructs the o200k tokenizer on demand (a noticeable
  // synchronous stall). If no SKILL.md was visible above, prebuild it shortly
  // after activation so the first edit in a skill workspace stays smooth; a
  // plain-markdown single file (no workspace) skips the cost entirely.
  let warmUpTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(() => {
    warmUpTimer = undefined;
    if (vscode.workspace.workspaceFolders?.length) {
      warmUpO200kTokenizer();
    }
  }, TOKENIZER_WARM_UP_DELAY_MS);
  context.subscriptions.push(
    new vscode.Disposable(() => {
      if (warmUpTimer) {
        clearTimeout(warmUpTimer);
        warmUpTimer = undefined;
      }
    }),
  );
}

function revalidateVisible(provider: DiagnosticsProvider): void {
  for (const editor of vscode.window.visibleTextEditors) {
    void provider.validate(editor.document);
  }
}

function toPosixPath(fsPath: string): string {
  return fsPath.split(path.sep).join('/');
}

/**
 * Snapshot the exact settings the INSTALLED AGENTS and OPENCODE SESSIONS views
 * read, so a configuration change refreshes them only when their own value
 * changed — matching what each provider reads at render time.
 */
function readNavigatorConfigSnapshot(): NavigatorConfigSnapshot {
  const openCode = vscode.workspace.getConfiguration('skillMdInspector.openCode');
  return {
    additionalRoots: JSON.stringify(
      vscode.workspace.getConfiguration('skillMdInspector').get('navigator.additionalRoots') ??
        null,
    ),
    openCode: JSON.stringify({
      maxDiscoveredSessions: openCode.get('maxDiscoveredSessions') ?? null,
      maxPreviewCharacters: openCode.get('maxPreviewCharacters') ?? null,
      maxSessionFileSizeMb: openCode.get('maxSessionFileSizeMb') ?? null,
      scanRecursively: openCode.get('scanRecursively') ?? null,
    }),
  };
}

export function deactivate(): void {
  // Disposables registered on the extension context are cleaned up by VS Code.
}

type FavoriteCommandTarget =
  | vscode.Uri
  | { resourceUri?: vscode.Uri; uri?: vscode.Uri | string; file?: { absolutePath?: string } };

function resolveFavoriteTarget(target?: FavoriteCommandTarget): vscode.Uri | undefined {
  return resolveSkillUri(target) ?? vscode.window.activeTextEditor?.document.uri;
}
