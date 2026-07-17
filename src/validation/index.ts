import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import { runRules } from './ruleRegistry';
import { sortDiagnostics } from './util';
import { validateFrontmatter } from './validateFrontmatter';
import { validateName } from './validateName';
import { validateDescription } from './validateDescription';
import { validateLinks } from './validateLinks';
import { validateResources } from './validateResources';
import { validateBody } from './validateBody';
import { validateProfileMetadata } from './validateProfileMetadata';

export interface RunValidationsOptions {
  /** Skip filesystem-dependent checks (linked-file existence, symlink escape). */
  skipFilesystem?: boolean;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
}

/**
 * Runs every registered rule that applies to the profile, applies the profile's
 * severity overrides (Task 85), and returns the diagnostics in a deterministic
 * order (Task 82). With `skipFilesystem`, filesystem-dependent checks are omitted
 * so the pipeline is safe to run on every keystroke.
 */
export function runAllValidations(
  doc: SkillDocument,
  profile: SkillProfile,
  options: RunValidationsOptions = {},
): SkillDiagnostic[] {
  const diagnostics = runRules({ doc, profile, skipFilesystem: options.skipFilesystem, dictionaries: options.dictionaries, resourceDirectories: options.resourceDirectories });
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
    const override = overrides[diagnostic.code];
    if (override === undefined) {
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

export {
  validateFrontmatter,
  validateName,
  validateDescription,
  validateLinks,
  validateResources,
  validateBody,
  validateProfileMetadata,
};
export { toKebabCase, NAME_PATTERN } from './validateName';
export { sortDiagnostics } from './util';
export { runRules, VALIDATION_RULES } from './ruleRegistry';
export type { ValidationRule, ValidationContext } from './ruleRegistry';
