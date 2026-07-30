import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';

/** Command: validate every SKILL.md in the workspace, with progress and cancellation. */
export async function validateWorkspaceSkills(provider: DiagnosticsProvider): Promise<void> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: l10n.t('Validating workspace skills'),
      cancellable: true,
    },
    (progress, token) => provider.validateWorkspace(token, progress),
  );

  if (result.cancelled) {
    vscode.window.showWarningMessage(
      l10n.t(
        'SKILL.md Inspector: validation cancelled after {0} of {1} file(s); results are partial.',
        result.processed,
        result.total,
      ),
    );
    return;
  }
  vscode.window.showInformationMessage(
    l10n.t(
      'SKILL.md Inspector: validated {0} SKILL.md file(s). See the Problems panel.',
      result.processed,
    ),
  );
}
