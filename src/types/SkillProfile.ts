export type SkillProfileId = 'generic' | 'vscode' | 'claude' | 'codex';

/** Language mode for description heuristics: force English, or auto-detect. */
export type DescriptionLanguage = 'en' | 'auto';

/**
 * A validation profile bundles the tunable limits used by the rules. In MVP1
 * every profile shares the same rule logic and differs only in these limits;
 * the shape leaves room for profile-specific rule toggles later (MVP3).
 */
export interface SkillProfile {
  id: SkillProfileId;
  label: string;
  nameMaxLength: number;
  description: {
    minLength: number;
    maxLength: number;
    language?: DescriptionLanguage;
  };
}
