/** Reusable text fragments for quick fixes and the Insert Template command. */

export const DESCRIPTION_PLACEHOLDER =
  '<Action verb> <artifact/domain>. Use when <trigger context>. Do not use when <boundary>.';

export const USE_WHEN_CLAUSE = ' Use when <describe when to use this skill>.';

export const DO_NOT_USE_CLAUSE = ' Do not use when <describe when NOT to use this skill>.';

export function frontmatterBlock(name: string): string {
  return ['---', `name: ${name}`, `description: ${DESCRIPTION_PLACEHOLDER}`, '---', '', ''].join(
    '\n',
  );
}

export function bodyTemplate(title: string): string {
  return [
    `# ${title}`,
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
  ].join('\n');
}

/** A complete starter SKILL.md (frontmatter + body). */
export function fullTemplate(name: string, title: string): string {
  return frontmatterBlock(name) + bodyTemplate(title);
}
