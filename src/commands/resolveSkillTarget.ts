import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { isSkillFile } from '../diagnostics/mapping';

export interface SkillTarget {
  uri: vscode.Uri;
  document: vscode.TextDocument;
  editor?: vscode.TextEditor;
}

export function isSkillUri(uri: vscode.Uri): boolean {
  return uri.path.split('/').pop() === 'SKILL.md';
}

type SkillCommandTarget =
  | vscode.Uri
  | { resourceUri?: vscode.Uri; uri?: vscode.Uri | string; file?: { absolutePath?: string } };

export function resolveSkillUri(target?: SkillCommandTarget): vscode.Uri | undefined {
  if (target instanceof vscode.Uri) return target;
  if (target?.resourceUri) return target.resourceUri;
  if (target?.uri instanceof vscode.Uri) return target.uri;
  if (typeof target?.uri === 'string') return vscode.Uri.parse(target.uri);
  if (target?.file?.absolutePath) return vscode.Uri.file(target.file.absolutePath);
  return undefined;
}

export async function resolveSkillTarget(
  uri: SkillCommandTarget | undefined,
  // A full sentence, not a fragment, so each command's warning translates as a
  // whole (word order differs across languages).
  options: { requireEditor?: boolean; missingEditorMessage?: string } = {},
): Promise<SkillTarget | undefined> {
  const resolvedUri = resolveSkillUri(uri);
  if (resolvedUri) {
    if (!isSkillUri(resolvedUri)) {
      vscode.window.showWarningMessage(l10n.t('SKILL.md Inspector: select a SKILL.md file.'));
      return undefined;
    }
    const document = await vscode.workspace.openTextDocument(resolvedUri);
    const editor = options.requireEditor
      ? await vscode.window.showTextDocument(document)
      : undefined;
    return { uri: resolvedUri, document, editor };
  }

  const editor = vscode.window.activeTextEditor;
  if (!editor) {
    vscode.window.showWarningMessage(
      options.missingEditorMessage ?? l10n.t('SKILL.md Inspector: open a SKILL.md file.'),
    );
    return undefined;
  }
  if (!isSkillFile(editor.document)) {
    vscode.window.showWarningMessage(
      l10n.t('SKILL.md Inspector: the active file is not a SKILL.md file.'),
    );
    return undefined;
  }
  return { uri: editor.document.uri, document: editor.document, editor };
}
