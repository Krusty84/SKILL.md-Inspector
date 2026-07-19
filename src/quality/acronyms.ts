import { DEFAULT_HEURISTIC_DICTIONARIES } from './dictionaries';

/** Compatibility export; canonical values live in defaultHeuristicDictionaries.json. */
export const KNOWN_ACRONYMS: ReadonlySet<string> = new Set(DEFAULT_HEURISTIC_DICTIONARIES.acronyms);

/** True when `value` is a known built-in acronym/technology, ignoring case. */
export function isKnownAcronym(value: string): boolean {
  return KNOWN_ACRONYMS.has(value.toLowerCase());
}
