import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';

/** Command: validate every SKILL.md discovered in the workspace. */
export async function validateWorkspaceSkills(provider: DiagnosticsProvider): Promise<void> {
  const count = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Window, title: 'Validating workspace skills...' },
    () => provider.validateWorkspace(),
  );
  vscode.window.showInformationMessage(
    `SKILL.md Inspector: validated ${count} SKILL.md file(s). See the Problems panel.`,
  );
}
