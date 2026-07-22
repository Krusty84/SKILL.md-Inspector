import type { SkillProfile, DescriptionLanguage, BodyStrictness } from '../types/SkillProfile';
import type { SkillDiagnosticSeverity } from '../types/SkillDiagnostic';
import { genericProfile } from './genericProfile';

/** Optional per-setting overrides applied on top of the profile's defaults. */
export interface ProfileOverrides {
  nameMaxLength?: number;
  descriptionMinLength?: number;
  descriptionMaxLength?: number;
  descriptionLanguage?: DescriptionLanguage;
  bodyStrictness?: BodyStrictness;
  severityOverrides?: Record<string, SkillDiagnosticSeverity | 'off'>;
  allowSpecificationOverrides?: boolean;
}

/**
 * Applies any overrides sourced from user settings on top of the generic
 * profile's defaults. Returns a fresh object.
 */
export function resolveProfile(overrides: ProfileOverrides = {}): SkillProfile {
  const base = genericProfile;
  return {
    ...base,
    nameMaxLength: overrides.nameMaxLength ?? base.nameMaxLength,
    description: {
      minLength: overrides.descriptionMinLength ?? base.description.minLength,
      maxLength: overrides.descriptionMaxLength ?? base.description.maxLength,
      language: overrides.descriptionLanguage ?? base.description.language,
      weights: base.description.weights,
    },
    body: base.body
      ? {
          strictness: overrides.bodyStrictness ?? base.body.strictness,
          sections: base.body.sections,
        }
      : base.body,
    severityOverrides: { ...base.severityOverrides, ...overrides.severityOverrides },
    allowSpecificationOverrides:
      overrides.allowSpecificationOverrides ?? base.allowSpecificationOverrides,
  };
}

export { genericProfile };
