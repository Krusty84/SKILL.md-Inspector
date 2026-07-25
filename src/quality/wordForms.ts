/** Shared, configurable word-form normalization for quality and collision analysis. */
import { DEFAULT_HEURISTIC_DICTIONARIES, type StringArrayMap } from './dictionaries';

export interface VerbForms {
  /** Every recognized surface form, including each configured base. */
  forms: Set<string>;
  /** Surface form to configured base verb. */
  toBase: Map<string, string>;
}

const VERB_FORMS_CACHE = new WeakMap<readonly string[], WeakMap<object, VerbForms>>();
const SINGULAR_FORMS_CACHE = new WeakMap<object, ReadonlyMap<string, string>>();
const CAPABILITY_GROUP_CACHE = new WeakMap<object, ReadonlyMap<string, string>>();
const ARTIFACT_GROUP_CACHE = new WeakMap<object, ReadonlyMap<string, string>>();

/**
 * Builds morphology for the active verb registry. Explicit forms win; regular
 * forms are generated only when the base has no explicit mapping.
 */
export function buildVerbForms(
  verbs: readonly string[],
  explicitForms: StringArrayMap = DEFAULT_HEURISTIC_DICTIONARIES.actionVerbForms,
): VerbForms {
  let byMapping = VERB_FORMS_CACHE.get(verbs);
  if (!byMapping) {
    byMapping = new WeakMap<object, VerbForms>();
    VERB_FORMS_CACHE.set(verbs, byMapping);
  }
  const cached = byMapping.get(explicitForms);
  if (cached) return cached;

  const forms = new Set<string>();
  const toBase = new Map<string, string>();
  for (const verb of verbs) {
    const surfaces = Object.prototype.hasOwnProperty.call(explicitForms, verb)
      ? [verb, ...(explicitForms[verb] ?? [])]
      : inflect(verb);
    for (const form of surfaces) {
      forms.add(form);
      if (!toBase.has(form)) toBase.set(form, verb);
    }
  }
  const result = { forms, toBase };
  byMapping.set(explicitForms, result);
  return result;
}

/** Produces base, third-person, gerund, and past forms of a regular verb. */
function inflect(verb: string): string[] {
  const forms = new Set<string>([verb]);
  if (/(s|x|z|ch|sh)$/.test(verb)) forms.add(`${verb}es`);
  else if (/[^aeiou]y$/.test(verb)) forms.add(`${verb.slice(0, -1)}ies`);
  else forms.add(`${verb}s`);

  if (verb.endsWith('e')) {
    forms.add(`${verb.slice(0, -1)}ing`);
    forms.add(`${verb}d`);
  } else if (/[^aeiou]y$/.test(verb)) {
    forms.add(`${verb}ing`);
    forms.add(`${verb.slice(0, -1)}ied`);
  } else {
    forms.add(`${verb}ing`);
    forms.add(`${verb}ed`);
  }
  return [...forms];
}

const DEFAULT_VERB_FORMS = buildVerbForms(
  DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs,
  DEFAULT_HEURISTIC_DICTIONARIES.actionVerbForms,
);

/** Compatibility exports for built-in morphology. */
export const ACTION_VERB_FORMS: ReadonlySet<string> = DEFAULT_VERB_FORMS.forms;
export const VERB_FORM_TO_BASE: ReadonlyMap<string, string> = DEFAULT_VERB_FORMS.toBase;
export const ACTION_VERB_BASES: ReadonlySet<string> = new Set(
  DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs,
);

/** Maps a built-in action-verb surface form to its base; other tokens pass through. */
export function normalizeVerbForm(token: string): string {
  return VERB_FORM_TO_BASE.get(token) ?? token;
}

/** Conservative singularization with configurable irregular base-to-form mappings. */
export function singularize(
  token: string,
  irregularForms: StringArrayMap = DEFAULT_HEURISTIC_DICTIONARIES.irregularSingularForms,
): string {
  const irregular = singularFormMap(irregularForms).get(token);
  if (irregular) return irregular;
  if (token.length <= 3) return token;
  if (/(is|us|ss)$/.test(token)) return token;
  if (token.endsWith('ies') && token.length > 4) return `${token.slice(0, -3)}y`;
  if (/(ches|shes|sses|xes)$/.test(token)) return token.slice(0, -2);
  if (token.endsWith('ses')) return token.slice(0, -1);
  if (token.endsWith('s') && !token.endsWith('ss')) return token.slice(0, -1);
  return token;
}

/** Normalization used by collision content tokens with the supplied dictionary context. */
export function normalizeContentToken(
  token: string,
  dictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string {
  const verb = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms).toBase.get(
    token,
  );
  return singularize(verb ?? token, dictionaries.irregularSingularForms);
}

/**
 * The scope-equivalence group a capability verb belongs to (plan 10 Part B), or
 * the verb itself when it is unmapped — an unknown verb is its own group, never
 * silently merged into another.
 *
 * Collision analysis compares groups rather than verbs because genuine collisions
 * are usually paraphrases: `extract`/`retrieve` and `create`/`generate` name one
 * capability each, and comparing surface verbs scores them as unrelated.
 *
 * Memoized on the dictionary object, like `buildVerbForms` and `singularize`, so
 * the O(n²) collision loop does a map lookup rather than rebuilding the index.
 */
export function capabilityGroupOf(
  base: string,
  dictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string {
  return capabilityGroupMap(dictionaries.capabilitySynonymGroups).get(base) ?? base;
}

/**
 * The scope-equivalence group an artifact term belongs to (plan 10 Part B), or the
 * term itself when unmapped. `spreadsheet`, `xlsx` and `workbook` name one kind of
 * object; comparing surface terms scores two skills that both work on workbooks as
 * operating on different things.
 */
export function artifactGroupOf(
  term: string,
  dictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string {
  return groupIndex(dictionaries.artifactSynonymGroups, ARTIFACT_GROUP_CACHE).get(term) ?? term;
}

/**
 * Verb-to-group index. A verb listed in two groups would make the result depend
 * on object key order, so the first mapping wins and the collision is reported by
 * `capabilitySynonymGroupConflicts` rather than resolved silently.
 */
function capabilityGroupMap(groups: StringArrayMap): ReadonlyMap<string, string> {
  return groupIndex(groups, CAPABILITY_GROUP_CACHE);
}

/** Member-to-group index, memoized on the group table object. */
function groupIndex(
  groups: StringArrayMap,
  cache: WeakMap<object, ReadonlyMap<string, string>>,
): ReadonlyMap<string, string> {
  const cached = cache.get(groups);
  if (cached) return cached;
  const result = new Map<string, string>();
  for (const [group, members] of Object.entries(groups)) {
    for (const member of members) {
      if (!result.has(member)) result.set(member, group);
    }
  }
  cache.set(groups, result);
  return result;
}

/**
 * Members appearing in more than one capability group, as
 * `member -> [group, ...]`. Empty for a well-formed table; a test asserts that,
 * and a user-supplied table is surfaced through the dictionary warnings rather
 * than throwing.
 */
export function synonymGroupConflicts(groups: StringArrayMap): Map<string, string[]> {
  const byMember = new Map<string, string[]>();
  for (const [group, members] of Object.entries(groups)) {
    for (const member of members) {
      byMember.set(member, [...(byMember.get(member) ?? []), group]);
    }
  }
  return new Map([...byMember].filter(([, groups]) => groups.length > 1));
}

function singularFormMap(forms: StringArrayMap): ReadonlyMap<string, string> {
  const cached = SINGULAR_FORMS_CACHE.get(forms);
  if (cached) return cached;
  const result = new Map<string, string>();
  for (const [base, surfaces] of Object.entries(forms)) {
    result.set(base, base);
    for (const surface of surfaces) result.set(surface, base);
  }
  SINGULAR_FORMS_CACHE.set(forms, result);
  return result;
}
