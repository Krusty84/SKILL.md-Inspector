import * as vscode from 'vscode';

/** Runs at most one copy of an asynchronous tree-loading operation at a time. */
export class SingleFlight {
  private active: Promise<void> | undefined;

  get isRunning(): boolean {
    return this.active !== undefined;
  }

  run(operation: () => Promise<void> | void): Promise<void> {
    if (this.active) return this.active;
    const active = Promise.resolve()
      .then(operation)
      .finally(() => {
        if (this.active === active) this.active = undefined;
      });
    this.active = active;
    return active;
  }
}

export function loadingTreeItem(label: string): vscode.TreeItem {
  const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
  item.iconPath = new vscode.ThemeIcon('loading~spin');
  return item;
}
