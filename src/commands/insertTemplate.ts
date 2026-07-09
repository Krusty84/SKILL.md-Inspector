import * as path from 'node:path';
import * as vscode from 'vscode';
import { fullTemplate } from '../codeActions/templates';
import { isSkillFile } from '../diagnostics/mapping';
import { toKebabCase } from '../validation/validateName';

/** Command: insert a starter SKILL.md template into the active editor. */
export async function insertTemplate(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      'SKILL.md Inspector: open a file to insert the SKILL.md template.',
    );
    return;
  }

  const name = suggestName(editor.document);
  const template = fullTemplate(name, toTitle(name));
  const isEmpty = editor.document.getText().trim() === '';

  await editor.edit((builder) => {
    if (isEmpty) {
      builder.insert(new vscode.Position(0, 0), template);
    } else {
      builder.insert(editor.selection.active, template);
    }
  });
}

function suggestName(document: vscode.TextDocument): string {
  if (isSkillFile(document)) {
    const folder = path.basename(path.dirname(document.uri.fsPath));
    return toKebabCase(folder) || 'skill-name';
  }
  return 'skill-name';
}

function toTitle(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
