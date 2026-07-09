import type { SkillProfile } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';

/** VS Code / Copilot skills. Shares generic rules in MVP1 (brief §7.11). */
export const vscodeProfile: SkillProfile = {
  ...genericProfile,
  id: 'vscode',
  label: 'VS Code',
};
