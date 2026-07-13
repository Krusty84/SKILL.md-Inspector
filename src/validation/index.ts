import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
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
}

/**
 * Runs every deterministic rule over a skill document and returns the combined
 * diagnostics. With `skipFilesystem`, filesystem-dependent checks are omitted so
 * the pipeline is safe to run on every keystroke.
 */
export function runAllValidations(
  doc: SkillDocument,
  profile: SkillProfile,
  options: RunValidationsOptions = {},
): SkillDiagnostic[] {
  return [
    ...validateFrontmatter(doc),
    ...validateName(doc, profile),
    ...validateDescription(doc, profile),
    ...validateLinks(doc, { skipFilesystem: options.skipFilesystem }),
    ...validateResources(doc),
    ...validateBody(doc, profile),
    ...validateProfileMetadata(doc, profile),
  ];
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
