import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';

/** Codex-style skills. Shares generic rules in MVP1 (brief §7.11). */
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
};
