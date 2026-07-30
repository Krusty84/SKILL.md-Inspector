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

/**
 * Every catalog entry has a unique id, but it used to be discarded before the
 * diagnostic was built — so silencing one `sudo` warning meant disabling
 * `skill.security.command.risky` entirely, and with it seventeen unrelated
 * patterns. Keeping a rule class enabled while suppressing one pattern is the
 * alternative to switching security off wholesale.
 */
describe('security diagnostics support per-rule severity overrides', () => {
  const riskyDoc = () =>
    parseSkillFile(
      '/ws/skills/x/SKILL.md',
      '---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n\n```bash\nsudo apt-get update\nchmod 777 /srv\n```\n',
    );

  const riskyMessages = (profile: SkillProfile) =>
    runAllValidations(riskyDoc(), profile, { skipFilesystem: true })
      .filter((d) => d.code === DiagnosticCode.SecurityCommandRisky)
      .map((d) => d.message);

  it('reports both risky patterns by default', () => {
    const messages = riskyMessages(genericProfile);
    expect(messages).toHaveLength(2);
  });

  it('silences one pattern by id without touching the rest of its class', () => {
    const messages = riskyMessages(
      withOverrides({ [`${DiagnosticCode.SecurityCommandRisky}#sudo`]: 'off' }),
    );
    expect(messages).toHaveLength(1);
    expect(messages[0]).toContain('chmod');
  });

  it('can downgrade a single pattern by id', () => {
    const diagnostics = runAllValidations(
      riskyDoc(),
      withOverrides({ [`${DiagnosticCode.SecurityCommandRisky}#sudo`]: 'information' }),
      { skipFilesystem: true },
    );
    const byRule = diagnostics.filter((d) => d.code === DiagnosticCode.SecurityCommandRisky);
    expect(byRule.find((d) => d.message.includes('sudo'))?.severity).toBe('information');
    expect(byRule.find((d) => d.message.includes('chmod'))?.severity).toBe('warning');
  });

  it('still honours a whole-code override when no per-rule key matches', () => {
    const messages = riskyMessages(withOverrides({ [DiagnosticCode.SecurityCommandRisky]: 'off' }));
    expect(messages).toHaveLength(0);
  });
});
