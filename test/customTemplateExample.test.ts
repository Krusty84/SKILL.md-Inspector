import { describe, expect, it } from 'vitest';
import customTemplateSettings from '../examples/custom-template.settings.json';
import { renderTemplate } from '../src/templates/renderTemplate';
import { resolveTemplates } from '../src/templates/resolveTemplates';

const templateSetting = customTemplateSettings['skillMdInspector.templates'];

const requiredSections = [
  '# Repository Review',
  '## Purpose',
  '## When to use',
  '## When not to use',
  '## Inputs',
  '## Outputs',
  '## Workflow',
  '## Validation',
  '## Examples',
  '## Constraints',
];

describe('custom template settings example', () => {
  it('defines one valid custom template that renders with supported placeholders', () => {
    expect(Array.isArray(templateSetting)).toBe(true);

    const resolved = resolveTemplates(templateSetting);
    expect(resolved.source).toBe('custom');
    expect(resolved.issues).toEqual([]);
    expect(resolved.templates).toHaveLength(1);

    const [template] = resolved.templates;
    expect(template.id).toBe('quality-workflow');
    expect(template.label).toBe('Quality-focused workflow');

    const rendered = renderTemplate(template, {
      name: 'repository-review',
      title: 'Repository Review',
    });

    expect(rendered.startsWith('---')).toBe(true);
    expect(rendered).toContain('name: repository-review');
    requiredSections.forEach((section) => expect(rendered).toContain(section));
    expect(rendered.endsWith('\n')).toBe(true);
    expect(rendered).not.toContain('{{name}}');
    expect(rendered).not.toContain('{{title}}');
  });
});
