import type { SkillProfile, SkillProfileId, DescriptionLanguage } from '../types/SkillProfile';
import { genericProfile } from './genericProfile';
import { vscodeProfile } from './vscodeProfile';
import { claudeProfile } from './claudeProfile';
import { codexProfile } from './codexProfile';

export const PROFILES: Record<SkillProfileId, SkillProfile> = {
  generic: genericProfile,
  vscode: vscodeProfile,
  claude: claudeProfile,
  codex: codexProfile,
};

/** Optional per-setting overrides applied on top of a profile's defaults. */
export interface ProfileOverrides {
  nameMaxLength?: number;
  descriptionMinLength?: number;
  descriptionMaxLength?: number;
  descriptionLanguage?: DescriptionLanguage;
}

/**
 * Resolves a profile by id (falling back to generic) and applies any numeric
 * overrides sourced from user settings. Returns a fresh object.
 */
export function resolveProfile(id: string, overrides: ProfileOverrides = {}): SkillProfile {
  const base = PROFILES[id as SkillProfileId] ?? genericProfile;
  return {
    ...base,
    nameMaxLength: overrides.nameMaxLength ?? base.nameMaxLength,
    description: {
      minLength: overrides.descriptionMinLength ?? base.description.minLength,
      maxLength: overrides.descriptionMaxLength ?? base.description.maxLength,
      language: overrides.descriptionLanguage ?? base.description.language,
    },
  };
}

export { genericProfile, vscodeProfile, claudeProfile, codexProfile };
