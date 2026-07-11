/**
 * Phrases that positively communicate WHEN a skill should be triggered (brief §7.7).
 * Matched case-insensitively as substrings. Purely negative phrases are kept out of
 * this list so that "Do not use when ..." is not scored as a positive trigger.
 */
export const POSITIVE_TRIGGER_PHRASES: readonly string[] = [
  'use when',
  'use for',
  'use this when',
  'use this skill when',
  'trigger when',
  'when asked to',
  'when the user',
];

/**
 * Phrases that signal a positive trigger AND restrict scope at the same time —
 * "only use when ..." both says when to use the skill and bounds it. They count as
 * both a positive trigger and a boundary.
 */
export const EXCLUSIVE_TRIGGER_PHRASES: readonly string[] = ['only use when'];

/**
 * Phrases that define WHEN NOT to use a skill — the negative boundary (brief §10.4).
 */
export const NEGATIVE_BOUNDARY_PHRASES: readonly string[] = [
  'do not use when',
  'do not use for',
  'avoid using for',
  'avoid using when',
  'not intended for',
  "don't use when",
  "don't use for",
];
