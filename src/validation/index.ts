import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import { validateFrontmatter } from './validateFrontmatter';
import { validateName } from './validateName';
import { validateDescription } from './validateDescription';
import { validateLinks } from './validateLinks';
import { validateResources } from './validateResources';
import { validateBody } from './validateBody';

/**
 * Runs every deterministic rule over a fully-built skill document (frontmatter
 * parsed, resources attached) and returns the combined diagnostics.
 */
export function runAllValidations(doc: SkillDocument, profile: SkillProfile): SkillDiagnostic[] {
  return [
    ...validateFrontmatter(doc),
    ...validateName(doc, profile),
    ...validateDescription(doc, profile),
    ...validateLinks(doc),
    ...validateResources(doc),
    ...validateBody(doc),
  ];
}

export {
  validateFrontmatter,
  validateName,
  validateDescription,
  validateLinks,
  validateResources,
  validateBody,
};
export { toKebabCase, NAME_PATTERN } from './validateName';
