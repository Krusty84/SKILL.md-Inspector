import { describe, expect, it } from 'vitest';
import { builtInTemplates } from '../src/templates/builtInTemplates';
import { normalizeTemplates } from '../src/templates/normalizeTemplates';
import {
  inferSkillNameFromPath,
  renderTemplate,
  titleFromSkillName,
} from '../src/templates/renderTemplate';
import { resolveTemplates } from '../src/templates/resolveTemplates';
import type { SkillTemplateDefinition } from '../src/templates/types';

const valid = (id: string): SkillTemplateDefinition => ({
  id,
  label: `Label ${id}`,
  frontmatter: [`name: ${id}`],
  body: ['# Body'],
});

describe('template catalog resolution', () => {
  it('returns bundled templates when the setting is absent or empty', () => {
    expect(resolveTemplates(undefined).templates).toBe(builtInTemplates);
    expect(resolveTemplates([]).templates).toBe(builtInTemplates);
  });

  it('returns multiple valid custom templates in order and replaces bundled templates', () => {
    const result = resolveTemplates([valid('first'), valid('second')]);
    expect(result.source).toBe('custom');
    expect(result.templates.map((template) => template.id)).toEqual(['first', 'second']);
    expect(result.templates).not.toBe(builtInTemplates);
  });

  it('falls back to bundled templates when all custom templates are invalid', () => {
    const result = resolveTemplates([{ id: '', label: '', frontmatter: [], body: [] }]);
    expect(result.source).toBe('fallback');
    expect(result.templates).toBe(builtInTemplates);
  });
});

describe('template validation', () => {
  it('rejects malformed templates and non-object entries', () => {
    const result = normalizeTemplates([
      null,
      { id: '', label: 'Label', frontmatter: ['name: x'], body: [] },
      { id: 'id', label: '', frontmatter: ['name: x'], body: [] },
      { id: 'id', label: 'Label', body: [] },
      { id: 'id', label: 'Label', frontmatter: [], body: [] },
      { id: 'id', label: 'Label', frontmatter: [1], body: [] },
      { id: 'id', label: 'Label', frontmatter: ['name: x'] },
      { id: 'id', label: 'Label', frontmatter: ['name: x'], body: [1] },
    ]);
    expect(result.templates).toEqual([]);
    expect(result.issues).toHaveLength(8);
  });

  it('keeps the first valid duplicate ID and trims IDs and labels only', () => {
    const result = normalizeTemplates([
      { id: ' duplicate ', label: ' First ', frontmatter: ['  name: x  '], body: ['  body  '] },
      { id: 'duplicate', label: 'Second', frontmatter: ['name: y'], body: [] },
    ]);
    expect(result.templates).toEqual([
      {
        id: 'duplicate',
        label: 'First',
        description: undefined,
        frontmatter: ['  name: x  '],
        body: ['  body  '],
      },
    ]);
    expect(result.issues).toHaveLength(1);
  });
});

describe('template rendering', () => {
  const template: SkillTemplateDefinition = {
    id: 'test',
    label: 'Test',
    frontmatter: [
      'name: {{name}}',
      'description: {{name}} and {{title}}',
      'metadata:',
      '  key: value',
    ],
    body: ['# {{title}}', '', '{{name}} {{name}} {{unknown}}', 'plain text'],
  };

  it('renders delimiters, blank separator, final newline, order, indentation, and blank lines', () => {
    expect(renderTemplate(template, { name: 'pdf-helper', title: 'Pdf Helper' })).toBe(
      '---\nname: pdf-helper\ndescription: pdf-helper and Pdf Helper\nmetadata:\n  key: value\n---\n\n# Pdf Helper\n\npdf-helper pdf-helper {{unknown}}\nplain text\n',
    );
  });

  it('renders an empty body and templates without placeholders', () => {
    expect(
      renderTemplate(
        { id: 'x', label: 'X', frontmatter: ['name: x'], body: [] },
        { name: 'n', title: 'T' },
      ),
    ).toBe('---\nname: x\n---\n\n');
  });
});

describe('name inference', () => {
  it('infers names from parent directories and converts titles', () => {
    expect(inferSkillNameFromPath('/tmp/My PDF Skill/SKILL.md')).toBe('my-pdf-skill');
    expect(inferSkillNameFromPath('/SKILL.md')).toBe('skill-name');
    expect(titleFromSkillName('my-pdf-skill')).toBe('My Pdf Skill');
  });
});
