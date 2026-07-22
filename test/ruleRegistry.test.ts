import { describe, it, expect } from 'vitest';
import { runRules, VALIDATION_RULES } from '../src/validation/ruleRegistry';
import type { ValidationRule } from '../src/validation/ruleRegistry';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { genericProfile } from '../src/profiles';
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
});

describe('rule registry isolates a throwing rule (P2)', () => {
  const throwingRule: ValidationRule = {
    id: 'explode',
    run: () => {
      throw new Error('rule exploded');
    },
  };

  it('contains the failure, keeps other rules, and surfaces an internal diagnostic', () => {
    const nameRule = VALIDATION_RULES.find((r) => r.id === 'name')!;
    let diagnostics: ReturnType<typeof runRules> = [];
    expect(() => {
      diagnostics = runRules(
        { doc: doc(), profile: genericProfile, skipFilesystem: true },
        [throwingRule, nameRule],
      );
    }).not.toThrow();

    // The surviving rule still produced its diagnostic.
    expect(diagnostics.some((x) => x.code === DiagnosticCode.NameFormat)).toBe(true);

    // The failure is surfaced (never swallowed) as a non-fatal internal note.
    const internal = diagnostics.find((x) => x.code === DiagnosticCode.RuleInternalError);
    expect(internal).toBeDefined();
    expect(internal?.severity).toBe('information');
    expect(internal?.kind).toBe('internal');
    expect(internal?.message).toContain('explode'); // the failing rule id
    expect(internal?.message).toContain('rule exploded'); // the error detail
  });

  it('reports one internal diagnostic per failing rule and still runs later rules', () => {
    const nonErrorThrow: ValidationRule = {
      id: 'boom2',
      // A non-Error throw must be handled too.
      run: () => {
        throw 'string failure';
      },
    };
    const nameRule = VALIDATION_RULES.find((r) => r.id === 'name')!;

    const diagnostics = runRules({ doc: doc(), profile: genericProfile, skipFilesystem: true }, [
      throwingRule,
      nonErrorThrow,
      nameRule,
    ]);

    const internals = diagnostics.filter((x) => x.code === DiagnosticCode.RuleInternalError);
    expect(internals).toHaveLength(2);
    expect(internals.some((x) => x.message.includes('string failure'))).toBe(true);
    expect(diagnostics.some((x) => x.code === DiagnosticCode.NameFormat)).toBe(true);
  });
});
