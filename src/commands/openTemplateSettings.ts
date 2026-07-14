import * as vscode from 'vscode';

export async function openTemplateSettings(): Promise<void> {
  await vscode.commands.executeCommand('workbench.action.openSettings', 'skillMdInspector.templates');
}
