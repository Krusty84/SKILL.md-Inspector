import { analyzeDescription } from './descriptionHeuristics';
import { computeTriggerQuality, type TriggerQualityOptions } from './triggerQualityScore';

/** The pattern used when there is nothing salvageable to build on (brief §10.5). */
export const REWRITE_TEMPLATE =
  '<Action verb> <artifact/domain>. Use when <trigger context>. Do not use when <boundary>.';

/**
 * Produces a deterministic, LLM-free improved description (brief §10.5).
 * - Empty or "poor" descriptions become the full template.
 * - Otherwise the existing text is kept and only the missing trigger and/or
 *   boundary clauses are appended, so nothing the author wrote is discarded.
 */
export function buildImprovedDescription(
  description: string,
  options: TriggerQualityOptions = {},
): string {
  const analysis = analyzeDescription(description);
  const result = computeTriggerQuality(description, options);

  if (analysis.trimmed === '' || result.label === 'poor') {
    return REWRITE_TEMPLATE;
  }

  const base = analysis.trimmed.replace(/[.\s]+$/, '');
  const parts = [`${base}.`];
  if (!analysis.triggerPhrase.found) {
    parts.push('Use when <trigger context>.');
  }
  if (!analysis.boundaryPhrase.found) {
    parts.push('Do not use when <boundary>.');
  }
  return parts.join(' ');
}

/**
 * Returns actionable, deterministic suggestions for the criteria that lost
 * points (brief §10.2) — one short line per weak criterion.
 */
export function buildDescriptionSuggestions(
  description: string,
  options: TriggerQualityOptions = {},
): string[] {
  const result = computeTriggerQuality(description, options);
  return result.findings
    .filter((f) => f.pointsEarned < f.pointsPossible && f.suggestion)
    .map((f) => f.suggestion as string);
}
