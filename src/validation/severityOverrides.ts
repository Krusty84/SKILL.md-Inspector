import { KIND_BY_CODE } from '../types/DiagnosticCode';
import type { SkillDiagnosticKind, SkillDiagnosticSeverity } from '../types/SkillDiagnostic';

/**
 * Validation for `skillMdInspector.severityOverrides`, which is plain user JSON
 * with no runtime schema. Lives here rather than next to the picker UI because
 * the *validator* is the component that must not trust it: a value was cast
 * straight into `diagnostic.severity`, so `"warn"` — a plausible typo for
 * `"warning"` — reached the Problems panel as a red Error and poisoned the
 * severity counters and the sort comparator along the way.
 */

/** A severity override value: a diagnostic severity, or `'off'` to disable the diagnostic. */
export type SeverityOverrideValue = SkillDiagnosticSeverity | 'off';

/** The map persisted in `skillMdInspector.severityOverrides` (code → severity | 'off'). */
export type SeverityOverrideMap = Record<string, SeverityOverrideValue>;

/** Kinds a user can meaningfully override, i.e. everything except `internal`. */
export type PickableKind = Exclude<SkillDiagnosticKind, 'internal'>;

/** Every value the setting accepts. Anything else is a typo, not a configuration. */
export const SEVERITY_OVERRIDE_VALUES: readonly SeverityOverrideValue[] = [
  'error',
  'warning',
  'information',
  'off',
];

/** Narrows an arbitrary user-supplied value to a usable override. */
export function isSeverityOverrideValue(value: unknown): value is SeverityOverrideValue {
  return typeof value === 'string' && (SEVERITY_OVERRIDE_VALUES as readonly string[]).includes(value);
}

/**
 * The diagnostic code an override key addresses. Keys come in two forms: a bare
 * code (`skill.security.command.risky`) addressing the whole rule class, and a
 * `code#ruleId` key addressing one catalog pattern within it (plan 11).
 */
export function baseCodeOf(key: string): string {
  const hash = key.indexOf('#');
  return hash === -1 ? key : key.slice(0, hash);
}

/**
 * The kind an override key belongs to, or `'unknown'` when no rule emits that
 * code. Previously an unrecognised key fell back to `'quality'`, so the
 * "Configure Severity Overrides" list read a misspelled key back to the author
 * as a valid quality override while the validator silently ignored it.
 */
export function kindForOverrideKey(key: string): PickableKind | 'unknown' {
  const kind = KIND_BY_CODE[baseCodeOf(key)];
  return kind === undefined || kind === 'internal' ? 'unknown' : kind;
}

export interface SeverityOverrideValidation {
  /** Entries whose value is a real severity. Unknown *codes* are kept — inert, not harmful. */
  overrides: SeverityOverrideMap;
  /** Entries whose value is not a severity. Dropped, so the rule keeps its default. */
  invalidValues: Array<{ key: string; value: unknown }>;
  /** Keys addressing a diagnostic code no rule emits. Kept, but reported. */
  unknownKeys: string[];
}

/**
 * Splits a raw overrides object into the entries the validator can honor and
 * the problems worth telling the author about.
 */
export function validateSeverityOverrides(raw: unknown): SeverityOverrideValidation {
  const overrides: SeverityOverrideMap = {};
  const invalidValues: Array<{ key: string; value: unknown }> = [];
  const unknownKeys: string[] = [];
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { overrides, invalidValues, unknownKeys };
  }
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isSeverityOverrideValue(value)) {
      invalidValues.push({ key, value });
      continue;
    }
    if (kindForOverrideKey(key) === 'unknown') {
      unknownKeys.push(key);
    }
    overrides[key] = value;
  }
  return { overrides, invalidValues, unknownKeys };
}
