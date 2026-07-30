import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';

interface ResetScopeItem extends vscode.QuickPickItem {
  target: vscode.ConfigurationTarget;
  uri?: vscode.Uri;
}

export async function resetTemplates(uri?: vscode.Uri): Promise<void> {
  const scopes = collectScopes(uri);

  if (scopes.length === 0) {
    vscode.window.showInformationMessage(
      l10n.t('SKILL.md Inspector: no custom templates are configured.'),
    );
    return;
  }

  const selected =
    scopes.length === 1
      ? scopes[0]
      : await vscode.window.showQuickPick(scopes, { title: l10n.t('Reset SKILL.md Templates') });
  if (!selected) {
    return;
  }

  const resetLabel = l10n.t('Reset Templates');
  const confirmation = await vscode.window.showWarningMessage(
    l10n.t('Remove the {0} template override and return to bundled templates?', selected.label),
    { modal: true },
    resetLabel,
  );
  if (confirmation !== resetLabel) {
    return;
  }

  await vscode.workspace
    .getConfiguration('skillMdInspector', selected.uri)
    .update('templates', undefined, selected.target);
  vscode.window.showInformationMessage(
    l10n.t('SKILL.md Inspector: template override removed. Bundled templates are active.'),
  );
}

function collectScopes(uri?: vscode.Uri): ResetScopeItem[] {
  const inspected = vscode.workspace.getConfiguration('skillMdInspector', uri).inspect('templates');
  const scopes: ResetScopeItem[] = [];

  if (inspected?.globalValue !== undefined) {
    scopes.push({ label: l10n.t('User'), target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue !== undefined) {
    scopes.push({ label: l10n.t('Workspace'), target: vscode.ConfigurationTarget.Workspace });
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
        label: l10n.t('Workspace Folder: {0}', folder.name),
        target: vscode.ConfigurationTarget.WorkspaceFolder,
        uri: folder.uri,
      });
    }
  }

  return scopes;
}

function workspaceFolderLabel(uri: vscode.Uri): string {
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  return folder ? l10n.t('Workspace Folder: {0}', folder.name) : l10n.t('Workspace Folder');
}
