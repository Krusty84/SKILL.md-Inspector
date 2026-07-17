import { ACTION_VERBS } from './actionVerbs';
import { ARTIFACT_HINTS, MULTI_WORD_ARTIFACTS } from './artifacts';
import { KNOWN_ACRONYMS } from './acronyms';
import { VAGUE_TERMS } from './vagueWords';
import { POSITIVE_TRIGGER_PHRASES, NEGATIVE_BOUNDARY_PHRASES, EXCLUSIVE_TRIGGER_PHRASES } from './triggerPhrases';

export interface DictionaryOverride { add?: unknown; remove?: unknown; replace?: unknown; }
export type HeuristicDictionaryKey = keyof HeuristicDictionaries;
export type HeuristicDictionaryOverrides = Partial<Record<HeuristicDictionaryKey, DictionaryOverride>> & Record<string, DictionaryOverride | undefined>;
export interface DictionaryResolution { dictionaries: HeuristicDictionaries; warnings: string[]; }
export interface HeuristicDictionaries {
  actionVerbs: readonly string[]; vagueTerms: readonly string[]; artifactHints: readonly string[];
  lowSignalArtifactTerms: readonly string[]; multiWordArtifacts: readonly string[]; acronyms: readonly string[];
  positiveTriggerPhrases: readonly string[]; negativeBoundaryPhrases: readonly string[]; exclusiveTriggerPhrases: readonly string[];
}
export const DEFAULT_HEURISTIC_DICTIONARIES: HeuristicDictionaries = Object.freeze({
  actionVerbs: ACTION_VERBS, vagueTerms: VAGUE_TERMS, artifactHints: ARTIFACT_HINTS,
  lowSignalArtifactTerms: ['file', 'data', 'code', 'document', 'content', 'information'],
  multiWordArtifacts: MULTI_WORD_ARTIFACTS, acronyms: [...KNOWN_ACRONYMS],
  positiveTriggerPhrases: POSITIVE_TRIGGER_PHRASES, negativeBoundaryPhrases: NEGATIVE_BOUNDARY_PHRASES,
  exclusiveTriggerPhrases: EXCLUSIVE_TRIGGER_PHRASES,
});
export function resolveHeuristicDictionaries(overrides?: HeuristicDictionaryOverrides): HeuristicDictionaries {
  return resolveHeuristicDictionariesWithWarnings(overrides).dictionaries;
}
export function resolveHeuristicDictionariesWithWarnings(overrides?: HeuristicDictionaryOverrides): DictionaryResolution {
  const supported = new Set<keyof HeuristicDictionaries>(['actionVerbs', 'vagueTerms', 'artifactHints', 'lowSignalArtifactTerms', 'multiWordArtifacts', 'acronyms', 'positiveTriggerPhrases', 'negativeBoundaryPhrases', 'exclusiveTriggerPhrases']);
  const warnings: string[] = [];
  for (const [key, value] of Object.entries(overrides ?? {})) {
    if (!supported.has(key as keyof HeuristicDictionaries)) warnings.push(`Unknown heuristic dictionary "${key}".`);
    else if (value && ['add', 'remove', 'replace'].some((field) => field in value && !Array.isArray(value[field as keyof DictionaryOverride]))) warnings.push(`Dictionary "${key}" has a malformed override value.`);
  }
  const resolve = (key: keyof HeuristicDictionaries): readonly string[] => {
    const edit = overrides?.[key]; const base = edit && Array.isArray(edit.replace) ? edit.replace : DEFAULT_HEURISTIC_DICTIONARIES[key];
    const remove = new Set(entries(edit?.remove));
    return Object.freeze([...new Set([...entries(base).filter((entry) => !remove.has(entry)), ...entries(edit?.add)])]);
  };
  const dictionaries = Object.freeze({ actionVerbs: resolve('actionVerbs'), vagueTerms: resolve('vagueTerms'), artifactHints: resolve('artifactHints'), lowSignalArtifactTerms: resolve('lowSignalArtifactTerms'), multiWordArtifacts: resolve('multiWordArtifacts'), acronyms: resolve('acronyms'), positiveTriggerPhrases: resolve('positiveTriggerPhrases'), negativeBoundaryPhrases: resolve('negativeBoundaryPhrases'), exclusiveTriggerPhrases: resolve('exclusiveTriggerPhrases') });
  return { dictionaries, warnings: warnings.sort() };
}
function entries(value: unknown): string[] { return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string').map((item) => item.trim().toLowerCase()).filter(Boolean) : []; }
