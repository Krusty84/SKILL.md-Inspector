import type { SkillProfile } from '../types/SkillProfile';
import { EXAMPLES_SECTION, WHEN_TO_USE_SECTION } from '../validation/bodySections';

/** The validation policy baseline; user settings can adjust these limits. */
export const genericProfile: SkillProfile = {
  id: 'generic',
  label: 'Generic',
  nameMaxLength: 64,
  description: {
    minLength: 40,
    maxLength: 1024,
    // Boundary de-emphasized: a description can be excellent without a "Do not
    // use when..." clause; the freed weight goes to artifact/length.
    weights: {
      actionVerb: 20,
      triggerPhrase: 20,
      concreteArtifact: 20,
      boundary: 5,
      frontLoaded: 10,
      lowVagueness: 10,
      goodLength: 15,
    },
  },
  // Minimal body expectations.
  body: {
    strictness: 'recommended',
    sections: [EXAMPLES_SECTION, WHEN_TO_USE_SECTION],
  },
};
