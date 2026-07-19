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
