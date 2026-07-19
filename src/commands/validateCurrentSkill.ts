import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: validate the SKILL.md in the active editor and report a summary. */
export async function validateCurrentSkill(
  provider: DiagnosticsProvider,
  uri?: Parameters<typeof resolveSkillTarget>[0],
): Promise<void> {
  const target = await resolveSkillTarget(uri, { warningAction: 'validate' });
  if (!target) {
    return;
  }

  const analysis = provider.validate(target.document);
  if (!analysis) {
    vscode.window.showInformationMessage('SKILL.md Inspector: validation is disabled in settings.');
    return;
  }

  const errors = analysis.diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = analysis.diagnostics.filter((d) => d.severity === 'warning').length;
  vscode.window.showInformationMessage(
    `SKILL.md Inspector: ${errors} error(s), ${warnings} warning(s). See the Problems panel.`,
  );
}
