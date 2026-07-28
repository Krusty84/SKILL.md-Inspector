import * as vscode from 'vscode';

/** Runs at most one copy of an asynchronous tree-loading operation at a time. */
export class SingleFlight {
  private active: Promise<void> | undefined;
  private queuedOperation: (() => Promise<void> | void) | undefined;
  private queuedCompletion: Promise<void> | undefined;
  private queuedResolve: (() => void) | undefined;
  private queuedReject: ((reason: unknown) => void) | undefined;

  get isRunning(): boolean {
    return this.active !== undefined;
  }

  /**
   * Joins the in-flight operation when one is active; a busy-time request is
   * DROPPED, not queued. Use {@link runLatest} when the caller needs the
   * eventual state to reflect its request.
   */
  run(operation: () => Promise<void> | void): Promise<void> {
    if (this.active) return this.active;
    return this.start(operation);
  }

  /**
   * Like {@link run}, but a request arriving while an operation is active
   * queues exactly one trailing re-run — any number of busy-time requests
   * coalesce, the latest operation wins — so the final state always reflects
   * the newest request. Without this, a refresh requested during an active
   * analysis was silently discarded and the view kept stale results.
   */
  runLatest(operation: () => Promise<void> | void): Promise<void> {
    if (!this.active) {
      return this.start(operation);
    }
    this.queuedOperation = operation;
    this.queuedCompletion ??= new Promise<void>((resolve, reject) => {
      this.queuedResolve = resolve;
      this.queuedReject = reject;
    });
    return this.queuedCompletion;
  }

  private start(operation: () => Promise<void> | void): Promise<void> {
    const active = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.active === active) this.active = undefined;
        // A request queued during this run (including during a trailing run)
        // starts the next one; the loop ends when nothing new was queued.
        this.drainQueue();
      });
    this.active = active;
    return active;
  }

  private drainQueue(): void {
    const operation = this.queuedOperation;
    if (!operation) return;
    const resolve = this.queuedResolve;
    const reject = this.queuedReject;
    this.queuedOperation = undefined;
    this.queuedCompletion = undefined;
    this.queuedResolve = undefined;
    this.queuedReject = undefined;
    this.start(operation).then(resolve, reject);
  }
}

export function loadingTreeItem(label: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('loading~spin');
  return item;
}
