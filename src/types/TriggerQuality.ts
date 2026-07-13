/**
 * Types for the Trigger Quality Score. Reserved for MVP2 — declared here so the
 * scoring module can attach without touching the rest of the model. Not
 * computed anywhere in MVP1.
 */
export type TriggerQualityLabel = 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';

/** How much to trust the score given language/length limitations (Task 79). */
export type TriggerQualityConfidence = 'high' | 'medium' | 'low';

export interface TriggerQualityFinding {
  criterion: string;
  pointsEarned: number;
  pointsPossible: number;
  message: string;
  suggestion?: string;
}

export interface TriggerQualityResult {
  score: number;
  label: TriggerQualityLabel;
  findings: TriggerQualityFinding[];
  /** How confident the score is, given language and length limitations (Task 79). */
  confidence: TriggerQualityConfidence;
  /** Human-readable reasons the analysis may be incomplete (Task 79). */
  limitations: string[];
  /** True when analysis was language-limited (the description is likely not English). */
  partial?: boolean;
}
