/**
 * Phrases that communicate WHEN a skill should be triggered (brief §7.7).
 * Matched case-insensitively as substrings.
 */
export const TRIGGER_PHRASES: readonly string[] = [
  'use when',
  'use for',
  'use this when',
  'use this skill when',
  'trigger when',
  'only use when',
  'do not use when',
  'when asked to',
  'when the user',
];

/**
 * Phrases that define WHEN NOT to use a skill — the boundary (brief §10.4).
 * A subset also appears in TRIGGER_PHRASES; kept separate for the boundary check.
 */
export const BOUNDARY_PHRASES: readonly string[] = [
  'do not use when',
  'do not use for',
  'only use when',
  'avoid using for',
  'avoid using when',
  'not intended for',
  "don't use when",
  "don't use for",
];
