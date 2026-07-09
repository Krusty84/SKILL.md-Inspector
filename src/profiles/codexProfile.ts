import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';

/** Codex-style skills. Shares generic rules in MVP1 (brief §7.11). */
export const codexProfile: SkillProfile = {
  ...genericProfile,
  id: 'codex',
  label: 'Codex',
};
