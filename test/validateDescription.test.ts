import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { validateDescription } from '../src/validation/validateDescription';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillProfile } from '../src/types/SkillProfile';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
  type HeuristicDictionaries,
} from '../src/quality/dictionaries';

function diagnostics(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
  profile: SkillProfile = genericProfile,
) {
  const content = `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`;
  return validateDescription(
    parseSkillFile('/ws/skills/demo/SKILL.md', content),
    profile,
    dictionaries,
  );
}

function codes(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
  profile: SkillProfile = genericProfile,
): string[] {
  return diagnostics(description, dictionaries, profile).map((diagnostic) => diagnostic.code);
}

function descriptionOfLength(length: number): string {
  const prefix = 'Format reports. Use when auditing. ';
  return prefix + 'x'.repeat(length - prefix.length);
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
    // Advisory since plan 2: the capability detector is heuristic, so a missing
    // verb warns instead of blocking.
    expect(noVerb?.severity).toBe('warning');
  });

  it('reports a description over the maximum length as an error', () => {
    const long = `Format reports. Use when needed. ${'x'.repeat(1100)}`;
    expect(codes(long)).toContain(DiagnosticCode.DescriptionTooLong);
  });

  it('enforces the configured maximum without also reporting a verbose warning', () => {
    const profile: SkillProfile = {
      ...genericProfile,
      description: { ...genericProfile.description, maxLength: 100 },
    };
    const result = diagnostics(descriptionOfLength(166), DEFAULT_HEURISTIC_DICTIONARIES, profile);
    const tooLong = result.find(
      (diagnostic) => diagnostic.code === DiagnosticCode.DescriptionTooLong,
    );

    expect(tooLong?.severity).toBe('error');
    expect(tooLong?.message).toContain('100');
    expect(result.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.DescriptionTooVerbose,
    );
  });

  it('accepts a description exactly at the configured maximum', () => {
    const profile: SkillProfile = {
      ...genericProfile,
      description: { ...genericProfile.description, maxLength: 100 },
    };
    expect(codes(descriptionOfLength(100), DEFAULT_HEURISTIC_DICTIONARIES, profile)).not.toContain(
      DiagnosticCode.DescriptionTooLong,
    );
  });

  it('keeps the default recommended and maximum boundaries unchanged', () => {
    expect(codes(descriptionOfLength(500))).not.toContain(DiagnosticCode.DescriptionTooVerbose);
    expect(codes(descriptionOfLength(501))).toContain(DiagnosticCode.DescriptionTooVerbose);
    expect(codes(descriptionOfLength(1024))).not.toContain(DiagnosticCode.DescriptionTooLong);
    expect(codes(descriptionOfLength(1025))).toContain(DiagnosticCode.DescriptionTooLong);
    expect(codes(descriptionOfLength(1025))).not.toContain(DiagnosticCode.DescriptionTooVerbose);
  });

  it('reports a missing description', () => {
    const content = '---\nname: demo\n---\n';
    const result = validateDescription(
      parseSkillFile('/ws/skills/demo/SKILL.md', content),
      genericProfile,
    );
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
      codes('Frobnicate calibrated widgets. Use when widget calibration drifts.', added),
    ).not.toContain(DiagnosticCode.DescriptionNoVerb);

    const removed = resolveHeuristicDictionaries({
      actionVerbs: DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs.filter((verb) => verb !== 'format'),
    });
    // "auditing" keeps the first two sentences free of other registry verbs, so
    // removing "format" is what decides the diagnostic.
    expect(codes('Format inspection reports. Use when auditing documents.', removed)).toContain(
      DiagnosticCode.DescriptionNoVerb,
    );
  });

  it('applies added and removed vague terms to diagnostics', () => {
    const added = resolveHeuristicDictionaries({
      vagueTerms: [...DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms, 'calibrated'],
    });
    expect(codes('Format calibrated reports. Use when audits drift.', added)).toContain(
      DiagnosticCode.DescriptionVague,
    );
    const removed = resolveHeuristicDictionaries({
      vagueTerms: DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms.filter((term) => term !== 'powerful'),
    });
    expect(codes('Format powerful reports. Use when audits drift.', removed)).not.toContain(
      DiagnosticCode.DescriptionVague,
    );
  });
});
