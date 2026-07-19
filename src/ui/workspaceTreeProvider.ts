import * as vscode from 'vscode';
import { FAVORITES_KEY, restoreFavorites } from '../navigator/favoritesStore';
import { parentUri, WorkspaceExplorer } from '../navigator/workspaceExplorer';
import type { WorkspaceExplorerNode, WorkspaceRootNode } from '../navigator/workspaceExplorerTypes';

type WorkspaceNode = { type: 'message'; label: string } | WorkspaceExplorerNode;

export class WorkspaceTreeProvider
  implements vscode.TreeDataProvider<WorkspaceNode>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<WorkspaceNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private readonly workspaceExplorer: WorkspaceExplorer;

  constructor(
    private readonly context: vscode.ExtensionContext,
    output: vscode.OutputChannel,
  ) {
    this.workspaceExplorer = new WorkspaceExplorer(output, this.emitter);
  }

  refresh(): void {
    this.workspaceExplorer.invalidate();
    this.emitter.fire(undefined);
  }
  invalidate(uri?: vscode.Uri): void {
    this.workspaceExplorer.invalidate(uri);
  }
  invalidateParent(uri: vscode.Uri): void {
    this.workspaceExplorer.invalidateParent(uri);
  }
  refreshNode(node: WorkspaceExplorerNode): void {
    this.emitter.fire(node);
  }
  getNodeForUri(uri: vscode.Uri): WorkspaceExplorerNode | undefined {
    return this.workspaceExplorer.getNodeForUri(uri);
  }
  getRootForUri(uri: vscode.Uri): WorkspaceRootNode | undefined {
    return this.workspaceExplorer.getRootForUri(uri);
  }

  getChildren(node?: WorkspaceNode): Thenable<WorkspaceNode[]> | WorkspaceNode[] {
    if (!node) {
      const roots = this.workspaceExplorer.getRoots();
      return roots;
    }
    if (node.type === 'workspaceRoot' || node.type === 'workspaceDirectory')
      return this.workspaceExplorer.getChildren(node);
    return [];
  }

  getTreeItem(node: WorkspaceNode): vscode.TreeItem {
    if (node.type === 'message')
      return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    if (node.type === 'workspaceRoot') {
      const item = new vscode.TreeItem(node.folder.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = node.uri;
      item.tooltip = node.uri.toString();
      item.contextValue = 'skillMdInspector.workspaceRoot';
      return item;
    }
    if (node.type === 'workspaceDirectory') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = node.uri;
      item.tooltip = node.uri.toString();
      item.contextValue = 'skillMdInspector.workspaceDirectory';
      return item;
    }
    if (node.type === 'workspaceError') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
      item.contextValue = 'skillMdInspector.workspaceError';
      return item;
    }
    const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
    item.resourceUri = node.uri;
    item.tooltip = node.uri.toString();
    item.command = { command: 'vscode.open', title: 'Open', arguments: [node.uri] };
    if (node.name === 'SKILL.md')
      item.contextValue = this.isFavoriteUri(node.uri)
        ? 'skillMdInspector.favoriteSkillFile'
        : 'skillMdInspector.skillFile';
    else if (node.name === 'AGENTS.md') item.contextValue = 'skillMdInspector.agentsFile';
    else item.contextValue = 'skillMdInspector.workspaceFile';
    return item;
  }

  getParent(node: WorkspaceNode): WorkspaceNode | undefined {
    if (node.type === 'workspaceRoot' || node.type === 'message') return undefined;
    const parent = node.parentUri;
    const root = this.workspaceExplorer
      .getRoots()
      .find((candidate) => candidate.uri.toString() === parent.toString());
    if (root) return root;
    const name = parent.path.split('/').filter(Boolean).pop() ?? parent.toString();
    return {
      type: 'workspaceDirectory',
      id: `workspace-directory:${parent.toString()}`,
      uri: parent,
      name,
      parentUri: parentUri(parent),
    };
  }

  dispose(): void {
    this.workspaceExplorer.dispose();
  }
  onWorkspaceFoldersChanged(): void {
    this.workspaceExplorer.scheduleWorkspaceFoldersChanged();
  }
  onFilesCreatedOrDeleted(uris: readonly vscode.Uri[]): void {
    for (const uri of uris) this.workspaceExplorer.invalidateParent(uri);
    this.emitter.fire(undefined);
  }
  onFilesRenamed(files: readonly { oldUri: vscode.Uri; newUri: vscode.Uri }[]): void {
    for (const file of files) {
      this.workspaceExplorer.invalidateParent(file.oldUri);
      this.workspaceExplorer.invalidateParent(file.newUri);
    }
    this.emitter.fire(undefined);
  }

  private isFavoriteUri(uri: vscode.Uri): boolean {
    return restoreFavorites(this.context.globalState.get(FAVORITES_KEY)).some(
      (entry) => entry.uri === uri.toString(),
    );
  }
}
