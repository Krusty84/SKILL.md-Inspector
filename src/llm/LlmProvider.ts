/**
 * Placeholder for future LLM-assisted review. MVP1 ships NO implementation and
 * the `skillMdInspector.experimental.llmReview.enabled` setting is inert — this
 * interface only reserves the seam so a provider can attach later (brief §24).
 */
export interface LlmReviewRequest {
  skillName: string;
  description: string;
  body: string;
}

export interface LlmReviewResult {
  summary: string;
  suggestions: string[];
}

export interface LlmProvider {
  readonly id: string;
  review(request: LlmReviewRequest): Promise<LlmReviewResult>;
}
