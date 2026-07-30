import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

export async function selectSkillsFolder(output: vscode.OutputChannel): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: l10n.t('Select SKILLs Folder'),
    title: l10n.t('Select SKILLs Folder'),
  });
  if (!selected) return;
  await addWorkspaceFolders(
    selected,
    output,
    l10n.t('This folder is already open in the workspace.'),
  );
}

export async function addFolders(output: vscode.OutputChannel): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: l10n.t('Add'),
    title: l10n.t('Add Folders to Workspace'),
  });
  if (!selected) return;
  await addWorkspaceFolders(
    selected,
    output,
    l10n.t('All selected folders are already open in the workspace.'),
  );
}

async function addWorkspaceFolders(
  selected: readonly vscode.Uri[],
  output: vscode.OutputChannel,
  duplicateMessage: string,
): Promise<void> {
  const open = new Set((vscode.workspace.workspaceFolders ?? []).map((folder) => key(folder.uri)));
  const seen = new Set<string>();
  const folders = selected.filter((uri) => {
    const uriKey = key(uri);
    if (open.has(uriKey) || seen.has(uriKey)) return false;
    seen.add(uriKey);
    return true;
  });
  if (folders.length === 0) {
    void vscode.window.showInformationMessage(duplicateMessage);
    return;
  }
  try {
    const ok = vscode.workspace.updateWorkspaceFolders(
      vscode.workspace.workspaceFolders?.length ?? 0,
      0,
      ...folders.map((uri) => ({ uri })),
    );
    if (!ok) throw new Error(l10n.t('VS Code rejected the workspace folder update.'));
  } catch (error) {
    output.appendLine(`Unable to add folders to workspace: ${String(error)}`);
    void vscode.window.showErrorMessage(
      l10n.t(
        'Unable to add folders to workspace: {0}',
        error instanceof Error ? error.message : String(error),
      ),
    );
  }
}

function key(uri: vscode.Uri): string {
  return uri.toString();
}
