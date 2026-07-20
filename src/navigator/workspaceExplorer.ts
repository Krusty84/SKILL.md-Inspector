import * as vscode from 'vscode';
import { createWorkspaceExcludeMatcher } from './workspaceExcludes';
import { compareWorkspaceNodes, isDirectoryType } from './workspaceSorting';
import type {
  WorkspaceContainerNode,
  WorkspaceExplorerChild,
  WorkspaceExplorerNode,
  WorkspaceRootNode,
} from './workspaceExplorerTypes';

export class WorkspaceExplorer implements vscode.Disposable {
  private readonly cache = new Map<string, WorkspaceExplorerNode[]>();
  private readonly pendingLoads = new Map<string, Promise<void>>();
  private readonly watchers = new Map<string, vscode.FileSystemWatcher>();
  private readonly pendingRefreshes = new Map<string, WorkspaceExplorerNode | undefined>();
  private debounceTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly output: vscode.OutputChannel,
    private readonly emitter?: { fire(data: WorkspaceExplorerNode | undefined): void },
  ) {
    this.rebuildWatchers();
  }

  getRoots(): WorkspaceRootNode[] {
    return (vscode.workspace.workspaceFolders ?? []).map((folder) => ({
      type: 'workspaceRoot',
      id: `workspace-root:${folder.uri.toString()}`,
      folder,
      uri: folder.uri,
    }));
  }

  getChildren(node: WorkspaceContainerNode): WorkspaceExplorerChild[] {
    const key = this.key(node.uri);
    const cached = this.cache.get(key);
    if (cached) return cached;
    if (!this.pendingLoads.has(key)) {
      const load = Promise.resolve()
        .then(() => this.loadChildren(node))
        .finally(() => {
          this.pendingLoads.delete(key);
          this.emitter?.fire(node);
        });
      this.pendingLoads.set(key, load);
    }
    return [
      {
        type: 'loading',
        id: `workspace-loading:${node.uri.toString()}`,
        label: 'Loading folder…',
        parentUri: node.uri,
      },
    ];
  }

  private async loadChildren(node: WorkspaceContainerNode): Promise<void> {
    const key = this.key(node.uri);
    try {
      const matcher = createWorkspaceExcludeMatcher(
        node.type === 'workspaceRoot' ? node.folder : this.folderFor(node.uri),
      );
      const entries = await vscode.workspace.fs.readDirectory(node.uri);
      const children = entries
        .map(([name, fileType]) => this.toNode(node.uri, name, fileType))
        .filter((child) => child.type === 'workspaceDirectory' || child.type === 'workspaceFile')
        .filter((child) => !matcher.excludes(child.uri, child.name))
        .sort(compareWorkspaceNodes);
      this.cache.set(key, children);
    } catch (error) {
      this.output.appendLine(
        `Unable to read workspace folder ${node.uri.toString()}: ${String(error)}`,
      );
      const child: WorkspaceExplorerNode = {
        type: 'workspaceError',
        id: `workspace-error:${node.uri.toString()}`,
        label: 'Unable to read this folder.',
        parentUri: node.uri,
      };
      this.cache.set(key, [child]);
    }
  }

  invalidate(uri?: vscode.Uri): void {
    if (!uri) {
      this.cache.clear();
      return;
    }
    this.cache.delete(this.key(uri));
  }

  invalidateParent(uri: vscode.Uri): void {
    this.invalidate(parentUri(uri));
  }

  getNodeForUri(uri: vscode.Uri): WorkspaceExplorerNode | undefined {
    return this.nodeForUri(uri);
  }

  getRootForUri(uri: vscode.Uri): WorkspaceRootNode | undefined {
    return this.getRoots().find((node) => node.uri.toString() === uri.toString());
  }

  rebuildWatchers(): void {
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
    for (const folder of vscode.workspace.workspaceFolders ?? []) {
      const watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*'),
      );
      watcher.onDidCreate((uri) => this.invalidateParentAndSchedule(uri));
      watcher.onDidDelete((uri) => this.invalidateParentAndSchedule(uri));
      watcher.onDidChange((uri) => this.invalidateParentAndSchedule(uri));
      this.watchers.set(folder.uri.toString(), watcher);
    }
  }

  scheduleWorkspaceFoldersChanged(): void {
    this.invalidate();
    this.rebuildWatchers();
    this.scheduleRefresh(undefined);
  }

  dispose(): void {
    for (const watcher of this.watchers.values()) watcher.dispose();
    this.watchers.clear();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
  }

  private toNode(
    parent: vscode.Uri,
    name: string,
    fileType: vscode.FileType,
  ): WorkspaceExplorerNode {
    const uri = vscode.Uri.joinPath(parent, name);
    if (isDirectoryType(fileType))
      return {
        type: 'workspaceDirectory',
        id: `workspace-directory:${uri.toString()}`,
        uri,
        name,
        parentUri: parent,
      };
    return {
      type: 'workspaceFile',
      id: `workspace-file:${uri.toString()}`,
      uri,
      name,
      fileType,
      parentUri: parent,
    };
  }

  private folderFor(uri: vscode.Uri): vscode.WorkspaceFolder {
    return (
      vscode.workspace.getWorkspaceFolder(uri) ??
      vscode.workspace.workspaceFolders?.[0] ?? {
        uri,
        name: uri.path.split('/').filter(Boolean).pop() ?? uri.toString(),
        index: 0,
      }
    );
  }

  private invalidateParentAndSchedule(uri: vscode.Uri): void {
    const parent = parentUri(uri);
    this.invalidate(parent);
    this.scheduleRefresh(this.nodeForUri(parent));
  }

  private scheduleRefresh(node: WorkspaceExplorerNode | undefined): void {
    this.pendingRefreshes.set(node?.id ?? 'root', node);
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      const nodes = [...this.pendingRefreshes.values()];
      this.pendingRefreshes.clear();
      for (const pending of nodes) this.emitter?.fire(pending);
    }, 300);
  }

  private nodeForUri(uri: vscode.Uri): WorkspaceExplorerNode | undefined {
    const root = this.getRoots().find((node) => node.uri.toString() === uri.toString());
    if (root) return root;
    const name = uri.path.split('/').filter(Boolean).pop() ?? uri.toString();
    return {
      type: 'workspaceDirectory',
      id: `workspace-directory:${uri.toString()}`,
      uri,
      name,
      parentUri: parentUri(uri),
    };
  }

  private key(uri: vscode.Uri): string {
    return uri.toString();
  }
}

export function parentUri(uri: vscode.Uri): vscode.Uri {
  const parts = uri.path.split('/').filter(Boolean);
  const parentPath = `/${parts.slice(0, -1).join('/')}`;
  return uri.with({ path: parentPath === '/' ? '/' : parentPath });
}
