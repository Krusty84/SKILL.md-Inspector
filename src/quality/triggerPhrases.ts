/**
 * Single source of truth for trigger/boundary phrase vocabulary (brief §7.7 /
 * §10.4). Both the standalone phrase matchers and the scope-clause analyzer in
 * `descriptionHeuristics.ts` derive their marker sets from these lists, so a
 * phrase added here is picked up everywhere at once.
 *
 * Matching is case-insensitive with flexible whitespace between words.
 */

/**
 * Phrases that positively communicate WHEN a skill should be triggered.
 * Purely negative phrases are kept out of this list so that "Do not use
 * when ..." is not scored as a positive trigger.
 */
export const POSITIVE_TRIGGER_PHRASES: readonly string[] = [
  'use this skill when',
  'use this when',
  'use when',
  'use for',
  'trigger when',
  'when asked to',
  'when the user needs',
  'when the user',
  'appropriate for',
  'intended for',
];

/**
 * Phrases that signal a positive trigger AND restrict scope at the same time —
 * "only use when ..." both says when to use the skill and bounds it. They count
 * as both a positive trigger and a boundary.
 */
export const EXCLUSIVE_TRIGGER_PHRASES: readonly string[] = [
  'only use when',
  'only use for',
];

/**
 * Phrases that define WHEN NOT to use a skill — the negative boundary
 * (brief §10.4). These are stripped from a sentence before positive-trigger
 * matching so that the "use when" / "intended for" fragments embedded in
 * "do not use when" / "not intended for" never count as positive evidence.
 */
export const NEGATIVE_BOUNDARY_PHRASES: readonly string[] = [
  'do not use when',
  'do not use for',
  "don't use when",
  "don't use for",
  'never use when',
  'never use for',
  'avoid using for',
  'avoid using when',
  'avoid when',
  'not intended for',
  'not designed for',
  'not suitable for',
];

/**
 * Boundary markers that bound scope without a negation — "limited to tagged
 * releases", "excluding drafts". They count as boundary evidence for the
 * scope-clause analyzer but are NOT negative phrases (a description reading
 * "only for X" still tells the agent when to trigger).
 */
export const RESTRICTIVE_BOUNDARY_PHRASES: readonly string[] = [
  'limited to',
  'only for',
  'exclude',
  'excluding',
  'except when',
  'except for',
];

/** Markers accepted as trigger-clause evidence by the scope analyzer. */
export const TRIGGER_SCOPE_MARKERS: readonly string[] = [
  ...POSITIVE_TRIGGER_PHRASES,
  ...EXCLUSIVE_TRIGGER_PHRASES,
];

/** Markers accepted as boundary-clause evidence by the scope analyzer. */
export const BOUNDARY_SCOPE_MARKERS: readonly string[] = [
  ...NEGATIVE_BOUNDARY_PHRASES,
  ...RESTRICTIVE_BOUNDARY_PHRASES,
  ...EXCLUSIVE_TRIGGER_PHRASES,
];
