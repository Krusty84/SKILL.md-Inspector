import * as vscode from 'vscode';
import {
  DEFAULT_OPEN_CODE_DISCOVERY,
  discoverOpenCodeSessions,
} from '../opencode/sessionDiscovery';
import { OpenCodeSessionFolderStore } from '../opencode/sessionFolderStore';
import type { DiscoveryOptions, SessionSummary } from '../opencode/model';

export class OpenCodeSessionTreeItem extends vscode.TreeItem {
  constructor(public readonly summary: SessionSummary) {
    super(
      summary.title,
      summary.children.length
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    this.id = summary.uriString;
    this.resourceUri = summary.uri;
    this.contextValue =
      summary.uri.scheme === 'file'
        ? 'skillMdInspector.openCodeSession.file'
        : 'skillMdInspector.openCodeSession';
    this.description = [
      summary.updated ? new Date(summary.updated).toLocaleString() : undefined,
      [summary.provider, summary.model].filter(Boolean).join('/') || undefined,
      `${summary.toolCalls} tools`,
      `${summary.skillCalls} skills`,
      summary.errors ? `${summary.errors} errors` : undefined,
    ]
      .filter(Boolean)
      .join(' · ');
    this.tooltip = summary.uriString;
    this.command = {
      command: 'skillMdInspector.openCode.openReport',
      title: 'Open OpenCode Session Report',
      arguments: [this],
    };
    this.iconPath = new vscode.ThemeIcon(summary.errors ? 'warning' : 'debug-alt');
  }
}
export class OpenCodeSessionsTreeProvider
  implements vscode.TreeDataProvider<OpenCodeSessionTreeItem>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<OpenCodeSessionTreeItem | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private sessions: SessionSummary[] = [];
  private watcher?: vscode.FileSystemWatcher;
  constructor(
    private readonly store: OpenCodeSessionFolderStore,
    private readonly output: vscode.OutputChannel,
  ) {}
  dispose(): void {
    this.emitter.dispose();
    this.watcher?.dispose();
  }
  getTreeItem(element: OpenCodeSessionTreeItem): vscode.TreeItem {
    return element;
  }
  getChildren(element?: OpenCodeSessionTreeItem): OpenCodeSessionTreeItem[] {
    return (element ? element.summary.children : this.sessions).map(
      (s) => new OpenCodeSessionTreeItem(s),
    );
  }
  async refresh(): Promise<void> {
    const folder = this.store.get();
    await vscode.commands.executeCommand(
      'setContext',
      'skillMdInspector.openCode.hasFolder',
      !!folder,
    );
    this.watcher?.dispose();
    this.watcher = undefined;
    if (!folder) {
      this.sessions = [];
      this.emitter.fire();
      return;
    }
    try {
      this.sessions = await discoverOpenCodeSessions(
        folder,
        readOpenCodeDiscoveryOptions(),
        this.output,
      );
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.json'),
      );
      const fire = () => void this.refresh();
      this.watcher.onDidCreate(fire);
      this.watcher.onDidChange(fire);
      this.watcher.onDidDelete(fire);
    } catch (e) {
      this.output.appendLine(`OpenCode sessions refresh failed: ${String(e)}`);
      void vscode.window.showWarningMessage('Unable to refresh OpenCode sessions folder.');
    }
    this.emitter.fire();
  }
}
export function readOpenCodeDiscoveryOptions(): DiscoveryOptions {
  const cfg = vscode.workspace.getConfiguration('skillMdInspector.openCode');
  const mb = Math.max(1, Math.min(100, cfg.get<number>('maxSessionFileSizeMb', 25)));
  return {
    ...DEFAULT_OPEN_CODE_DISCOVERY,
    maxFileSizeBytes: mb * 1024 * 1024,
    maxDiscoveredSessions: Math.max(
      1,
      Math.min(10000, cfg.get<number>('maxDiscoveredSessions', 1000)),
    ),
    maxPreviewCharacters: Math.max(
      1000,
      Math.min(100000, cfg.get<number>('maxPreviewCharacters', 20000)),
    ),
    scanRecursively: cfg.get<boolean>('scanRecursively', true),
  };
}
