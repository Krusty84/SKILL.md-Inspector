export type SkillProfileId = 'generic' | 'vscode' | 'claude' | 'codex';

/** Language mode for description heuristics: force English, or auto-detect. */
export type DescriptionLanguage = 'en' | 'auto';

/** How strictly advisory body-section recommendations are surfaced. */
export type BodyStrictness = 'off' | 'recommended' | 'strict';

/** Expected value type for a recognized optional metadata field. */
export interface MetadataFieldSpec {
  type: 'string' | 'boolean' | 'string[]' | 'string|string[]';
}

/** Profile-specific frontmatter metadata rules (Claude/VS Code/Codex, brief §7.11). */
export interface ProfileMetadataRules {
  /** Words disallowed in `name`/`description` (matched whole-word, case-insensitive). */
  reservedWords?: string[];
  /** Flag XML-like tags in `name`/`description`. */
  forbidXmlTags?: boolean;
  /** Type specs for recognized optional fields, keyed by frontmatter key. */
  fields?: Record<string, MetadataFieldSpec>;
  /** Policy for top-level keys outside `name`/`description`/`fields`. */
  unknownKeyPolicy?: 'allow' | 'warn' | 'error';
  /** Extra recognized keys (beyond `name`/`description` and `fields`) for unknown-key analysis. */
  knownKeys?: string[];
}

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

/** Per-criterion weights for the Trigger Quality score. Expected to sum to 100. */
export interface TriggerQualityWeights {
  actionVerb: number;
  triggerPhrase: number;
  concreteArtifact: number;
  boundary: number;
  frontLoaded: number;
  lowVagueness: number;
  goodLength: number;
}

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
    weights?: TriggerQualityWeights;
  };
  /** Recommended body sections and how strictly to surface them (brief §7.4). */
  body?: {
    strictness: BodyStrictness;
    sections: BodySectionSpec[];
  };
  /** Profile-specific frontmatter metadata rules. */
  metadata?: ProfileMetadataRules;
}
