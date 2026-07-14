import { describe, it, expect } from 'vitest';
import { runRules, VALIDATION_RULES } from '../src/validation/ruleRegistry';
import type { ValidationRule } from '../src/validation/ruleRegistry';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { genericProfile, claudeProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

const doc = () =>
  parseSkillFile(
    '/ws/skills/x/SKILL.md',
    '---\nname: Bad Name\ndescription: Format inspection reports.\n---\n\n# Body',
  );

describe('rule registry (Task 84)', () => {
  it('invokes the built-in rules through the registry', () => {
    const diagnostics = runRules({ doc: doc(), profile: genericProfile, skipFilesystem: true });
    expect(diagnostics.some((x) => x.code === DiagnosticCode.NameFormat)).toBe(true);
    expect(VALIDATION_RULES.map((r) => r.id)).toContain('name');
  });

  it('skips a rule that does not apply to the active profile', () => {
    const nameRule = VALIDATION_RULES.find((r) => r.id === 'name')!;
    const onlyClaude: ValidationRule[] = [{ ...nameRule, appliesToProfiles: ['claude'] }];

    const forGeneric = runRules(
      { doc: doc(), profile: genericProfile, skipFilesystem: true },
      onlyClaude,
    );
    const forClaude = runRules(
      { doc: doc(), profile: claudeProfile, skipFilesystem: true },
      onlyClaude,
    );

    expect(forGeneric).toEqual([]); // the name rule is excluded for generic
    expect(forClaude.some((x) => x.code === DiagnosticCode.NameFormat)).toBe(true);
  });
});
