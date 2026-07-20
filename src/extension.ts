import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { SkillCodeActionProvider } from './codeActions/skillCodeActions';
import { registerCommands } from './commands';
import { isSkillFile } from './diagnostics/mapping';
import { readConfig } from './config';
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
  updateFavoriteUri,
} from './navigator/favoritesStore';
import { resolveSkillUri } from './commands/resolveSkillTarget';
import { OpenCodeSessionFolderStore } from './opencode/sessionFolderStore';
import {
  OpenCodeSessionsNode,
  OpenCodeSessionsTreeProvider,
} from './ui/openCodeSessionsTreeProvider';
import { registerOpenCodeCommands } from './commands/opencode/registerOpenCodeCommands';
import { refreshAfterConfigurationChange } from './configurationRefresh';

const CHANGE_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const output = vscode.window.createOutputChannel('SKILL.md Inspector');
  context.subscriptions.push(output);

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
    void openCodeSessionsProvider.refresh();
  } catch (error) {
    output.appendLine(
      `OpenCode sessions view initialization failed: ${error instanceof Error ? (error.stack ?? error.message) : String(error)}`,
    );
  }

  const provider = new DiagnosticsProvider();
  context.subscriptions.push(provider);
  registerCommands(context, provider);

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
    favoritesProvider.refresh();
    workspaceProvider.refresh();
    installedAgentsProvider.refresh();
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
  const skillWatcher = vscode.workspace.createFileSystemWatcher('**/SKILL.md');
  skillWatcher.onDidCreate((uri) => {
    treeProvider.refresh();
    favoritesProvider.refresh();
    workspaceProvider.onFilesCreatedOrDeleted([uri]);
    installedAgentsProvider.refresh();
  });
  skillWatcher.onDidDelete((uri) => {
    treeProvider.refresh();
    favoritesProvider.refresh();
    workspaceProvider.onFilesCreatedOrDeleted([uri]);
    installedAgentsProvider.refresh();
  });
  const agentsWatcher = vscode.workspace.createFileSystemWatcher('**/AGENTS.md');
  agentsWatcher.onDidCreate((uri) => workspaceProvider.onFilesCreatedOrDeleted([uri]));
  agentsWatcher.onDidDelete((uri) => workspaceProvider.onFilesCreatedOrDeleted([uri]));
  agentsWatcher.onDidChange((uri) => workspaceProvider.onFilesCreatedOrDeleted([uri]));

  // Watch bundled resource files so adding/removing/renaming one refreshes the
  // tree and re-validates the owning skill (Task 60). Renames fire delete+create.
  const resourceWatcher = vscode.workspace.createFileSystemWatcher(
    '**/{references,scripts,assets,templates}/**',
  );
  const onResourceChange = (uri: vscode.Uri): void => {
    provider.invalidateResource(uri.fsPath);
    treeProvider.refresh();
    revalidateVisible(provider);
  };
  resourceWatcher.onDidCreate(onResourceChange);
  resourceWatcher.onDidDelete(onResourceChange);
  resourceWatcher.onDidChange(onResourceChange);

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
        updateFavoritesContext();
        favoritesProvider.refresh();
        workspaceProvider.refresh();
        installedAgentsProvider.refresh();
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
        updateFavoritesContext();
        favoritesProvider.refresh();
        workspaceProvider.refresh();
        installedAgentsProvider.refresh();
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
        updateFavoritesContext();
        favoritesProvider.refresh();
        workspaceProvider.refresh();
        installedAgentsProvider.refresh();
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
      updateFavoritesContext();
      favoritesProvider.refresh();
      workspaceProvider.refresh();
      installedAgentsProvider.refresh();
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
    skillWatcher,
    agentsWatcher,
    resourceWatcher,
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'markdown', scheme: 'file' },
      new SkillCodeActionProvider(),
      { providedCodeActionKinds: SkillCodeActionProvider.providedCodeActionKinds },
    ),
  );

  // Debounced re-validation while typing, keyed by document URI.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleValidate = (document: vscode.TextDocument): void => {
    if (!isSkillFile(document)) {
      return;
    }
    const key = document.uri.toString();
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        // While typing, run the filesystem-free pipeline (Tasks 57/58).
        void provider.validate(document, 'text-only');
      }, CHANGE_DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => void provider.validate(document)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidate(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSkillFile(document)) {
        if (readConfig(document.uri).runOnSave) {
          void provider.validate(document);
        }
        treeProvider.refresh();
        favoritesProvider.refresh();
        workspaceProvider.refresh();
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
    vscode.workspace.onDidRenameFiles(async (event) => {
      let favorites = restoreFavorites(context.globalState.get(FAVORITES_KEY));
      for (const file of event.files) {
        favorites = updateFavoriteUri(favorites, file.oldUri.toString(), file.newUri.toString());
      }
      await context.globalState.update(FAVORITES_KEY, favorites);
      updateFavoritesContext();
      favoritesProvider.refresh();
      workspaceProvider.onFilesRenamed(event.files);
      installedAgentsProvider.refresh();
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('skillMdInspector')) {
        reportConfigurationWarnings();
        refreshAfterConfigurationChange({
          clearResourceCache: () => provider.clearResourceCache(),
          revalidateVisible: () => revalidateVisible(provider),
          refreshSkills: () => treeProvider.refresh(),
          refreshFavorites: () => favoritesProvider.refresh(),
          refreshWorkspace: () => workspaceProvider.refresh(),
          refreshInstalledAgents: () => installedAgentsProvider.refresh(),
          refreshOpenCodeSessions: () => void openCodeSessionsProvider.refresh(),
        });
      }
    }),
    new vscode.Disposable(() => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    }),
  );

  reportConfigurationWarnings();
  revalidateVisible(provider);
}

function revalidateVisible(provider: DiagnosticsProvider): void {
  for (const editor of vscode.window.visibleTextEditors) {
    void provider.validate(editor.document);
  }
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
