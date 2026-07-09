import type { SkillProfile } from '../types/SkillProfile';

/** Baseline profile. Other MVP1 profiles extend these limits (brief §7.11). */
export const genericProfile: SkillProfile = {
  id: 'generic',
  label: 'Generic',
  nameMaxLength: 64,
  description: {
    minLength: 40,
    maxLength: 1024,
  },
};
