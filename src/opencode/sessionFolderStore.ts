import * as vscode from 'vscode';
const KEY = 'skillMdInspector.openCode.sessionsFolder';
export class OpenCodeSessionFolderStore {
  constructor(private readonly context: vscode.ExtensionContext) {}
  get(): vscode.Uri | undefined { const raw = this.context.workspaceState.get<string>(KEY) ?? this.context.globalState.get<string>(KEY); return raw ? vscode.Uri.parse(raw) : undefined; }
  async set(uri: vscode.Uri): Promise<void> { const target = vscode.workspace.workspaceFolders?.length ? this.context.workspaceState : this.context.globalState; await target.update(KEY, uri.toString()); }
  async clear(): Promise<void> { await this.context.workspaceState.update(KEY, undefined); await this.context.globalState.update(KEY, undefined); }
}
