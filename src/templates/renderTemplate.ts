import * as path from 'node:path';
import { toKebabCase } from '../validation/validateName';
import type { SkillTemplateDefinition, TemplateRenderContext } from './types';

export function renderTemplate(
  template: SkillTemplateDefinition,
  context: TemplateRenderContext,
): string {
  const renderedFrontmatter = template.frontmatter.map((line) => renderPlaceholders(line, context));
  const renderedBody = template.body.map((line) => renderPlaceholders(line, context));
  return ['---', ...renderedFrontmatter, '---', '', ...renderedBody].join('\n') + '\n';
}

export function renderPlaceholders(line: string, context: TemplateRenderContext): string {
  return line.replaceAll('{{name}}', context.name).replaceAll('{{title}}', context.title);
}

export function inferSkillNameFromPath(filePath: string): string {
  const parent = path.basename(path.dirname(filePath));
  return toKebabCase(parent) || 'skill-name';
}

export function titleFromSkillName(name: string): string {
  return name
    .split('-')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
