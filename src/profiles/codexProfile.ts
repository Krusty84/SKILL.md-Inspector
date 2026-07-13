import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';
import {
  EXAMPLES_SECTION,
  WHEN_TO_USE_SECTION,
  BOUNDARY_SECTION,
  IO_SECTION,
} from '../validation/bodySections';

/** Codex-style skills. */
export const codexProfile: SkillProfile = {
  ...genericProfile,
  id: 'codex',
  label: 'Codex',
  description: {
    ...genericProfile.description,
    // Codex skills should declare when NOT to fire — boundary weighted strongly.
    weights: {
      actionVerb: 20,
      triggerPhrase: 15,
      concreteArtifact: 15,
      boundary: 20,
      frontLoaded: 10,
      lowVagueness: 10,
      goodLength: 10,
    },
  },
  // Codex skills should document boundaries and I/O.
  body: {
    strictness: 'recommended',
    sections: [EXAMPLES_SECTION, WHEN_TO_USE_SECTION, BOUNDARY_SECTION, IO_SECTION],
  },
  metadata: {
    // Best-effort placeholder — reconcile with the live Codex skill format.
    fields: {
      version: { type: 'string' },
      tools: { type: 'string[]' },
    },
    unknownKeyPolicy: 'warn',
  },
};
