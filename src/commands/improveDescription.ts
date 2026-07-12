import * as vscode from 'vscode';
import { readConfig } from '../config';
import { isSkillFile } from '../diagnostics/mapping';
import { parseSkillFile, frontmatterStartLine } from '../parser/parseSkillFile';
import { locateFrontmatterKey } from '../parser/parseFrontmatter';
import { buildImprovedDescription } from '../quality/improveDescription';

/**
 * Command: build a deterministic (no-LLM) improved `description` and offer to
 * apply it to the active SKILL.md (brief §10.5). Existing wording is preserved;
 * only the missing trigger/boundary clauses are added, unless the current
 * description scores "poor", in which case the full template is suggested.
 */
export async function improveDescriptionLocally(): Promise<void> {
  const editor = vscode.window.activeTextEditor;
  if (!editor || !isSkillFile(editor.document)) {
    vscode.window.showWarningMessage(
      'SKILL.md Inspector: open a SKILL.md file to improve its description.',
    );
    return;
  }

  const config = readConfig(editor.document.uri);
  const doc = parseSkillFile(editor.document.uri.fsPath, editor.document.getText());
  const current =
    typeof doc.frontmatter?.description === 'string' ? doc.frontmatter.description : '';
  const improved = buildImprovedDescription(current, {
    minLength: config.profile.description.minLength,
    maxLength: config.profile.description.maxLength,
    weights: config.profile.description.weights,
  });

  const choice = await vscode.window.showInformationMessage(
    'SKILL.md Inspector — suggested description',
    { modal: true, detail: improved },
    'Replace in file',
    'Copy',
  );

  if (choice === 'Copy') {
    await vscode.env.clipboard.writeText(improved);
    return;
  }
  if (choice !== 'Replace in file') {
    return;
  }

  const keyRange = doc.frontmatter
    ? locateFrontmatterKey(doc.frontmatterRaw, frontmatterStartLine(doc), 'description')
    : undefined;

  await editor.edit((builder) => {
    if (keyRange) {
      builder.replace(editor.document.lineAt(keyRange.startLine).range, `description: ${improved}`);
    } else if (doc.frontmatter) {
      builder.insert(
        new vscode.Position(frontmatterStartLine(doc), 0),
        `description: ${improved}\n`,
      );
    } else {
      builder.insert(new vscode.Position(0, 0), `---\ndescription: ${improved}\n---\n\n`);
    }
  });
}
