import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import { runRules } from './ruleRegistry';
import { isSeverityOverrideValue } from './severityOverrides';
import { sortDiagnostics } from './util';
import { validateFrontmatter } from './validateFrontmatter';
import { validateName } from './validateName';
import { validateDescription } from './validateDescription';
import { validateLinks } from './validateLinks';
import { validateResources } from './validateResources';
import { validateBody } from './validateBody';
import { validateTokenBudgets } from './validateTokenBudgets';
import type { AnalyzedSkillTokenUsage } from '../types/SkillTokenUsage';
import type { SecuritySettings } from './security';

export interface RunValidationsOptions {
  /** Skip filesystem-dependent checks (linked-file existence, symlink escape, resource scan). */
  skipFilesystem?: boolean;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
  tokenUsage?: AnalyzedSkillTokenUsage;
  security?: SecuritySettings;
}

/**
 * Runs every registered rule, applies the profile's severity overrides
 * (Task 85), and returns the diagnostics in a deterministic order (Task 82).
 * With `skipFilesystem`, filesystem-dependent checks are omitted so the
 * pipeline is safe to run on every keystroke.
 */
export function runAllValidations(
  doc: SkillDocument,
  profile: SkillProfile,
  options: RunValidationsOptions = {},
): SkillDiagnostic[] {
  const diagnostics = runRules({
    doc,
    profile,
    skipFilesystem: options.skipFilesystem,
    dictionaries: options.dictionaries,
    resourceDirectories: options.resourceDirectories,
    tokenUsage: options.tokenUsage,
    security: options.security,
  });
  return sortDiagnostics(applyProfileOverrides(diagnostics, profile));
}

/**
 * Applies a profile's per-code severity overrides (Task 85). `'off'` drops the
 * diagnostic. Specification-kind errors are protected: an override that would
 * disable or downgrade one is ignored unless the profile opts in with
 * `allowSpecificationOverrides`.
 */
function applyProfileOverrides(
  diagnostics: SkillDiagnostic[],
  profile: SkillProfile,
): SkillDiagnostic[] {
  const overrides = profile.severityOverrides;
  if (!overrides) {
    return diagnostics;
  }
  const allowSpecification = profile.allowSpecificationOverrides === true;
  const result: SkillDiagnostic[] = [];
  for (const diagnostic of diagnostics) {
    // A `code#ruleId` key addresses one catalog pattern; the bare code still
    // addresses its whole class. The narrower key wins, so an author can keep
    // a rule class enabled while silencing a single pattern within it.
    //
    // A finding merged from several patterns on one line carries every id it
    // covers, and any of them addresses it: `sudo chmod 777 /srv && git push
    // --force` is one diagnostic, and `#chmod-777` must reach it.
    const override = ruleIdsOf(diagnostic).map((id) => overrides[`${diagnostic.code}#${id}`])
      .find((value) => value !== undefined) ?? overrides[diagnostic.code];
    // `severityOverrides` is untyped user JSON. `readConfig` drops values that
    // are not a severity and warns about them, but a profile can be built by
    // other paths (tests, future callers), so never let an unknown value reach
    // `diagnostic.severity`: it renders as an Error, and it breaks the severity
    // counters and the sort comparator that key on the three known values.
    if (override === undefined || !isSeverityOverrideValue(override)) {
      result.push(diagnostic);
      continue;
    }
    const isProtected = diagnostic.kind === 'specification' && !allowSpecification;
    if (override === 'off') {
      if (isProtected) {
        result.push(diagnostic); // never silently disable a specification error
      }
      continue;
    }
    if (isProtected && override !== 'error') {
      result.push(diagnostic); // never silently downgrade a specification error
      continue;
    }
    result.push({ ...diagnostic, severity: override });
  }
  return result;
}

/** Every catalog rule id a diagnostic can be addressed by, most specific first. */
function ruleIdsOf(diagnostic: SkillDiagnostic): string[] {
  const ids = diagnostic.data?.ruleIds;
  if (Array.isArray(ids)) {
    return ids.filter((id): id is string => typeof id === 'string');
  }
  const single = diagnostic.data?.ruleId;
  return typeof single === 'string' ? [single] : [];
}

/** Applies profile overrides to asynchronous additions, then performs the same stable sort. */
export function mergeDiagnostics(
  staticDiagnostics: SkillDiagnostic[],
  additionalDiagnostics: SkillDiagnostic[],
  profile: SkillProfile,
): SkillDiagnostic[] {
  return sortDiagnostics([
    ...staticDiagnostics,
    ...applyProfileOverrides(additionalDiagnostics, profile),
  ]);
}

export {
  validateFrontmatter,
  validateName,
  validateDescription,
  validateLinks,
  validateResources,
  validateBody,
  validateTokenBudgets,
};
export { validateSecurity } from './security';
export { toKebabCase, NAME_PATTERN } from './validateName';
export { sortDiagnostics } from './util';
export { runRules, VALIDATION_RULES } from './ruleRegistry';
export type { ValidationRule, ValidationContext } from './ruleRegistry';
export {
  validateSeverityOverrides,
  isSeverityOverrideValue,
  kindForOverrideKey,
  baseCodeOf,
} from './severityOverrides';
