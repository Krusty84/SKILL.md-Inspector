import * as path from 'node:path';
import * as vscode from 'vscode';
import { computeWorkspaceAnalysisOnline } from '../analysis/workspaceAnalysis';
import { buildSkillsIndex } from '../workspace/analyzeWorkspace';

/** Command: write skills.index.json for the workspace (brief §13.6). */
export async function exportSkillsIndex(): Promise<void> {
  const result = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Analyzing skills for index',
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
    vscode.window.showWarningMessage('SKILL.md Inspector: open a folder to export a skills index.');
    return;
  }
  if (result.analysis.cancelled) {
    vscode.window.showWarningMessage(
      'SKILL.md Inspector: index export cancelled; nothing written.',
    );
    return;
  }

  const index = buildSkillsIndex(result.analysis);
  const target = vscode.Uri.file(path.join(result.rootDir, 'skills.index.json'));
  const content = `${JSON.stringify(index, null, 2)}\n`;
  await vscode.workspace.fs.writeFile(target, Buffer.from(content, 'utf8'));

  const document = await vscode.workspace.openTextDocument(target);
  await vscode.window.showTextDocument(document);
  vscode.window.showInformationMessage(
    `SKILL.md Inspector: exported ${index.skills.length} skill(s) to skills.index.json.`,
  );
}
