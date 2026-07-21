import * as vscode from 'vscode';
import { FAVORITES_KEY, restoreFavorites, updateFavoriteUri } from './favoritesStore';

/**
 * The slice of each SKILL.md navigator view that the shared workspace file
 * watchers need to poke. Kept deliberately narrow so the views stay separated:
 * a workspace file event reaches only the views that actually depend on that
 * file. Notably there is *no* INSTALLED AGENTS hook here — those skills are
 * discovered from agent roots outside the workspace, so workspace file changes
 * can never affect that view and must not refresh it.
 */
export interface NavigatorWatcherDeps {
  /** Bottom-panel Skills analysis view — lists every workspace SKILL.md. */
  refreshSkillsPanel(): void;
  /** WORKSPACE tree — invalidates the parent folder of each changed file. */
  onWorkspaceFilesCreatedOrDeleted(uris: readonly vscode.Uri[]): void;
  /** WORKSPACE tree — re-reads the folders touched by a rename. */
  onWorkspaceFilesRenamed(
    files: readonly { readonly oldUri: vscode.Uri; readonly newUri: vscode.Uri }[],
  ): void;
  /** FAVORITES tree — only re-rendered when a favorited file itself changed. */
  refreshFavorites(): void;
  /** Recomputes the `skillMdInspector.hasFavorites` context key. */
  updateFavoritesContext(): void;
}

/**
 * Minimal structural view of the extension context this wiring touches. Using a
 * narrow type (instead of `vscode.ExtensionContext`) keeps the module trivially
 * testable without constructing a full context.
 */
export interface NavigatorWatcherHost {
  globalState: Pick<vscode.Memento, 'get' | 'update'>;
  subscriptions: { push(...items: vscode.Disposable[]): unknown };
}

/**
 * Wire the workspace file watchers that keep the SKILL.md navigator views in
 * sync — while keeping the views independent. Each event is routed only to the
 * views it affects:
 *
 * - Creating/deleting a workspace `SKILL.md` updates the WORKSPACE tree and the
 *   Skills analysis panel. FAVORITES is refreshed only when the changed file is
 *   itself a favorite (its missing/exists badge flips).
 * - Creating/deleting/changing an `AGENTS.md` only updates the WORKSPACE tree.
 * - Renaming files updates the WORKSPACE tree, and only rewrites/refreshes
 *   FAVORITES when a favorited file was actually moved.
 *
 * INSTALLED AGENTS and OPENCODE SESSIONS are intentionally never touched here:
 * they own data outside the workspace and refresh on their own triggers.
 */
export function registerNavigatorWatchers(
  host: NavigatorWatcherHost,
  deps: NavigatorWatcherDeps,
): void {
  const isFavoriteUri = (uri: vscode.Uri): boolean =>
    restoreFavorites(host.globalState.get(FAVORITES_KEY)).some(
      (entry) => entry.uri === uri.toString(),
    );

  const skillWatcher = vscode.workspace.createFileSystemWatcher('**/SKILL.md');
  const onWorkspaceSkillChange = (uri: vscode.Uri): void => {
    deps.refreshSkillsPanel();
    deps.onWorkspaceFilesCreatedOrDeleted([uri]);
    if (isFavoriteUri(uri)) deps.refreshFavorites();
  };
  skillWatcher.onDidCreate(onWorkspaceSkillChange);
  skillWatcher.onDidDelete(onWorkspaceSkillChange);

  const agentsWatcher = vscode.workspace.createFileSystemWatcher('**/AGENTS.md');
  const onAgentsChange = (uri: vscode.Uri): void => deps.onWorkspaceFilesCreatedOrDeleted([uri]);
  agentsWatcher.onDidCreate(onAgentsChange);
  agentsWatcher.onDidDelete(onAgentsChange);
  agentsWatcher.onDidChange(onAgentsChange);

  const renameListener = vscode.workspace.onDidRenameFiles(async (event) => {
    const before = restoreFavorites(host.globalState.get(FAVORITES_KEY));
    let favorites = before;
    for (const file of event.files)
      favorites = updateFavoriteUri(favorites, file.oldUri.toString(), file.newUri.toString());
    const favoritesChanged =
      favorites.length !== before.length ||
      favorites.some((entry, index) => entry.uri !== before[index]?.uri);
    if (favoritesChanged) {
      await host.globalState.update(FAVORITES_KEY, favorites);
      deps.updateFavoritesContext();
      deps.refreshFavorites();
    }
    deps.onWorkspaceFilesRenamed(event.files);
  });

  host.subscriptions.push(skillWatcher, agentsWatcher, renameListener);
}
