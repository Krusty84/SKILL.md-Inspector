import { describe, it, expect } from 'vitest';
import { validateBody } from '../src/validation/validateBody';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillDocument } from '../src/types/SkillDocument';
import type { SkillProfile, BodyStrictness, BodySectionSpec } from '../src/types/SkillProfile';
import { EXAMPLES_SECTION, WHEN_TO_USE_SECTION, IO_SECTION } from '../src/validation/bodySections';

function docWith(body: string): SkillDocument {
  return {
    uri: '/ws/skills/x/SKILL.md',
    directory: '/ws/skills/x',
    fileName: 'SKILL.md',
    frontmatter: { name: 'x', description: 'd' },
    frontmatterRaw: '',
    body,
    bodyStartLine: 4,
    links: [],
    resources: [],
    parseErrors: [],
  };
}

function profileWith(
  strictness: BodyStrictness,
  sections: BodySectionSpec[] = [EXAMPLES_SECTION, WHEN_TO_USE_SECTION],
): SkillProfile {
  return {
    id: 'generic',
    label: 'Generic',
    nameMaxLength: 64,
    description: { minLength: 40, maxLength: 1024 },
    body: { strictness, sections },
  };
}

describe('validateBody strictness (Task 55)', () => {
  const body = 'Some prose with no recognized sections.';

  it('off suppresses advisory diagnostics', () => {
    expect(validateBody(docWith(body), profileWith('off'))).toEqual([]);
  });

  it('recommended uses information-level diagnostics', () => {
    const diagnostics = validateBody(docWith(body), profileWith('recommended'));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.severity === 'information')).toBe(true);
  });

  it('strict uses warning-level diagnostics', () => {
    const diagnostics = validateBody(docWith(body), profileWith('strict'));
    expect(diagnostics.length).toBeGreaterThan(0);
    expect(diagnostics.every((d) => d.severity === 'warning')).toBe(true);
  });

  it('an empty body is a structural warning regardless of strictness', () => {
    const diagnostics = validateBody(docWith('   '), profileWith('off'));
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticCode.BodyMissing);
    expect(diagnostics[0].severity).toBe('warning');
  });
});

describe('validateBody profile sections (Task 56)', () => {
  const body = '## Examples\n\ntext\n\n## When to use\n\ntext';

  it('a minimal profile is satisfied by examples + when-to-use', () => {
    expect(validateBody(docWith(body), profileWith('recommended'))).toEqual([]);
  });

  it('a profile that also recommends I/O flags only the missing section', () => {
    const diagnostics = validateBody(
      docWith(body),
      profileWith('recommended', [EXAMPLES_SECTION, WHEN_TO_USE_SECTION, IO_SECTION]),
    );
    expect(diagnostics.map((d) => d.code)).toEqual([DiagnosticCode.BodySuggestIO]);
  });
});
