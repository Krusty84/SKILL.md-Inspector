import * as vscode from 'vscode';
import { readConfig } from '../config';
import { parseSkillFile, frontmatterStartLine } from '../parser/parseSkillFile';
import { buildImprovedDescription } from '../quality/improveDescription';
import { resolveSkillTarget } from './resolveSkillTarget';

/**
 * Command: build a deterministic (no-LLM) improved `description` and offer to
 * apply it to the active SKILL.md (brief §10.5). Existing wording is preserved;
 * only the missing trigger/boundary clauses are added, unless the current
 * description scores "poor", in which case the full template is suggested.
 */
export async function improveDescriptionLocally(
  uri?: Parameters<typeof resolveSkillTarget>[0],
): Promise<void> {
  const target = await resolveSkillTarget(uri, {
    requireEditor: true,
    warningAction: 'improve its description',
  });
  if (!target || !target.editor) {
    return;
  }
  const editor = target.editor;

  const config = readConfig(target.document.uri);
  const doc = parseSkillFile(target.document.uri.fsPath, target.document.getText());
  const current =
    typeof doc.frontmatter?.description === 'string' ? doc.frontmatter.description : '';
  const improved = buildImprovedDescription(current, {
    minLength: config.profile.description.minLength,
    maxLength: config.profile.description.maxLength,
    weights: config.profile.description.weights,
    dictionaries: config.heuristicDictionaries,
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

  const keyRange = doc.frontmatter ? doc.frontmatterKeyRanges?.['description'] : undefined;

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
