/**
 * Types for the Static Description Quality Score. Reserved for MVP2 — declared here so the
 * scoring module can attach without touching the rest of the model. Not
 * computed anywhere in MVP1.
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

export interface StaticDescriptionQualityResult {
  score: number;
  label: StaticDescriptionQualityLabel;
  findings: StaticDescriptionQualityFinding[];
  /** Applicability and completeness of deterministic checks; not confidence. */
  coverage: HeuristicCoverage;
  /** Human-readable reasons the analysis may be incomplete (Task 79). */
  limitations: string[];
  /** True when analysis was language-limited (the description is likely not English). */
  partial?: boolean;
}
