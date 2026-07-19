import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { FAVORITES_KEY, restoreFavorites } from '../navigator/favoritesStore';

type FavoriteNode =
  | { type: 'message'; label: string }
  | { type: 'favorite'; uri: string; exists: boolean; fsPath?: string };

export class FavoritesTreeProvider implements vscode.TreeDataProvider<FavoriteNode> {
  private readonly emitter = new vscode.EventEmitter<FavoriteNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;

  constructor(private readonly context: vscode.ExtensionContext) {}

  refresh(): void {
    this.emitter.fire(undefined);
  }

  getChildren(node?: FavoriteNode): FavoriteNode[] {
    if (node) return [];
    const entries = restoreFavorites(this.context.globalState.get(FAVORITES_KEY));
    if (entries.length === 0)
      return [{ type: 'message', label: 'No favorite SKILL.md files yet.' }];
    return entries.map((entry) => {
      const uri = vscode.Uri.parse(entry.uri);
      const fsPath = uri.scheme === 'file' ? uri.fsPath : undefined;
      return { type: 'favorite', uri: entry.uri, fsPath, exists: !!fsPath && this.exists(fsPath) };
    });
  }

  getTreeItem(node: FavoriteNode): vscode.TreeItem {
    if (node.type === 'message')
      return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    const item = new vscode.TreeItem(
      node.fsPath ? path.basename(path.dirname(node.fsPath)) : 'Missing Favorite',
      vscode.TreeItemCollapsibleState.None,
    );
    item.description = node.exists && node.fsPath ? path.dirname(node.fsPath) : 'Missing';
    item.tooltip = node.fsPath ?? node.uri;
    item.iconPath = new vscode.ThemeIcon(node.exists ? 'star-full' : 'warning');
    item.contextValue = node.exists
      ? 'skillMdInspector.favoriteSkillFile'
      : 'skillMdInspector.missingFavorite';
    if (node.exists && node.fsPath) {
      const uri = vscode.Uri.file(node.fsPath);
      item.resourceUri = uri;
      item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    } else {
      item.command = {
        command: 'skillMdInspector.openFavorite',
        title: 'Open Favorite',
        arguments: [node.uri],
      };
    }
    return item;
  }

  private exists(fsPath: string): boolean {
    try {
      return existsSync(fsPath);
    } catch {
      return false;
    }
  }
}
