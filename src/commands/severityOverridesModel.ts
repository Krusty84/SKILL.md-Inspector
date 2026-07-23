import { DiagnosticCode, KIND_BY_CODE } from '../types/DiagnosticCode';
import type { SkillDiagnosticKind, SkillDiagnosticSeverity } from '../types/SkillDiagnostic';

/**
 * Pure, VS Code-free helpers backing the "Configure Severity Overrides" command
 * (see `configureSeverityOverrides.ts`). Kept in their own module so the picker
 * logic can be unit-tested without mocking the VS Code host, matching the repo
 * convention of separating domain logic from the editor glue.
 */

/** A severity override value: a diagnostic severity, or `'off'` to disable the diagnostic. */
export type SeverityOverrideValue = SkillDiagnosticSeverity | 'off';

/** The map persisted in `skillMdInspector.severityOverrides` (code → severity | 'off'). */
export type SeverityOverrideMap = Record<string, SeverityOverrideValue>;

/** Kinds a user can meaningfully override, i.e. everything except `internal`. */
export type PickableKind = Exclude<SkillDiagnosticKind, 'internal'>;

/** Ordered severity choices offered in the picker, with human-readable descriptions. */
export const SEVERITY_CHOICES: ReadonlyArray<{
  value: SeverityOverrideValue;
  description: string;
}> = [
  { value: 'error', description: 'Report as an error' },
  { value: 'warning', description: 'Report as a warning' },
  { value: 'information', description: 'Report as an information hint' },
  { value: 'off', description: 'Disable this diagnostic entirely' },
];

/** Human-readable section headers for each diagnostic kind shown in the code picker. */
export const KIND_LABELS: Record<PickableKind, string> = {
  specification: 'Specification — structural (protected by default)',
  security: 'Security',
  compatibility: 'Compatibility',
  quality: 'Quality',
};

/**
 * Order the kinds appear as separators in the code picker. `internal` is
 * intentionally omitted: its only code (`skill.internal.ruleError`) signals that
 * a rule crashed, so overriding it is meaningless.
 */
const KIND_ORDER: readonly PickableKind[] = ['specification', 'security', 'compatibility', 'quality'];

export interface CodeCatalogEntry {
  /** The diagnostic code string, e.g. `skill.description.vague`. */
  code: string;
  /** The `DiagnosticCode` constant name, e.g. `DescriptionVague`. */
  constName: string;
  kind: PickableKind;
}

/**
 * The pickable diagnostic codes grouped by kind, in {@link KIND_ORDER}. Empty
 * groups are dropped. Codes of kind `internal` are excluded (see {@link KIND_ORDER}).
 */
export function groupCodesByKind(): Array<{
  kind: PickableKind;
  label: string;
  entries: CodeCatalogEntry[];
}> {
  const entries: CodeCatalogEntry[] = [];
  for (const [constName, code] of Object.entries(DiagnosticCode)) {
    const kind = KIND_BY_CODE[code];
    if (kind === undefined || kind === 'internal') {
      continue;
    }
    entries.push({ code, constName, kind });
  }
  return KIND_ORDER.map((kind) => ({
    kind,
    label: KIND_LABELS[kind],
    entries: entries.filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0);
}

/**
 * `true` when applying `severity` to `code` would be silently ignored by the
 * validator because it downgrades or disables a protected specification error.
 * Mirrors the protection logic in `src/validation/index.ts` (`applyProfileOverrides`).
 */
export function isProtectedDowngrade(
  code: string,
  severity: SeverityOverrideValue,
  allowSpecificationOverrides: boolean,
): boolean {
  return (
    KIND_BY_CODE[code] === 'specification' && !allowSpecificationOverrides && severity !== 'error'
  );
}

/** Returns a new map with `code` set to `severity` (does not mutate `current`). */
export function applyOverride(
  current: SeverityOverrideMap,
  code: string,
  severity: SeverityOverrideValue,
): SeverityOverrideMap {
  return { ...current, [code]: severity };
}

/** Returns a new map with `code` removed (does not mutate `current`). */
export function removeOverride(current: SeverityOverrideMap, code: string): SeverityOverrideMap {
  const next = { ...current };
  delete next[code];
  return next;
}
