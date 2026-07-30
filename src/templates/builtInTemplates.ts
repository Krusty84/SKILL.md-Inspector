import * as l10n from '@vscode/l10n';
import { DESCRIPTION_PLACEHOLDER } from '../codeActions/templates';
import type { SkillTemplateDefinition } from './types';

/**
 * Localized quick-pick presentation for the bundled templates. A function, not
 * data on the array, so no l10n.t() runs at module load and the template
 * content itself (the inserted frontmatter/body) stays English. Custom
 * templates from settings keep their user-provided label and description.
 */
export function builtInTemplateDisplay(
  id: string,
): { label: string; description: string } | undefined {
  switch (id) {
    case 'minimal':
      return {
        label: l10n.t('Minimal'),
        description: l10n.t('A compact SKILL.md with required frontmatter and a short body.'),
      };
    case 'standard':
      return {
        label: l10n.t('Standard'),
        description: l10n.t('A balanced starter template for most skills.'),
      };
    case 'detailed':
      return {
        label: l10n.t('Detailed'),
        description: l10n.t('A fuller template with scope, resources, examples, and constraints.'),
      };
    case 'workflow':
      return {
        label: l10n.t('Workflow-oriented'),
        description: l10n.t('A step-by-step template for repeatable procedures.'),
      };
    default:
      return undefined;
  }
}

export const builtInTemplates: SkillTemplateDefinition[] = [
  {
    id: 'minimal',
    label: 'Minimal',
    description: 'A compact SKILL.md with required frontmatter and a short body.',
    frontmatter: [
      'name: {{name}}',
      'description: <Describe when to use this skill and what it produces.>',
    ],
    body: ['# {{title}}', '', '<Describe the skill workflow.>'],
  },
  {
    id: 'standard',
    label: 'Standard',
    description: 'A balanced starter template for most skills.',
    frontmatter: ['name: {{name}}', `description: ${DESCRIPTION_PLACEHOLDER}`],
    body: [
      '# {{title}}',
      '',
      '## When to use',
      '',
      'Use this skill when <describe the trigger>.',
      '',
      '## Workflow',
      '',
      '1. <step>',
      '',
      '## Inputs',
      '',
      '- <input>',
      '',
      '## Outputs',
      '',
      '- <output>',
      '',
      '## Examples',
      '',
      '<example prompt and expected result>',
      '',
      '## Constraints',
      '',
      'Do not <boundary>.',
      '',
    ],
  },
  {
    id: 'detailed',
    label: 'Detailed',
    description: 'A fuller template with scope, resources, examples, and constraints.',
    frontmatter: [
      'name: {{name}}',
      'description: <Describe the task, usage trigger, boundaries, and expected result.>',
    ],
    body: [
      '# {{title}}',
      '',
      '## Overview',
      '',
      '<Summarize what this skill helps with.>',
      '',
      '## When to use',
      '',
      '- <Trigger or scenario>',
      '',
      '## When not to use',
      '',
      '- <Boundary or exclusion>',
      '',
      '## Inputs',
      '',
      '- <Input>',
      '',
      '## Outputs',
      '',
      '- <Output>',
      '',
      '## Resources',
      '',
      '- <Related file or directory>',
      '',
      '## Examples',
      '',
      '<Example request and expected response.>',
      '',
      '## Constraints',
      '',
      '- <Constraint>',
    ],
  },
  {
    id: 'workflow',
    label: 'Workflow-oriented',
    description: 'A step-by-step template for repeatable procedures.',
    frontmatter: [
      'name: {{name}}',
      'description: <Describe the task, usage trigger, and expected result.>',
    ],
    body: [
      '# {{title}}',
      '',
      '## When to use',
      '',
      '<Describe when this skill should be used.>',
      '',
      '## Workflow',
      '',
      '1. <First step>',
      '2. <Second step>',
      '3. <Third step>',
      '',
      '## Inputs',
      '',
      '- <Input>',
      '',
      '## Outputs',
      '',
      '- <Output>',
      '',
      '## Constraints',
      '',
      '- <Constraint>',
    ],
  },
];
