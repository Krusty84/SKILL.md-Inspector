/**
 * Types for the Trigger Quality Score. Reserved for MVP2 — declared here so the
 * scoring module can attach without touching the rest of the model. Not
 * computed anywhere in MVP1.
 */
export type TriggerQualityLabel = 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';

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
  /** True when analysis was language-limited (the description is likely not English). */
  partial?: boolean;
}
