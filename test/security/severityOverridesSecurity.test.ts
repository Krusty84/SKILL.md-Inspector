import { describe, it, expect } from 'vitest';
import { runAllValidations } from '../../src/validation';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { genericProfile } from '../../src/profiles';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';
import type { SkillProfile } from '../../src/types/SkillProfile';

const dangerousDoc = () =>
  parseSkillFile(
    '/ws/skills/x/SKILL.md',
    '---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n\n```bash\nrm -rf /\n```\n',
  );

function withOverrides(severityOverrides: SkillProfile['severityOverrides']): SkillProfile {
  return { ...genericProfile, severityOverrides };
}

describe('security diagnostics respect severity overrides', () => {
  it('defaults a dangerous command to error', () => {
    const diagnostics = runAllValidations(dangerousDoc(), genericProfile, { skipFilesystem: true });
    expect(diagnostics.find((d) => d.code === DiagnosticCode.SecurityCommandDangerous)?.severity).toBe(
      'error',
    );
  });

  it('can downgrade a security finding (kind is not protected like specification)', () => {
    const diagnostics = runAllValidations(
      dangerousDoc(),
      withOverrides({ [DiagnosticCode.SecurityCommandDangerous]: 'warning' }),
      { skipFilesystem: true },
    );
    expect(diagnostics.find((d) => d.code === DiagnosticCode.SecurityCommandDangerous)?.severity).toBe(
      'warning',
    );
  });

  it('can disable a security finding with "off"', () => {
    const diagnostics = runAllValidations(
      dangerousDoc(),
      withOverrides({ [DiagnosticCode.SecurityCommandDangerous]: 'off' }),
      { skipFilesystem: true },
    );
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.SecurityCommandDangerous);
  });
});
