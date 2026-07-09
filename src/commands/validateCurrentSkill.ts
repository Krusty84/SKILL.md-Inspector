import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';
import { isSkillFile } from '../diagnostics/mapping';

/** Command: validate the SKILL.md in the active editor and report a summary. */
export function validateCurrentSkill(provider: DiagnosticsProvider): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage('SKILL.md Inspector: open a SKILL.md file to validate.');
    return;
  }
  if (!isSkillFile(editor.document)) {
    vscode.window.showWarningMessage('SKILL.md Inspector: the active file is not a SKILL.md file.');
    return;
  }

  const analysis = provider.validate(editor.document);
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
