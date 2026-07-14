import { describe, it, expect } from 'vitest';
import { runAllValidations } from '../src/validation';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { genericProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillProfile } from '../src/types/SkillProfile';

const vagueDoc = () =>
  parseSkillFile(
    '/ws/skills/x/SKILL.md',
    '---\nname: demo\ndescription: A powerful helper. Use when needed.\n---\n\n# Body\n\ntext',
  );
const noNameDoc = () =>
  parseSkillFile('/ws/skills/x/SKILL.md', '---\ndescription: Format reports.\n---\n\n# Body');

function withOverrides(
  severityOverrides: SkillProfile['severityOverrides'],
  allowSpecificationOverrides = false,
): SkillProfile {
  return { ...genericProfile, severityOverrides, allowSpecificationOverrides };
}

describe('profile severity overrides (Task 85)', () => {
  it('a recommendation can be information in one profile and warning in another', () => {
    const base = runAllValidations(vagueDoc(), genericProfile, { skipFilesystem: true });
    expect(base.find((d) => d.code === DiagnosticCode.DescriptionVague)?.severity).toBe('warning');

    const overridden = runAllValidations(
      vagueDoc(),
      withOverrides({ [DiagnosticCode.DescriptionVague]: 'information' }),
      { skipFilesystem: true },
    );
    expect(overridden.find((d) => d.code === DiagnosticCode.DescriptionVague)?.severity).toBe(
      'information',
    );
  });

  it('"off" disables a non-specification diagnostic', () => {
    const diagnostics = runAllValidations(
      vagueDoc(),
      withOverrides({ [DiagnosticCode.DescriptionVague]: 'off' }),
      { skipFilesystem: true },
    );
    expect(diagnostics.some((d) => d.code === DiagnosticCode.DescriptionVague)).toBe(false);
  });

  it('does not disable or downgrade a specification error by default', () => {
    const diagnostics = runAllValidations(
      noNameDoc(),
      withOverrides({ [DiagnosticCode.NameMissing]: 'off' }),
      { skipFilesystem: true },
    );
    const nameMissing = diagnostics.find((d) => d.code === DiagnosticCode.NameMissing);
    expect(nameMissing).toBeDefined();
    expect(nameMissing?.severity).toBe('error');
  });

  it('disables a specification error only when explicitly allowed', () => {
    const diagnostics = runAllValidations(
      noNameDoc(),
      withOverrides({ [DiagnosticCode.NameMissing]: 'off' }, true),
      { skipFilesystem: true },
    );
    expect(diagnostics.some((d) => d.code === DiagnosticCode.NameMissing)).toBe(false);
  });
});
