import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';

/** Claude Agent Skills. Shares generic rules in MVP1 (brief §7.11). */
export const claudeProfile: SkillProfile = {
  ...genericProfile,
  id: 'claude',
  label: 'Claude',
};
