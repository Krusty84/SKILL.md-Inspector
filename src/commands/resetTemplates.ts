import * as vscode from 'vscode';

interface ResetScopeItem extends vscode.QuickPickItem {
  target: vscode.ConfigurationTarget;
  uri?: vscode.Uri;
}

export async function resetTemplates(uri?: vscode.Uri): Promise<void> {
  const scopes = collectScopes(uri);

  if (scopes.length === 0) {
    vscode.window.showInformationMessage('SKILL.md Inspector: no custom templates are configured.');
    return;
  }

  const selected =
    scopes.length === 1
      ? scopes[0]
      : await vscode.window.showQuickPick(scopes, { title: 'Reset SKILL.md Templates' });
  if (!selected) {
    return;
  }

  const confirmation = await vscode.window.showWarningMessage(
    `Remove the ${selected.label} template override and return to bundled templates?`,
    { modal: true },
    'Reset Templates',
  );
  if (confirmation !== 'Reset Templates') {
    return;
  }

  await vscode.workspace
    .getConfiguration('skillMdInspector', selected.uri)
    .update('templates', undefined, selected.target);
  vscode.window.showInformationMessage(
    'SKILL.md Inspector: template override removed. Bundled templates are active.',
  );
}

function collectScopes(uri?: vscode.Uri): ResetScopeItem[] {
  const inspected = vscode.workspace.getConfiguration('skillMdInspector', uri).inspect('templates');
  const scopes: ResetScopeItem[] = [];

  if (inspected?.globalValue !== undefined) {
    scopes.push({ label: 'User', target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue !== undefined) {
    scopes.push({ label: 'Workspace', target: vscode.ConfigurationTarget.Workspace });
  }

  if (uri) {
    if (inspected?.workspaceFolderValue !== undefined) {
      scopes.push({
        label: workspaceFolderLabel(uri),
        target: vscode.ConfigurationTarget.WorkspaceFolder,
        uri,
      });
    }
    return scopes;
  }

  for (const folder of vscode.workspace.workspaceFolders ?? []) {
    const folderInspection = vscode.workspace
      .getConfiguration('skillMdInspector', folder.uri)
      .inspect('templates');
    if (folderInspection?.workspaceFolderValue !== undefined) {
      scopes.push({
        label: `Workspace Folder: ${folder.name}`,
        target: vscode.ConfigurationTarget.WorkspaceFolder,
        uri: folder.uri,
      });
    }
  }

  return scopes;
}

function workspaceFolderLabel(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? `Workspace Folder: ${folder.name}` : 'Workspace Folder';
}
