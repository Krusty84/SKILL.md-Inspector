import * as path from 'node:path';
import * as vscode from 'vscode';
import { isSkillFile } from '../diagnostics/mapping';

export interface SkillTarget {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  editor?: vscode.TextEditor;
}

export function isSkillUri(uri: vscode.Uri): boolean {
  return uri.scheme === 'file' && path.basename(uri.fsPath) === 'SKILL.md';
}

export async function resolveSkillTarget(
  uri: vscode.Uri | undefined,
  options: { requireEditor?: boolean; warningAction?: string } = {},
): Promise<SkillTarget | undefined> {
  if (uri) {
    if (!isSkillUri(uri)) {
      vscode.window.showWarningMessage('SKILL.md Inspector: select a SKILL.md file.');
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(uri);
    const editor = options.requireEditor ? await vscode.window.showTextDocument(document) : undefined;
    return { uri, document, editor };
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      `SKILL.md Inspector: open a SKILL.md file${options.warningAction ? ` to ${options.warningAction}` : ''}.`,
    );
    return undefined;
  }
  if (!isSkillFile(editor.document)) {
    vscode.window.showWarningMessage('SKILL.md Inspector: the active file is not a SKILL.md file.');
    return undefined;
  }
  return { uri: editor.document.uri, document: editor.document, editor };
}
