import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { validateDescription } from '../src/validation/validateDescription';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
  type HeuristicDictionaries,
} from '../src/quality/dictionaries';

function codes(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  const content = `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`;
  return validateDescription(
    parseSkillFile('/ws/skills/demo/SKILL.md', content),
    genericProfile,
    dictionaries,
  ).map((d) => d.code);
}

describe('validateDescription', () => {
  it('accepts a complete, action-oriented, trigger-friendly description', () => {
    expect(
      codes(
        'Format technical PDF reports using company layout rules. Use when asked to clean up, standardize, or prepare inspection reports. Do not use for legal contracts.',
      ),
    ).toHaveLength(0);
  });

  it('flags the vague example from the brief', () => {
    const description = 'Helps with documents.';
    const result = codes(description);
    expect(result).toContain(DiagnosticCode.DescriptionTooShort);
    expect(result).toContain(DiagnosticCode.DescriptionVague);
    expect(result).toContain(DiagnosticCode.DescriptionNoVerb);
    expect(result).toContain(DiagnosticCode.DescriptionNoTrigger);

    const content = `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`;
    const noVerb = validateDescription(
      parseSkillFile('/ws/skills/demo/SKILL.md', content),
      genericProfile,
    ).find((diagnostic) => diagnostic.code === DiagnosticCode.DescriptionNoVerb);
    expect(noVerb?.severity).toBe('error');
  });

  it('reports a description over the maximum length as an error', () => {
    const long = `Format reports. Use when needed. ${'x'.repeat(1100)}`;
    expect(codes(long)).toContain(DiagnosticCode.DescriptionTooLong);
  });

  it('reports a missing description', () => {
    const content = '---\nname: demo\n---\n';
    const result = validateDescription(parseSkillFile('/ws/skills/demo/SKILL.md', content), genericProfile);
    expect(result.map((d) => d.code)).toContain(DiagnosticCode.DescriptionMissing);
  });

  it.each([[''], ['   '], ['\n\t']])(
    'treats a whitespace-only description as missing: %j',
    (description) => {
      expect(codes(description)).toContain(DiagnosticCode.DescriptionMissing);
    },
  );

  it('does not report a missing description for non-empty text', () => {
    expect(codes('Format inspection reports.')).not.toContain(DiagnosticCode.DescriptionMissing);
  });

  it('flags a missing trigger clause while accepting the verb', () => {
    const result = codes('Format technical PDF reports using the standard company layout rules.');
    expect(result).toContain(DiagnosticCode.DescriptionNoTrigger);
    expect(result).not.toContain(DiagnosticCode.DescriptionNoVerb);
  });

  it('uses configured action-verb values for blocking noVerb diagnostics', () => {
    const added = resolveHeuristicDictionaries({
      actionVerbs: [...DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs, 'frobnicate'],
    });
    expect(
      codes(
        'Frobnicate calibrated widgets. Use when widget calibration drifts.',
        added,
      ),
    ).not.toContain(DiagnosticCode.DescriptionNoVerb);

    const removed = resolveHeuristicDictionaries({
      actionVerbs: DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs.filter(
        (verb) => verb !== 'format',
      ),
    });
    expect(
      codes('Format inspection reports. Use when standardizing reports.', removed),
    ).toContain(DiagnosticCode.DescriptionNoVerb);
  });

  it('applies added and removed vague terms to diagnostics', () => {
    const added = resolveHeuristicDictionaries({
      vagueTerms: [...DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms, 'calibrated'],
    });
    expect(codes('Format calibrated reports. Use when audits drift.', added)).toContain(
      DiagnosticCode.DescriptionVague,
    );
    const removed = resolveHeuristicDictionaries({
      vagueTerms: DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms.filter(
        (term) => term !== 'powerful',
      ),
    });
    expect(codes('Format powerful reports. Use when audits drift.', removed)).not.toContain(
      DiagnosticCode.DescriptionVague,
    );
  });
});
