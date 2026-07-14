import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { SkillCodeActionProvider } from './codeActions/skillCodeActions';
import { registerCommands } from './commands';
import { isSkillFile } from './diagnostics/mapping';
import { readConfig } from './config';
import { SkillTreeProvider } from './ui/skillTreeProvider';
import { AgentFilesTreeProvider } from './ui/agentFilesTreeProvider';
import { addFavorite, FAVORITES_KEY, removeFavorite, restoreFavorites, updateFavoriteUri } from './navigator/favoritesStore';

const CHANGE_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DiagnosticsProvider();
  context.subscriptions.push(provider);

  registerCommands(context, provider);

  const treeProvider = new SkillTreeProvider();
  const output = vscode.window.createOutputChannel('SKILL.md Inspector');
  const navigatorProvider = new AgentFilesTreeProvider(context, output);
  const navigatorView = vscode.window.createTreeView('skillMdInspectorNavigator', { treeDataProvider: navigatorProvider });
  const updateFavoritesContext = (): void => {
    const favorites = restoreFavorites(context.globalState.get(FAVORITES_KEY));
    void vscode.commands.executeCommand('setContext', 'skillMdInspector.hasFavorites', favorites.length > 0);
  };
  updateFavoritesContext();
  const skillWatcher = vscode.workspace.createFileSystemWatcher('**/SKILL.md');
  skillWatcher.onDidCreate(() => { treeProvider.refresh(); navigatorProvider.refresh(); });
  skillWatcher.onDidDelete(() => { treeProvider.refresh(); navigatorProvider.refresh(); });
  const agentsWatcher = vscode.workspace.createFileSystemWatcher('**/AGENTS.md');
  agentsWatcher.onDidCreate(() => navigatorProvider.refresh());
  agentsWatcher.onDidDelete(() => navigatorProvider.refresh());
  agentsWatcher.onDidChange(() => navigatorProvider.refresh());

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
    output,
    navigatorProvider,
    navigatorView,
    vscode.window.registerTreeDataProvider('skillMdInspectorSkills', treeProvider),
    vscode.commands.registerCommand('skillMdInspector.refreshSkills', () => treeProvider.refresh()),
    vscode.commands.registerCommand('skillMdInspector.refreshNavigator', () => navigatorProvider.refresh()),
    vscode.commands.registerCommand('skillMdInspector.addToFavorites', async (target?: vscode.Uri | { resourceUri?: vscode.Uri; uri?: string }) => {
      const uri = resolveFavoriteTarget(target);
      if (!uri || uri.path.split('/').pop() !== 'SKILL.md') {
        void vscode.window.showWarningMessage('Only files named SKILL.md can be added to Favorites.');
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
      navigatorProvider.refresh();
    }),
    vscode.commands.registerCommand('skillMdInspector.removeFromFavorites', async (target?: vscode.Uri | { resourceUri?: vscode.Uri; uri?: string }) => {
      const uri = resolveFavoriteTarget(target);
      if (!uri) { return; }
      await context.globalState.update(FAVORITES_KEY, removeFavorite(restoreFavorites(context.globalState.get(FAVORITES_KEY)), uri.toString()));
      updateFavoritesContext();
      navigatorProvider.refresh();
    }),
    vscode.commands.registerCommand('skillMdInspector.clearFavorites', async () => {
      const current = restoreFavorites(context.globalState.get(FAVORITES_KEY));
      if (current.length === 0) { return; }
      const choice = await vscode.window.showWarningMessage('Clear all SKILL.md Inspector Favorites?', { modal: true }, 'Clear Favorites');
      if (choice !== 'Clear Favorites') { return; }
      await context.globalState.update(FAVORITES_KEY, []);
      updateFavoritesContext();
      navigatorProvider.refresh();
    }),
    vscode.commands.registerCommand('skillMdInspector.openFavorite', async (uriString: string) => {
      const uri = vscode.Uri.parse(uriString);
      try { await vscode.workspace.fs.stat(uri); await vscode.commands.executeCommand('vscode.open', uri); }
      catch { void vscode.window.showWarningMessage(`Favorite is unavailable: ${uriString}`); }
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
        provider.validate(document, 'text-only');
      }, CHANGE_DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => provider.validate(document)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidate(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSkillFile(document)) {
        if (readConfig(document.uri).runOnSave) {
          provider.validate(document);
        }
        treeProvider.refresh();
        navigatorProvider.refresh();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isSkillFile(document)) {
        provider.clear(document.uri);
      }
    }),
    vscode.workspace.onDidChangeWorkspaceFolders(() => navigatorProvider.onWorkspaceFoldersChanged()),
    vscode.workspace.onDidRenameFiles(async (event) => {
      let favorites = restoreFavorites(context.globalState.get(FAVORITES_KEY));
      for (const file of event.files) {
        favorites = updateFavoriteUri(favorites, file.oldUri.toString(), file.newUri.toString());
      }
      await context.globalState.update(FAVORITES_KEY, favorites);
      updateFavoritesContext();
      navigatorProvider.onFilesRenamed(event.files);
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('skillMdInspector')) {
        provider.clearResourceCache();
        revalidateVisible(provider);
        treeProvider.refresh();
        navigatorProvider.refresh();
      }
    }),
    new vscode.Disposable(() => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    }),
  );

  revalidateVisible(provider);
}

function revalidateVisible(provider: DiagnosticsProvider): void {
  for (const editor of vscode.window.visibleTextEditors) {
    provider.validate(editor.document);
  }
}

export function deactivate(): void {
  // Disposables registered on the extension context are cleaned up by VS Code.
}

function resolveFavoriteTarget(target?: vscode.Uri | { resourceUri?: vscode.Uri; uri?: string }): vscode.Uri | undefined {
  if (target instanceof vscode.Uri) {
    return target;
  }
  if (target?.resourceUri) {
    return target.resourceUri;
  }
  if (target?.uri) {
    return vscode.Uri.parse(target.uri);
  }
  return vscode.window.activeTextEditor?.document.uri;
}
