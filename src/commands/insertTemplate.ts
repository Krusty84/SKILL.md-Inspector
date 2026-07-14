import * as vscode from 'vscode';
import { resolveTemplates } from '../templates/resolveTemplates';
import { inferSkillNameFromPath, renderTemplate, titleFromSkillName } from '../templates/renderTemplate';
import type { SkillTemplateDefinition } from '../templates/types';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: insert a starter SKILL.md template into the active or selected editor. */
export async function insertTemplate(uri?: vscode.Uri): Promise<void> {
  const target = await resolveSkillTarget(uri, {
    requireEditor: true,
    warningAction: 'insert the SKILL.md template',
  });
  if (!target || !target.editor) {
    return;
  }

  const templates = loadTemplates(target.uri);
  const selected = await selectTemplate(templates);
  if (!selected) {
    return;
  }

  const name = inferSkillNameFromPath(target.uri.fsPath);
  const template = renderTemplate(selected, { name, title: titleFromSkillName(name) });
  const isEmpty = target.document.getText().trim() === '';

  await target.editor.edit((builder) => {
    if (isEmpty) {
      builder.insert(new vscode.Position(0, 0), template);
    } else {
      builder.insert(target.editor!.selection.active, template);
    }
  });
}

function loadTemplates(uri: vscode.Uri): SkillTemplateDefinition[] {
  const configuredTemplates = vscode.workspace
    .getConfiguration('skillMdInspector', uri)
    .get<unknown>('templates');
  const resolved = resolveTemplates(configuredTemplates);
  if (resolved.issues.length > 0) {
    const action = resolved.source === 'fallback' ? ' Falling back to bundled templates.' : '';
    vscode.window.showWarningMessage(
      `SKILL.md Inspector: ignored ${resolved.issues.length} invalid template setting entr${resolved.issues.length === 1 ? 'y' : 'ies'}.${action}`,
    );
  }
  return resolved.templates;
}

async function selectTemplate(
  templates: SkillTemplateDefinition[],
): Promise<SkillTemplateDefinition | undefined> {
  if (templates.length === 1) {
    return templates[0];
  }
  const selected = await vscode.window.showQuickPick(
    templates.map((template) => ({
      label: template.label,
      description: template.description,
      template,
    })),
    { title: 'Insert SKILL.md Template', placeHolder: 'Select a SKILL.md template' },
  );
  return selected?.template;
}
