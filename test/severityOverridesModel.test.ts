import { describe, it, expect } from 'vitest';
import {
  severityChoices,
  applyOverride,
  groupCodesByKind,
  isProtectedDowngrade,
  removeOverride,
} from '../src/commands/severityOverridesModel';
import { DiagnosticCode, KIND_BY_CODE } from '../src/types/DiagnosticCode';

describe('severity overrides model (picker helpers)', () => {
  describe('groupCodesByKind', () => {
    it('excludes internal-kind codes (the rule-error signal is not overridable)', () => {
      const codes = groupCodesByKind().flatMap((group) => group.entries.map((entry) => entry.code));
      expect(codes).not.toContain(DiagnosticCode.RuleInternalError);
    });

    it('lists every non-internal code exactly once under its own kind', () => {
      const groups = groupCodesByKind();
      const grouped = groups.flatMap((group) => group.entries.map((entry) => entry.code));
      const nonInternal = Object.values(DiagnosticCode).filter(
        (code) => KIND_BY_CODE[code] !== 'internal',
      );
      expect(new Set(grouped)).toEqual(new Set(nonInternal));
      expect(grouped.length).toBe(nonInternal.length); // no duplicates
      for (const group of groups) {
        for (const entry of group.entries) {
          expect(entry.kind).toBe(group.kind);
          expect(KIND_BY_CODE[entry.code]).toBe(group.kind);
        }
      }
    });

    it('lists specification codes first so protected errors are visible up top', () => {
      expect(groupCodesByKind()[0]?.kind).toBe('specification');
    });
  });

  describe('isProtectedDowngrade (mirrors src/validation/index.ts)', () => {
    it('flags disabling or downgrading a specification code when not allowed', () => {
      expect(isProtectedDowngrade(DiagnosticCode.NameMissing, 'off', false)).toBe(true);
      expect(isProtectedDowngrade(DiagnosticCode.NameMissing, 'warning', false)).toBe(true);
    });

    it('does not flag keeping a specification code at error', () => {
      expect(isProtectedDowngrade(DiagnosticCode.NameMissing, 'error', false)).toBe(false);
    });

    it('does not flag when specification overrides are explicitly allowed', () => {
      expect(isProtectedDowngrade(DiagnosticCode.NameMissing, 'off', true)).toBe(false);
    });

    it('never flags a quality code', () => {
      expect(isProtectedDowngrade(DiagnosticCode.DescriptionVague, 'off', false)).toBe(false);
    });
  });

  describe('applyOverride / removeOverride', () => {
    it('applyOverride adds a key without mutating the input', () => {
      const current = { [DiagnosticCode.DescriptionVague]: 'information' as const };
      const next = applyOverride(current, DiagnosticCode.BodyLineLimit, 'off');
      expect(next).toEqual({
        [DiagnosticCode.DescriptionVague]: 'information',
        [DiagnosticCode.BodyLineLimit]: 'off',
      });
      expect(current).toEqual({ [DiagnosticCode.DescriptionVague]: 'information' });
    });

    it('removeOverride deletes a key without mutating the input', () => {
      const current = {
        [DiagnosticCode.DescriptionVague]: 'information' as const,
        [DiagnosticCode.BodyLineLimit]: 'off' as const,
      };
      const next = removeOverride(current, DiagnosticCode.DescriptionVague);
      expect(next).toEqual({ [DiagnosticCode.BodyLineLimit]: 'off' });
      expect(Object.keys(current)).toHaveLength(2);
    });
  });

  it('severityChoices matches the manifest enum order exactly', () => {
    expect(severityChoices().map((choice) => choice.value)).toEqual([
      'error',
      'warning',
      'information',
      'off',
    ]);
  });
});
