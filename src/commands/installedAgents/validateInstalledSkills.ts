import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../../diagnostics/diagnosticsProvider';
import type {
  InstalledAgentsNode,
  InstalledAgentsTreeProvider,
} from '../../ui/installedAgentsTreeProvider';

/**
 * Command: validate every SKILL.md under a right-clicked INSTALLED AGENTS folder
 * row (agent / group / skill / subfolder), publishing diagnostics to the Problems
 * panel. Unlike the workspace command, this acts on the clicked node's scope.
 */
export async function validateInstalledSkills(
  installedProvider: InstalledAgentsTreeProvider,
  diagnostics: DiagnosticsProvider,
  node?: InstalledAgentsNode,
): Promise<void> {
  if (!node) {
    return;
  }
  const paths = installedProvider.resolveSkillMdPathsForNode(node);
  if (paths.length === 0) {
    vscode.window.showInformationMessage(
      l10n.t('SKILL.md Inspector: no SKILL.md files found in this scope.'),
    );
    return;
  }
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: l10n.t('Validating installed skills'),
      cancellable: true,
    },
    (progress, token) => diagnostics.validatePaths(paths, token, progress),
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
