import * as vscode from 'vscode';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { isSkillFile } from '../diagnostics/mapping';
import { buildReportModel } from '../ui/reportModel';
import { SkillReportPanel } from '../ui/skillReportWebview';

/** Command: build and show the read-only Skill Report for the active SKILL.md. */
export function showSkillReport(): void {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSkillFile(editor.document)) {
    vscode.window.showWarningMessage('SKILL.md Inspector: open a SKILL.md file to show its report.');
    return;
  }

  const config = readConfig(editor.document.uri);
  const { document, diagnostics } = analyzeSkill(
    editor.document.uri.fsPath,
    editor.document.getText(),
    config.profile,
  );
  const report = buildReportModel(document, diagnostics, config.profile.label);
  SkillReportPanel.show(report);
}
