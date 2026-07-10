import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { validateDescription } from '../src/validation/validateDescription';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

function codes(description: string): string[] {
  const content = `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`;
  return validateDescription(parseSkillFile('/ws/skills/demo/SKILL.md', content), genericProfile).map(
    (d) => d.code,
  );
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
    const result = codes('Helps with documents.');
    expect(result).toContain(DiagnosticCode.DescriptionTooShort);
    expect(result).toContain(DiagnosticCode.DescriptionVague);
    expect(result).toContain(DiagnosticCode.DescriptionNoVerb);
    expect(result).toContain(DiagnosticCode.DescriptionNoTrigger);
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

  it('flags a missing trigger clause while accepting the verb', () => {
    const result = codes('Format technical PDF reports using the standard company layout rules.');
    expect(result).toContain(DiagnosticCode.DescriptionNoTrigger);
    expect(result).not.toContain(DiagnosticCode.DescriptionNoVerb);
  });
});
