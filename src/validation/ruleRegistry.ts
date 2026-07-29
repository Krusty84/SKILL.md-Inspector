import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { SkillProfile } from '../types/SkillProfile';
import { DiagnosticCode } from '../types/DiagnosticCode';
import { diag } from './util';
import { validateFrontmatter } from './validateFrontmatter';
import { validateName } from './validateName';
import { validateDescription } from './validateDescription';
import { validateLinks } from './validateLinks';
import { validateResources } from './validateResources';
import { validateBody } from './validateBody';
import { validateTokenBudgets } from './validateTokenBudgets';
import { validateSecurity, DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from '../analysis/security';
import type { AnalyzedSkillTokenUsage } from '../types/SkillTokenUsage';

/** Everything a rule needs to run. */
export interface ValidationContext {
  doc: SkillDocument;
  profile: SkillProfile;
  /** Skip filesystem-dependent checks (linked-file existence, symlink escape, resource scan). */
  skipFilesystem?: boolean;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
  tokenUsage?: AnalyzedSkillTokenUsage;
  /** Security-scan settings; defaults to {@link DEFAULT_SECURITY_SETTINGS} when omitted. */
  security?: SecuritySettings;
}

/**
 * A registered validation rule (Task 84). Each rule wraps one validator area
 * (which may emit several diagnostic codes), so the pipeline is data-driven.
 * Per-code severity overrides and disabling are handled separately (Task 85).
 */
export interface ValidationRule {
  id: string;
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
  { id: 'body', run: ({ doc, profile, dictionaries }) => validateBody(doc, profile, dictionaries) },
  { id: 'token-budgets', run: ({ doc, tokenUsage }) => validateTokenBudgets(doc, tokenUsage) },
  {
    id: 'security',
    run: ({ doc, skipFilesystem, security }) =>
      validateSecurity({ doc, settings: security ?? DEFAULT_SECURITY_SETTINGS, skipFilesystem }),
  },
];

/** Runs the registered rules, concatenated in registry order. */
export function runRules(
  context: ValidationContext,
  rules: ValidationRule[] = VALIDATION_RULES,
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  for (const rule of rules) {
    // Rule isolation: one rule throwing must not abort the run and leave the
    // editor's diagnostics stale. Contain the failure, surface it as a non-fatal
    // internal diagnostic so the coverage loss is visible, and keep going.
    try {
      diagnostics.push(...rule.run(context));
    } catch (error) {
      diagnostics.push(ruleFailureDiagnostic(rule.id, error));
    }
  }
  return diagnostics;
}

/** A non-fatal diagnostic reporting that one rule crashed, so its coverage loss is never silent. */
function ruleFailureDiagnostic(ruleId: string, error: unknown): SkillDiagnostic {
  const detail = error instanceof Error && error.message ? error.message : String(error);
  return diag(
    DiagnosticCode.RuleInternalError,
    'information',
    `The "${ruleId}" validation rule did not finish (${detail.split('\n')[0]}). ` +
      'Other checks still ran; this is a linter error, not a problem with the skill.',
  );
}
