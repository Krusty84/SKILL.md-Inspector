import * as path from 'node:path';
import * as vscode from 'vscode';
import { computeScopedAnalysisOnline } from '../../analysis/workspaceAnalysis';
import { WorkspaceReportPanel } from '../../ui/workspaceReportWebview';
import type {
  InstalledAgentsNode,
  InstalledAgentsTreeProvider,
} from '../../ui/installedAgentsTreeProvider';

/**
 * Common ancestor directory of the given file paths. Used as the (cosmetic)
 * report root for an installed-scope report whose skills may span several roots.
 */
export function commonAncestorDir(paths: string[]): string {
  const dirs = paths.map((p) => path.dirname(p));
  if (dirs.length === 0) {
    return path.sep;
  }
  let prefix = dirs[0].split(path.sep);
  for (const dir of dirs.slice(1)) {
    const segments = dir.split(path.sep);
    let i = 0;
    while (i < prefix.length && i < segments.length && prefix[i] === segments[i]) {
      i += 1;
    }
    prefix = prefix.slice(0, i);
  }
  return prefix.join(path.sep) || path.sep;
}

/**
 * Command: open an aggregate report (collisions, resources) for the
 * SKILL.md files under a right-clicked INSTALLED AGENTS folder row.
 */
export async function showInstalledReport(
  installedProvider: InstalledAgentsTreeProvider,
  node?: InstalledAgentsNode,
): Promise<void> {
  if (!node) {
    return;
  }
  const paths = installedProvider.resolveSkillMdPathsForNode(node);
  if (paths.length === 0) {
    vscode.window.showInformationMessage(
      'SKILL.md Inspector: no SKILL.md files found in this scope.',
    );
    return;
  }
  const analysisRoot = commonAncestorDir(paths);
  const folderPath =
    node.type === 'skill' || node.type === 'workspaceDirectory'
      ? node.uri.fsPath
      : analysisRoot;
  const analysis = await vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: 'Building installed skills report',
      cancellable: true,
    },
    (progress, token) =>
      computeScopedAnalysisOnline(
        analysisRoot,
        paths,
        {
          cancel: token,
          onProgress: (done, total) =>
            progress.report({
              message: `${done}/${total}`,
              increment: total > 0 ? 100 / total : 0,
            }),
        },
        vscode.Uri.file(paths[0]),
      ),
  );

  if (analysis.cancelled) {
    vscode.window.showWarningMessage(
      'SKILL.md Inspector: installed skills report cancelled; not shown.',
    );
    return;
  }
  WorkspaceReportPanel.show(analysis, {
    kind: 'installed-agent',
    agentLabel: installedProvider.resolveAgentLabelForNode(node) ?? 'Unknown agent',
    folderPath,
  });
}
