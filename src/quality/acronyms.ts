/**
 * Controlled registry of domain acronyms and technologies that count as a
 * concrete artifact/domain in a description (brief §7.7). Matched case-insensitively.
 * Maintained here as the single source of truth — extend this list rather than
 * re-introducing a broad "any uppercase word" heuristic.
 */
export const KNOWN_ACRONYMS: ReadonlySet<string> = new Set([
  'pdf',
  'csv',
  'json',
  'yaml',
  'xml',
  'html',
  'css',
  'api',
  'sql',
  'sdk',
  'cli',
  'pr',
]);

/** True when `value` is a known acronym/technology, ignoring case. */
export function isKnownAcronym(value: string): boolean {
  return KNOWN_ACRONYMS.has(value.toLowerCase());
}
