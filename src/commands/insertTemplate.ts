import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { builtInTemplateDisplay } from '../templates/builtInTemplates';
import { resolveTemplates } from '../templates/resolveTemplates';
import {
  inferSkillNameFromPath,
  renderTemplate,
  titleFromSkillName,
} from '../templates/renderTemplate';
import type { SkillTemplateDefinition } from '../templates/types';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: insert a starter SKILL.md template into the active or selected editor. */
export async function insertTemplate(
  uri?: Parameters<typeof resolveSkillTarget>[0],
): Promise<void> {
  const target = await resolveSkillTarget(uri, {
    requireEditor: true,
    missingEditorMessage: l10n.t(
      'SKILL.md Inspector: open a SKILL.md file to insert the SKILL.md template.',
    ),
  });
  if (!target || !target.editor) {
    return;
  }

  const { templates, builtIn } = loadTemplates(target.uri);
  const selected = await selectTemplate(templates, builtIn);
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

function loadTemplates(uri: vscode.Uri): {
  templates: SkillTemplateDefinition[];
  builtIn: boolean;
} {
  const configuredTemplates = vscode.workspace
    .getConfiguration('skillMdInspector', uri)
    .get<unknown>('templates');
  const resolved = resolveTemplates(configuredTemplates);
  if (resolved.issues.length > 0) {
    const count = resolved.issues.length;
    const message =
      count === 1
        ? l10n.t('SKILL.md Inspector: ignored 1 invalid template setting entry.')
        : l10n.t('SKILL.md Inspector: ignored {0} invalid template setting entries.', count);
    const fallback =
      resolved.source === 'fallback' ? ` ${l10n.t('Falling back to bundled templates.')}` : '';
    vscode.window.showWarningMessage(`${message}${fallback}`);
  }
  return { templates: resolved.templates, builtIn: resolved.source !== 'custom' };
}

async function selectTemplate(
  templates: SkillTemplateDefinition[],
  builtIn: boolean,
): Promise<SkillTemplateDefinition | undefined> {
  if (templates.length === 1) {
    return templates[0];
  }
  const selected = await vscode.window.showQuickPick(
    templates.map((template) => {
      // Only the bundled templates have localized labels; a custom template
      // (even one reusing a bundled id) keeps its user-provided wording.
      const display = builtIn ? builtInTemplateDisplay(template.id) : undefined;
      return {
        label: display?.label ?? template.label,
        description: display?.description ?? template.description,
        template,
      };
    }),
    { title: l10n.t('Insert SKILL.md Template'), placeHolder: l10n.t('Select a SKILL.md template') },
  );
  return selected?.template;
}
