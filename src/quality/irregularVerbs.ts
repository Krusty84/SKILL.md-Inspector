import { DEFAULT_HEURISTIC_DICTIONARIES } from './dictionaries';

/** Compatibility export; includes all built-in action-verb morphology exceptions. */
export const IRREGULAR_VERB_FORMS: Readonly<Record<string, readonly string[]>> =
  DEFAULT_HEURISTIC_DICTIONARIES.actionVerbForms;
