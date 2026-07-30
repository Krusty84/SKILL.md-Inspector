import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import type { OpenCodeSessionTreeItem } from '../../ui/openCodeSessionsTreeProvider';

export type OpenCodeSessionCommandTarget = unknown;

export interface OpenCodeSessionUriResolverDeps {
  showOpenDialog(options: vscode.OpenDialogOptions): Thenable<vscode.Uri[] | undefined>;
}

export function getOpenCodeSessionUriFromTarget(
  target: OpenCodeSessionCommandTarget,
): vscode.Uri | undefined {
  if (target instanceof vscode.Uri) {
    return target;
  }
  if (!target || typeof target !== 'object') {
    return undefined;
  }
  const record = target as Partial<OpenCodeSessionTreeItem> & { resourceUri?: unknown };
  if (record.summary?.uri instanceof vscode.Uri) {
    return record.summary.uri;
  }
  if (record.resourceUri instanceof vscode.Uri) {
    return record.resourceUri;
  }
  return undefined;
}

export async function resolveOpenCodeSessionUri(
  target: OpenCodeSessionCommandTarget,
  deps: OpenCodeSessionUriResolverDeps = vscode.window,
): Promise<vscode.Uri | undefined> {
  const uri = getOpenCodeSessionUriFromTarget(target);
  if (uri) {
    return uri;
  }

  const selected = await deps.showOpenDialog({
    canSelectFiles: true,
    canSelectFolders: false,
    canSelectMany: false,
    openLabel: l10n.t('Open OpenCode Session'),
    filters: {
      [l10n.t('OpenCode Session Export')]: ['json'],
    },
  });

  return selected?.[0];
}
