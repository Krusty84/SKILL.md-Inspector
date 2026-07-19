import * as vscode from 'vscode';
import { computeWorkspaceAnalysisOnline } from '../analysis/workspaceAnalysis';
import { WorkspaceReportPanel } from '../ui/workspaceReportWebview';

/** Command: open the workspace report (collisions, portability, resources). */
export async function showWorkspaceReport(): Promise<void> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Building workspace report',
      cancellable: true,
    },
    (progress, token) =>
      computeWorkspaceAnalysisOnline({
        cancel: token,
        onProgress: (done, total) =>
          progress.report({
            message: `${done}/${total}`,
            increment: total > 0 ? 100 / total : 0,
          }),
      }),
  );

  if (!result) {
    vscode.window.showWarningMessage(
      'SKILL.md Inspector: open a folder to build a workspace report.',
    );
    return;
  }
  if (result.analysis.cancelled) {
    vscode.window.showWarningMessage('SKILL.md Inspector: workspace report cancelled; not shown.');
    return;
  }
  WorkspaceReportPanel.show(result.analysis);
}
