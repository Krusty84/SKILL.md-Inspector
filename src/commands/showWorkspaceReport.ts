import * as vscode from 'vscode';
import { computeWorkspaceAnalysis } from '../analysis/workspaceAnalysis';
import { WorkspaceReportPanel } from '../ui/workspaceReportWebview';

/** Command: open the workspace report (collisions, portability, resources). */
export function showWorkspaceReport(): void {
  const result = computeWorkspaceAnalysis();
  if (!result) {
    vscode.window.showWarningMessage('SKILL.md Inspector: open a folder to build a workspace report.');
    return;
  }
  WorkspaceReportPanel.show(result.analysis);
}
