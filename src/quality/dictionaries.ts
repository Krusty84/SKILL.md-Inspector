import catalog from './defaultHeuristicDictionaries.json';

export const HEURISTIC_LIST_DICTIONARY_KEYS = [
  'actionVerbs',
  'vagueTerms',
  'artifactHints',
  'lowSignalArtifactTerms',
  'multiWordArtifacts',
  'artifactSupportTerms',
  'acronyms',
  'uppercaseOnlyAcronyms',
  'positiveTriggerPhrases',
  'negativeBoundaryPhrases',
  'exclusiveTriggerPhrases',
  'restrictiveBoundaryPhrases',
  'scopeRestrictionPhrases',
  'overbroadTriggerPhrases',
  'frontLoadedFillerTerms',
  'scopeStopwords',
  'scopeVagueTerms',
  'collisionStopwords',
] as const;

export const HEURISTIC_MAPPING_DICTIONARY_KEYS = [
  'actionVerbForms',
  'irregularSingularForms',
] as const;

export type HeuristicListDictionaryKey = (typeof HEURISTIC_LIST_DICTIONARY_KEYS)[number];
export type HeuristicMappingDictionaryKey = (typeof HEURISTIC_MAPPING_DICTIONARY_KEYS)[number];
export type HeuristicDictionaryKey = HeuristicListDictionaryKey | HeuristicMappingDictionaryKey;
export type StringArrayMap = Readonly<Record<string, readonly string[]>>;

export interface HeuristicDictionaries {
  actionVerbs: readonly string[];
  actionVerbForms: StringArrayMap;
  vagueTerms: readonly string[];
  artifactHints: readonly string[];
  lowSignalArtifactTerms: readonly string[];
  multiWordArtifacts: readonly string[];
  artifactSupportTerms: readonly string[];
  acronyms: readonly string[];
  uppercaseOnlyAcronyms: readonly string[];
  positiveTriggerPhrases: readonly string[];
  negativeBoundaryPhrases: readonly string[];
  exclusiveTriggerPhrases: readonly string[];
  restrictiveBoundaryPhrases: readonly string[];
  scopeRestrictionPhrases: readonly string[];
  overbroadTriggerPhrases: readonly string[];
  frontLoadedFillerTerms: readonly string[];
  scopeStopwords: readonly string[];
  scopeVagueTerms: readonly string[];
  irregularSingularForms: StringArrayMap;
  collisionStopwords: readonly string[];
}

export type HeuristicDictionaryValues = Partial<Record<HeuristicDictionaryKey, unknown>> &
  Record<string, unknown>;

export interface DictionaryWarning {
  path: string;
  message: string;
}

export interface DictionaryResolution {
  dictionaries: HeuristicDictionaries;
  warnings: readonly DictionaryWarning[];
}

const LIST_KEYS = new Set<string>(HEURISTIC_LIST_DICTIONARY_KEYS);
const MAPPING_KEYS = new Set<string>(HEURISTIC_MAPPING_DICTIONARY_KEYS);
const ALL_KEYS = new Set<string>([...LIST_KEYS, ...MAPPING_KEYS]);

export const DEFAULT_HEURISTIC_DICTIONARIES: HeuristicDictionaries = freezeDictionaries(
  catalog as HeuristicDictionaries,
);

export function resolveHeuristicDictionaries(
  values?: HeuristicDictionaryValues,
): HeuristicDictionaries {
  return resolveHeuristicDictionariesWithWarnings(values).dictionaries;
}

export function resolveHeuristicDictionariesWithWarnings(
  values?: HeuristicDictionaryValues,
): DictionaryResolution {
  const warnings: DictionaryWarning[] = [];
  const dictionaries = resolveDictionaryValues(values, warnings);

  return {
    dictionaries,
    warnings: Object.freeze(
      warnings.sort((a, b) => a.path.localeCompare(b.path) || a.message.localeCompare(b.message)),
    ),
  };
}

function resolveDictionaryValues(
  values: HeuristicDictionaryValues | undefined,
  warnings: DictionaryWarning[],
): HeuristicDictionaries {
  const unknownKeys = Object.keys(values ?? {}).filter((key) => !ALL_KEYS.has(key));
  for (const key of unknownKeys) {
    warnings.push({
      path: `heuristics.dictionaryValues.${key}`,
      message: `Unknown heuristic dictionary "${key}".`,
    });
  }

  const resolved: Record<string, readonly string[] | StringArrayMap> = {};
  for (const key of HEURISTIC_LIST_DICTIONARY_KEYS) {
    const value = values?.[key];
    resolved[key] =
      value === undefined
        ? DEFAULT_HEURISTIC_DICTIONARIES[key]
        : normalizeList(
            value,
            `heuristics.dictionaryValues.${key}`,
            warnings,
            DEFAULT_HEURISTIC_DICTIONARIES[key],
          );
  }
  for (const key of HEURISTIC_MAPPING_DICTIONARY_KEYS) {
    const value = values?.[key];
    resolved[key] =
      value === undefined
        ? DEFAULT_HEURISTIC_DICTIONARIES[key]
        : normalizeMapping(
            value,
            `heuristics.dictionaryValues.${key}`,
            warnings,
            DEFAULT_HEURISTIC_DICTIONARIES[key],
          );
  }
  return freezeDictionaries(resolved as unknown as HeuristicDictionaries);
}

function normalizeList(
  value: unknown,
  path: string,
  warnings: DictionaryWarning[],
  fallback: readonly string[],
): readonly string[] {
  if (!Array.isArray(value)) {
    warnings.push({ path, message: 'Expected an array of strings; the fallback value was used.' });
    return fallback;
  }
  const normalized: string[] = [];
  let invalidCount = 0;
  for (const item of value) {
    if (typeof item !== 'string') {
      invalidCount += 1;
      continue;
    }
    const entry = item.trim().toLowerCase();
    if (entry && !normalized.includes(entry)) normalized.push(entry);
  }
  if (invalidCount > 0) {
    warnings.push({
      path,
      message: `Ignored ${invalidCount} non-string ${invalidCount === 1 ? 'entry' : 'entries'}.`,
    });
  }
  return Object.freeze(normalized);
}

function normalizeMapping(
  value: unknown,
  path: string,
  warnings: DictionaryWarning[],
  fallback: StringArrayMap,
): StringArrayMap {
  if (!isRecord(value)) {
    warnings.push({
      path,
      message: 'Expected an object whose values are string arrays; the fallback value was used.',
    });
    return fallback;
  }
  const result: Record<string, readonly string[]> = {};
  for (const [rawKey, rawForms] of Object.entries(value)) {
    const key = rawKey.trim().toLowerCase();
    if (!key) {
      warnings.push({ path, message: 'Ignored an empty mapping key.' });
      continue;
    }
    if (!Array.isArray(rawForms)) {
      warnings.push({
        path: `${path}.${key}`,
        message: 'Expected an array of strings; the mapping entry was ignored.',
      });
      continue;
    }
    const forms = normalizeList(rawForms, `${path}.${key}`, warnings, []);
    result[key] = Object.freeze([...new Set([...(result[key] ?? []), ...forms])]);
  }
  return freezeMapping(result);
}

function freezeDictionaries(value: HeuristicDictionaries): HeuristicDictionaries {
  const result: Record<string, readonly string[] | StringArrayMap> = {};
  for (const key of HEURISTIC_LIST_DICTIONARY_KEYS) {
    result[key] = Object.freeze([...value[key]]);
  }
  for (const key of HEURISTIC_MAPPING_DICTIONARY_KEYS) {
    result[key] = freezeMapping(value[key]);
  }
  return Object.freeze(result) as unknown as HeuristicDictionaries;
}

function freezeMapping(value: StringArrayMap): StringArrayMap {
  return Object.freeze(
    Object.fromEntries(
      Object.entries(value).map(([key, entries]) => [key, Object.freeze([...entries])]),
    ),
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
