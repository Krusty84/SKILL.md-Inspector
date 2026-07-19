/**
 * Types for the Static Description Quality Score, computed by
 * `quality/staticDescriptionQuality.ts` and surfaced in the skill report,
 * workspace analysis, and the exported skills index. Declared here so the
 * scoring module can attach without touching the rest of the model.
 */
export type StaticDescriptionQualityLabel = 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';

/** Applicability and completeness of deterministic static checks. */
export type HeuristicCoverage = 'high' | 'medium' | 'low';

export interface StaticDescriptionQualityFinding {
  criterion: string;
  pointsEarned: number;
  pointsPossible: number;
  message: string;
  suggestion?: string;
}

export type StaticDescriptionQualityGradeLimitationCode =
  | 'missing-action-capability'
  | 'missing-usage-trigger'
  | 'vague-usage-trigger'
  | 'missing-concrete-artifact';

/** An explicit policy ceiling applied after the additive criterion score. */
export interface StaticDescriptionQualityGradeLimitation {
  code: StaticDescriptionQualityGradeLimitationCode;
  ceiling: number;
  reason: string;
}

export interface StaticDescriptionQualityResult {
  /** Public score after all reported grade limitations are applied. */
  score: number;
  /** Additive total of `findings[].pointsEarned`, before policy ceilings. */
  rawScore: number;
  /** Explicit adjusted score; identical to the compatibility `score` field. */
  adjustedScore: number;
  label: StaticDescriptionQualityLabel;
  findings: StaticDescriptionQualityFinding[];
  /** Every essential-completeness ceiling that applies to this description. */
  gradeLimitations: StaticDescriptionQualityGradeLimitation[];
  /** Applicability and completeness of deterministic checks; not confidence. */
  coverage: HeuristicCoverage;
  /** Human-readable reasons the analysis may be incomplete (Task 79). */
  limitations: string[];
  /** True when analysis was language-limited (the description is likely not English). */
  partial?: boolean;
}
