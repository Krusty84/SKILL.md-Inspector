import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { SkillProfile, SkillProfileId } from '../types/SkillProfile';
import { validateFrontmatter } from './validateFrontmatter';
import { validateName } from './validateName';
import { validateDescription } from './validateDescription';
import { validateLinks } from './validateLinks';
import { validateResources } from './validateResources';
import { validateBody } from './validateBody';
import { validateProfileMetadata } from './validateProfileMetadata';

/** Everything a rule needs to run. */
export interface ValidationContext {
  doc: SkillDocument;
  profile: SkillProfile;
  /** Skip filesystem-dependent checks (linked-file existence, symlink escape). */
  skipFilesystem?: boolean;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
}

/**
 * A registered validation rule (Task 84). Each rule wraps one validator area
 * (which may emit several diagnostic codes), so the pipeline is data-driven and a
 * profile can enable/disable a whole area via `appliesToProfiles`. Per-code
 * severity overrides and disabling are handled separately (Task 85).
 */
export interface ValidationRule {
  id: string;
  /** Profiles this rule runs for; `undefined` means every profile. */
  appliesToProfiles?: SkillProfileId[];
  run(context: ValidationContext): SkillDiagnostic[];
}

/** The built-in rules in a stable order (the final output is sorted deterministically). */
export const VALIDATION_RULES: ValidationRule[] = [
  { id: 'frontmatter', run: ({ doc }) => validateFrontmatter(doc) },
  { id: 'name', run: ({ doc, profile }) => validateName(doc, profile) },
  {
    id: 'description',
    run: ({ doc, profile, dictionaries }) => validateDescription(doc, profile, dictionaries),
  },
  { id: 'links', run: ({ doc, skipFilesystem }) => validateLinks(doc, { skipFilesystem }) },
  {
    id: 'resources',
    run: ({ doc, resourceDirectories }) => validateResources(doc, resourceDirectories),
  },
  { id: 'body', run: ({ doc, profile }) => validateBody(doc, profile) },
  { id: 'profile-metadata', run: ({ doc, profile }) => validateProfileMetadata(doc, profile) },
];

/** Runs the registered rules that apply to the context's profile, concatenated in registry order. */
export function runRules(
  context: ValidationContext,
  rules: ValidationRule[] = VALIDATION_RULES,
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  for (const rule of rules) {
    if (rule.appliesToProfiles && !rule.appliesToProfiles.includes(context.profile.id)) {
      continue;
    }
    diagnostics.push(...rule.run(context));
  }
  return diagnostics;
}
