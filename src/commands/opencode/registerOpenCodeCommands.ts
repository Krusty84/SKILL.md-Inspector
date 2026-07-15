import * as vscode from 'vscode';
import { loadOpenCodeSession } from '../../opencode/loadSession';
import { OpenCodeSessionFolderStore } from '../../opencode/sessionFolderStore';
import { readOpenCodeDiscoveryOptions, OpenCodeSessionsTreeProvider } from '../../ui/openCodeSessionsTreeProvider';
import { OpenCodeSessionReportPanel } from '../../ui/openCodeSessionReportWebview';
import { getOpenCodeSessionUriFromTarget, resolveOpenCodeSessionUri, type OpenCodeSessionCommandTarget } from './sessionUriResolver';

export const OPEN_CODE_COMMAND_IDS = [
  'skillMdInspector.openCode.selectSessionsFolder',
  'skillMdInspector.openCode.clearSessionsFolder',
  'skillMdInspector.openCode.refreshSessions',
  'skillMdInspector.openCode.openReport',
  'skillMdInspector.openCode.openRawJson',
  'skillMdInspector.openCode.copySessionId',
  'skillMdInspector.openCode.copyFilePath',
  'skillMdInspector.openCode.revealInOS',
] as const;

export function registerOpenCodeCommands(context: vscode.ExtensionContext, deps: { provider: OpenCodeSessionsTreeProvider; store: OpenCodeSessionFolderStore; output: vscode.OutputChannel }): void {
  const load = async (target?: OpenCodeSessionCommandTarget) => {
    const uri = await resolveOpenCodeSessionUri(target);
    if (!uri) {
      return undefined;
    }
    try {
      return { uri, session: await loadOpenCodeSession(uri, readOpenCodeDiscoveryOptions().maxFileSizeBytes) };
    } catch (e) {
      deps.output.appendLine(`OpenCode load failed for ${uri.toString()}: ${e instanceof Error ? e.stack ?? e.message : String(e)}`);
      void vscode.window.showWarningMessage(String(e instanceof Error ? e.message : e));
      return undefined;
    }
  };
  context.subscriptions.push(
    vscode.commands.registerCommand('skillMdInspector.openCode.selectSessionsFolder', async () => {
      const picked = await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Select OpenCode Sessions Folder' });
      if (!picked?.[0]) return;
      await deps.store.set(picked[0]);
      await deps.provider.refresh();
    }),
    vscode.commands.registerCommand('skillMdInspector.openCode.clearSessionsFolder', async () => { await deps.store.clear(); await deps.provider.refresh(); }),
    vscode.commands.registerCommand('skillMdInspector.openCode.refreshSessions', async () => deps.provider.refresh()),
    vscode.commands.registerCommand('skillMdInspector.openCode.openReport', async (target?: OpenCodeSessionCommandTarget) => { const loaded = await load(target); if (loaded) OpenCodeSessionReportPanel.show(loaded.session); }),
    vscode.commands.registerCommand('skillMdInspector.openCode.openRawJson', async (target?: OpenCodeSessionCommandTarget) => { const uri = await resolveOpenCodeSessionUri(target); if (uri) await vscode.commands.executeCommand('vscode.open', uri); }),
    vscode.commands.registerCommand('skillMdInspector.openCode.copySessionId', async (target?: OpenCodeSessionCommandTarget) => { const summary = target && typeof target === 'object' ? (target as { summary?: { id?: string } }).summary : undefined; if (summary?.id) await vscode.env.clipboard.writeText(summary.id); }),
    vscode.commands.registerCommand('skillMdInspector.openCode.copyFilePath', async (target?: OpenCodeSessionCommandTarget) => { const uri = getOpenCodeSessionUriFromTarget(target); if (uri) await vscode.env.clipboard.writeText(uri.fsPath || uri.toString()); }),
    vscode.commands.registerCommand('skillMdInspector.openCode.revealInOS', async (target?: OpenCodeSessionCommandTarget) => { const uri = getOpenCodeSessionUriFromTarget(target); if (uri?.scheme === 'file') await vscode.commands.executeCommand('revealFileInOS', uri); }),
  );
}
