import * as vscode from 'vscode';
import {
  DEFAULT_OPEN_CODE_DISCOVERY,
  discoverOpenCodeSessions,
} from '../opencode/sessionDiscovery';
import { OpenCodeSessionFolderStore } from '../opencode/sessionFolderStore';
import type { DiscoveryOptions, SessionSummary } from '../opencode/model';
import { SingleFlight } from './treeLoading';

const WATCHER_REFRESH_DEBOUNCE_MS = 250;

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

export class OpenCodeSessionsLoadingTreeItem extends vscode.TreeItem {
  readonly type = 'loading';

  constructor() {
    super('Scanning OpenCode sessions…', vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('loading~spin');
  }
}

export type OpenCodeSessionsNode = OpenCodeSessionTreeItem | OpenCodeSessionsLoadingTreeItem;

export class OpenCodeSessionsTreeProvider
  implements vscode.TreeDataProvider<OpenCodeSessionsNode>, vscode.Disposable
{
  private readonly emitter = new vscode.EventEmitter<OpenCodeSessionsNode | undefined | void>();
  readonly onDidChangeTreeData = this.emitter.event;
  private sessions: SessionSummary[] = [];
  private hasScanned = false;
  private scanAttempted = false;
  private readonly sessionLoad = new SingleFlight();
  private watcher?: vscode.FileSystemWatcher;
  private watcherRefreshTimer: ReturnType<typeof setTimeout> | undefined;
  private watcherRefreshQueued = false;
  constructor(
    private readonly store: OpenCodeSessionFolderStore,
    private readonly output: vscode.OutputChannel,
  ) {}
  dispose(): void {
    this.emitter.dispose();
    this.watcher?.dispose();
    if (this.watcherRefreshTimer) clearTimeout(this.watcherRefreshTimer);
  }
  getTreeItem(element: OpenCodeSessionsNode): vscode.TreeItem {
    return element;
  }
  getChildren(element?: OpenCodeSessionsNode): OpenCodeSessionsNode[] {
    if (element instanceof OpenCodeSessionsLoadingTreeItem) return [];
    if (!element && !this.hasScanned) {
      if (!this.scanAttempted) void this.refresh();
      if (this.sessionLoad.isRunning) return [new OpenCodeSessionsLoadingTreeItem()];
    }
    return (element ? element.summary.children : this.sessions).map(
      (s) => new OpenCodeSessionTreeItem(s),
    );
  }
  refresh(): Promise<void> {
    const wasRunning = this.sessionLoad.isRunning;
    this.scanAttempted = true;
    const operation = this.sessionLoad.run(async () => {
      try {
        await this.scan();
      } finally {
        this.emitter.fire();
      }
    });
    if (!wasRunning) {
      this.emitter.fire();
      void operation
        .catch((error: unknown) => {
          this.output.appendLine(`OpenCode sessions refresh failed: ${String(error)}`);
        })
        .finally(() => {
          if (this.watcherRefreshQueued) {
            this.watcherRefreshQueued = false;
            void this.refresh();
          }
        });
    }
    return operation;
  }

  private async scan(): Promise<void> {
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
      this.hasScanned = true;
      return;
    }
    try {
      const sessions = await vscode.window.withProgress(
        { location: { viewId: 'skillMdInspectorOpenCodeSessions' } },
        () => discoverOpenCodeSessions(folder, readOpenCodeDiscoveryOptions(), this.output),
      );
      this.sessions = sessions;
      this.hasScanned = true;
      this.watcher = vscode.workspace.createFileSystemWatcher(
        new vscode.RelativePattern(folder, '**/*.json'),
      );
      const schedule = () => this.scheduleWatcherRefresh();
      this.watcher.onDidCreate(schedule);
      this.watcher.onDidChange(schedule);
      this.watcher.onDidDelete(schedule);
    } catch (e) {
      this.output.appendLine(`OpenCode sessions refresh failed: ${String(e)}`);
      void vscode.window.showWarningMessage('Unable to refresh OpenCode sessions folder.');
    }
  }

  private scheduleWatcherRefresh(): void {
    if (this.watcherRefreshTimer) clearTimeout(this.watcherRefreshTimer);
    this.watcherRefreshTimer = setTimeout(() => {
      this.watcherRefreshTimer = undefined;
      if (this.sessionLoad.isRunning) {
        this.watcherRefreshQueued = true;
        return;
      }
      void this.refresh();
    }, WATCHER_REFRESH_DEBOUNCE_MS);
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
