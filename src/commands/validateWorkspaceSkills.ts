import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';

/** Command: validate every SKILL.md in the workspace, with progress and cancellation. */
export async function validateWorkspaceSkills(provider: DiagnosticsProvider): Promise<void> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Validating workspace skills',
      cancellable: true,
    },
    (progress, token) => provider.validateWorkspace(token, progress),
  );

  if (result.cancelled) {
    vscode.window.showWarningMessage(
      `SKILL.md Inspector: validation cancelled after ${result.processed} of ${result.total} file(s); results are partial.`,
    );
    return;
  }
  vscode.window.showInformationMessage(
    `SKILL.md Inspector: validated ${result.processed} SKILL.md file(s). See the Problems panel.`,
  );
}
