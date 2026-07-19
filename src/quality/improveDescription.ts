import { analyzeDescription } from './descriptionHeuristics';
import {
  computeStaticDescriptionQuality,
  type StaticDescriptionQualityOptions,
} from './staticDescriptionQuality';

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
  options: StaticDescriptionQualityOptions = {},
): string {
  const analysis = analyzeDescription(description, options.dictionaries);
  const result = computeStaticDescriptionQuality(description, options);

  if (analysis.trimmed === '' || result.label === 'poor') {
    return REWRITE_TEMPLATE;
  }

  const base = analysis.trimmed.replace(/[.\s]+$/, '');
  const parts = [`${base}.`];
  if (!analysis.triggerClause.markerFound) {
    parts.push('Use when <trigger context>.');
  }
  // Restrictive/exclusive markers ("limited to", "only use when") already bound
  // the scope, so no explicit "Do not use when" clause is appended for them.
  if (!analysis.boundaryClause.markerFound) {
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
  options: StaticDescriptionQualityOptions = {},
): string[] {
  const result = computeStaticDescriptionQuality(description, options);
  return result.findings
    .filter((f) => f.pointsEarned < f.pointsPossible && f.suggestion)
    .map((f) => f.suggestion as string);
}
