/**
 * Shared word-boundary phrase matching for dictionary markers ("use when",
 * "do not use for", …). Kept as a leaf module with no imports so the quality,
 * workspace, and validation layers can all reuse it without circular
 * dependencies.
 */

/** Escapes regex metacharacters so a dictionary term can be embedded literally. */
export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Whole-word regex for a space-separated phrase: word boundaries at both ends,
 * flexible whitespace between words, and either apostrophe style — a dictionary
 * "don't" matches a typographic "don’t" (U+2019) typed by an editor.
 */
export function phraseRegex(phrase: string, flags = 'i'): RegExp {
  const words = phrase.split(' ').map((word) => escapeRegex(word).replace(/'/g, "['’]"));
  return new RegExp(`\\b${words.join('\\s+')}\\b`, flags);
}
