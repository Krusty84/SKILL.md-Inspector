import { DEFAULT_HEURISTIC_DICTIONARIES } from './dictionaries';

/** Compatibility exports; canonical values live in defaultHeuristicDictionaries.json. */
export const POSITIVE_TRIGGER_PHRASES: readonly string[] =
  DEFAULT_HEURISTIC_DICTIONARIES.positiveTriggerPhrases;
export const NEGATIVE_BOUNDARY_PHRASES: readonly string[] =
  DEFAULT_HEURISTIC_DICTIONARIES.negativeBoundaryPhrases;
export const EXCLUSIVE_TRIGGER_PHRASES: readonly string[] =
  DEFAULT_HEURISTIC_DICTIONARIES.exclusiveTriggerPhrases;
export const RESTRICTIVE_BOUNDARY_PHRASES: readonly string[] =
  DEFAULT_HEURISTIC_DICTIONARIES.restrictiveBoundaryPhrases;
export const SCOPE_RESTRICTION_PHRASES: readonly string[] =
  DEFAULT_HEURISTIC_DICTIONARIES.scopeRestrictionPhrases;
export const TRIGGER_SCOPE_MARKERS: readonly string[] = Object.freeze([
  ...POSITIVE_TRIGGER_PHRASES,
  ...EXCLUSIVE_TRIGGER_PHRASES,
]);
/** Boundary-criterion markers, so scope restrictions belong here (see `boundaryMarkers`). */
export const BOUNDARY_SCOPE_MARKERS: readonly string[] = Object.freeze([
  ...NEGATIVE_BOUNDARY_PHRASES,
  ...RESTRICTIVE_BOUNDARY_PHRASES,
  ...SCOPE_RESTRICTION_PHRASES,
  ...EXCLUSIVE_TRIGGER_PHRASES,
]);
