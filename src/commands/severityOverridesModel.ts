import * as l10n from '@vscode/l10n';
import { DiagnosticCode, KIND_BY_CODE } from '../types/DiagnosticCode';
import { baseCodeOf } from '../validation/severityOverrides';
import type {
  PickableKind,
  SeverityOverrideMap,
  SeverityOverrideValue,
} from '../validation/severityOverrides';

/**
 * Pure, VS Code-free helpers backing the "Configure Severity Overrides" command
 * (see `configureSeverityOverrides.ts`). Kept in their own module so the picker
 * logic can be unit-tested without mocking the VS Code host, matching the repo
 * convention of separating domain logic from the editor glue.
 *
 * The override *schema* — which values are legal, which keys address a real
 * rule — lives in `src/validation/severityOverrides.ts`, next to the code that
 * has to distrust it, and is re-exported here for the picker.
 */

export {
  kindForOverrideKey,
  isSeverityOverrideValue,
  validateSeverityOverrides,
  SEVERITY_OVERRIDE_VALUES,
} from '../validation/severityOverrides';
export type {
  PickableKind,
  SeverityOverrideMap,
  SeverityOverrideValue,
} from '../validation/severityOverrides';

/**
 * Ordered severity choices offered in the picker, with human-readable
 * descriptions. A function so descriptions are localized at call time, after
 * the l10n bundle is configured.
 */
export function severityChoices(): ReadonlyArray<{
  value: SeverityOverrideValue;
  description: string;
}> {
  return [
    { value: 'error', description: l10n.t('Report as an error') },
    { value: 'warning', description: l10n.t('Report as a warning') },
    { value: 'information', description: l10n.t('Report as an information hint') },
    { value: 'off', description: l10n.t('Disable this diagnostic entirely') },
  ];
}

/** Human-readable section header for a diagnostic kind shown in the code picker. */
export function kindLabel(kind: PickableKind): string {
  switch (kind) {
    case 'specification':
      return l10n.t('Specification — structural (protected by default)');
    case 'security':
      return l10n.t('Security');
    case 'compatibility':
      return l10n.t('Compatibility');
    case 'quality':
      return l10n.t('Quality');
  }
}

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
    label: kindLabel(kind),
    entries: entries.filter((entry) => entry.kind === kind),
  })).filter((group) => group.entries.length > 0);
}

/**
 * `true` when applying `severity` to `code` would be silently ignored by the
 * validator because it downgrades or disables a protected specification error.
 * Mirrors the protection logic in `src/validation/index.ts` (`applyProfileOverrides`),
 * including its per-rule `code#ruleId` keys.
 */
export function isProtectedDowngrade(
  code: string,
  severity: SeverityOverrideValue,
  allowSpecificationOverrides: boolean,
): boolean {
  return (
    KIND_BY_CODE[baseCodeOf(code)] === 'specification' &&
    !allowSpecificationOverrides &&
    severity !== 'error'
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
