import * as vscode from 'vscode';

export async function selectSkillsFolder(output: vscode.OutputChannel): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: false,
    openLabel: 'Select SKILLs Folder',
    title: 'Select SKILLs Folder',
  });
  if (!selected) return;
  await addWorkspaceFolders(selected, output, 'This folder is already open in the workspace.');
}

export async function addFolders(output: vscode.OutputChannel): Promise<void> {
  const selected = await vscode.window.showOpenDialog({
    canSelectFiles: false,
    canSelectFolders: true,
    canSelectMany: true,
    openLabel: 'Add',
    title: 'Add Folders to Workspace',
  });
  if (!selected) return;
  await addWorkspaceFolders(
    selected,
    output,
    'All selected folders are already open in the workspace.',
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
    if (!ok) throw new Error('VS Code rejected the workspace folder update.');
  } catch (error) {
    output.appendLine(`Unable to add folders to workspace: ${String(error)}`);
    void vscode.window.showErrorMessage(
      `Unable to add folders to workspace: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function key(uri: vscode.Uri): string {
  return uri.toString();
}
