import { describe, it, expect } from 'vitest';
import { validateBody } from '../src/validation/validateBody';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillDocument } from '../src/types/SkillDocument';
import type { SkillProfile, BodyStrictness, BodySectionSpec } from '../src/types/SkillProfile';
import {
  BOUNDARY_SECTION,
  EXAMPLES_SECTION,
  WHEN_TO_USE_SECTION,
  IO_SECTION,
} from '../src/validation/bodySections';

function docWith(body: string, description = 'd'): SkillDocument {
  return {
    uri: '/ws/skills/x/SKILL.md',
    directory: '/ws/skills/x',
    fileName: 'SKILL.md',
    frontmatter: { name: 'x', description },
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
  const body = '## Examples\n\nInput: raw. Output: formatted.\n\n## When to use\n\ntext';

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

  it('accepts concrete frontmatter trigger scope for when-to-use', () => {
    const diagnostics = validateBody(
      docWith(
        '## Examples\n\nInput: raw. Output: formatted.',
        'Format CSV reports. Use when cleaning malformed CSV exports.',
      ),
      profileWith('recommended'),
    );
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.BodyNoWhenToUse);
  });

  it('rejects a vague frontmatter trigger marker for when-to-use', () => {
    const diagnostics = validateBody(
      docWith('## Examples\n\nInput: raw. Output: formatted.', 'Format reports. Use when needed.'),
      profileWith('recommended'),
    );
    expect(diagnostics.map((d) => d.code)).toContain(DiagnosticCode.BodyNoWhenToUse);
  });

  it('uses example evidence rather than requiring an Examples heading', () => {
    const body =
      '## Quick start\n\n```bash\nrun-tool input.csv\n```\n\n## When to use\n\nUse for CSV input.';
    expect(validateBody(docWith(body), profileWith('recommended'))).toEqual([]);
  });

  it('accepts concrete frontmatter trigger and boundary scope when boundaries and I/O are recommended', () => {
    const body = [
      '## Quick start',
      '',
      '```bash',
      'run-tool input.csv',
      '```',
      '',
      '## Input and output',
      '',
      'Accept a CSV file and return a cleaned CSV file.',
    ].join('\n');
    const description =
      'Clean malformed CSV exports. Use when repairing inconsistent CSV rows. Do not use for spreadsheet analysis.';
    expect(
      validateBody(
        docWith(body, description),
        profileWith('recommended', [
          EXAMPLES_SECTION,
          WHEN_TO_USE_SECTION,
          BOUNDARY_SECTION,
          IO_SECTION,
        ]),
      ),
    ).toEqual([]);
  });

  it('requires concrete frontmatter boundary scope when the profile recommends boundaries', () => {
    const diagnostics = validateBody(
      docWith(
        '## Examples\n\nInput: raw. Output: formatted.',
        'Format CSV reports. Do not use when needed.',
      ),
      profileWith('recommended', [BOUNDARY_SECTION]),
    );
    expect(diagnostics.map((item) => item.code)).toContain(DiagnosticCode.BodySuggestBoundary);
  });

  it.each(['## Examples', '## Examples\n\nExamples will be added later.'])(
    'requires concrete evidence for %s',
    (body) => {
      const diagnostics = validateBody(
        docWith(body),
        profileWith('recommended', [EXAMPLES_SECTION]),
      );

      expect(diagnostics.map((item) => item.code)).toContain(DiagnosticCode.BodyNoExamples);
    },
  );
});
