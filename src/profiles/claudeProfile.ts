import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';
import {
  EXAMPLES_SECTION,
  WHEN_TO_USE_SECTION,
  BOUNDARY_SECTION,
} from '../validation/bodySections';

/** Claude Agent Skills. */
export const claudeProfile: SkillProfile = {
  ...genericProfile,
  id: 'claude',
  label: 'Claude',
  body: {
    strictness: 'recommended',
    sections: [EXAMPLES_SECTION, WHEN_TO_USE_SECTION, BOUNDARY_SECTION],
  },
  metadata: {
    // Best-effort placeholder — reconcile with the live Claude Agent Skills spec.
    // A skill should not brand itself as the platform it runs on.
    reservedWords: ['anthropic', 'claude'],
    // Claude reads name/description as plain text; XML-like tags are disallowed.
    forbidXmlTags: true,
    // Claude skills support only `name`/`description`; anything else is unexpected.
    unknownKeyPolicy: 'warn',
  },
};
