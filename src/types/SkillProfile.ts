import type { SkillDiagnosticSeverity } from './SkillDiagnostic';

export type SkillProfileId = 'generic';

/** Language mode for description heuristics: force English, or auto-detect. */
export type DescriptionLanguage = 'en' | 'auto';

/** How strictly advisory body-section recommendations are surfaced. */
export type BodyStrictness = 'off' | 'recommended' | 'strict';

/** A recommended Markdown body section, matched by heading token or alias phrase. */
export interface BodySectionSpec {
  id: string;
  /** Diagnostic code emitted when the section is absent. */
  code: string;
  message: string;
  /** Whole-token keywords (matched against heading tokens, not as substrings). */
  tokens: string[];
  /** Multi-word alias phrases matched against the normalized heading. */
  phrases: string[];
}

/** Per-criterion weights for the Static Description Quality score. Expected to sum to 100. */
export interface StaticDescriptionQualityWeights {
  actionVerb: number;
  triggerPhrase: number;
  concreteArtifact: number;
  boundary: number;
  frontLoaded: number;
  lowVagueness: number;
  goodLength: number;
}

/**
 * The validation policy: the tunable limits used by the rules, resolved from
 * the generic baseline plus user-setting overrides.
 */
export interface SkillProfile {
  id: SkillProfileId;
  label: string;
  nameMaxLength: number;
  description: {
    minLength: number;
    maxLength: number;
    language?: DescriptionLanguage;
    weights?: StaticDescriptionQualityWeights;
  };
  /** Recommended body sections and how strictly to surface them (brief §7.4). */
  body?: {
    strictness: BodyStrictness;
    sections: BodySectionSpec[];
  };
  /**
   * Per-code severity overrides (Task 85): map a diagnostic code to a severity,
   * or to `'off'` to disable it. Specification-kind errors are protected unless
   * `allowSpecificationOverrides` is set.
   */
  severityOverrides?: Record<string, SkillDiagnosticSeverity | 'off'>;
  /** Allow `severityOverrides` to downgrade or disable specification-kind errors (Task 85). */
  allowSpecificationOverrides?: boolean;
}
