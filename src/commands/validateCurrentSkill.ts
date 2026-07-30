import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: validate the SKILL.md in the active editor and report a summary. */
export async function validateCurrentSkill(
  provider: DiagnosticsProvider,
  uri?: Parameters<typeof resolveSkillTarget>[0],
): Promise<void> {
  const target = await resolveSkillTarget(uri, {
    missingEditorMessage: l10n.t('SKILL.md Inspector: open a SKILL.md file to validate.'),
  });
  if (!target) {
    return;
  }

  const analysis = await provider.validate(target.document);
  if (!analysis) {
    vscode.window.showInformationMessage(
      l10n.t('SKILL.md Inspector: validation is disabled in settings.'),
    );
    return;
  }

  const errors = analysis.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = analysis.diagnostics.filter((d) => d.severity === 'warning').length;
  vscode.window.showInformationMessage(
    l10n.t('SKILL.md Inspector: {0} error(s), {1} warning(s). See the Problems panel.', errors, warnings),
  );
}
