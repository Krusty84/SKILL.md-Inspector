/**
 * Word-form normalization shared by the description heuristics and the workspace
 * collision detector: action-verb inflection (base ⇄ surface forms) and a
 * conservative singularizer. Kept as a leaf module (it imports only the verb
 * registries) so both the quality and workspace layers can reuse it without a
 * circular dependency.
 */
import { ACTION_VERBS } from './actionVerbs';
import { IRREGULAR_VERB_FORMS } from './irregularVerbs';

/** Action-registry verbs whose final consonant doubles before -ing/-ed. */
const CVC_DOUBLING_VERBS = new Set(['format', 'debug']);

interface VerbForms {
  /** Every recognized surface form (base, 3rd-person, gerund, past), incl. irregulars. */
  forms: Set<string>;
  /** Surface form → base verb. */
  toBase: Map<string, string>;
}

const VERB_FORMS_CACHE = new WeakMap<readonly string[], VerbForms>();

export function buildVerbForms(verbs: readonly string[]): VerbForms {
  const cached = VERB_FORMS_CACHE.get(verbs);
  if (cached) {
    return cached;
  }
  const forms = new Set<string>();
  const toBase = new Map<string, string>();
  const addForms = (base: string, surfaces: readonly string[]): void => {
    for (const form of surfaces) {
      forms.add(form);
      if (!toBase.has(form)) {
        toBase.set(form, base);
      }
    }
  };
  // Only the verbs actually in the registry are expanded — a profile that
  // replaces or removes verbs is authoritative, irregular ones included.
  for (const verb of verbs) {
    addForms(verb, IRREGULAR_VERB_FORMS[verb] ?? inflect(verb));
  }
  const result = { forms, toBase };
  VERB_FORMS_CACHE.set(verbs, result);
  return result;
}

/** Produces base, third-person, gerund, and past forms of a regular verb. */
function inflect(verb: string): string[] {
  const forms = new Set<string>([verb]);

  if (/(s|x|z|ch|sh)$/.test(verb)) {
    forms.add(`${verb}es`);
  } else if (/[^aeiou]y$/.test(verb)) {
    forms.add(`${verb.slice(0, -1)}ies`);
  } else {
    forms.add(`${verb}s`);
  }

  if (verb.endsWith('e')) {
    forms.add(`${verb.slice(0, -1)}ing`);
    forms.add(`${verb}d`);
  } else if (/[^aeiou]y$/.test(verb)) {
    forms.add(`${verb}ing`);
    forms.add(`${verb.slice(0, -1)}ied`);
  } else if (CVC_DOUBLING_VERBS.has(verb) && /[^aeiou][aeiou][^aeiouwxy]$/.test(verb)) {
    // Consonant-doubling only for the known CVC action verbs that need it. A blind
    // CVC rule wrongly doubles multisyllabic verbs (render -> renderring); prefer
    // explicit membership over broad linguistic generation. The doubled forms
    // replace the plain ones: "formating"/"formated" are misspellings, not forms.
    const doubled = verb + verb[verb.length - 1];
    forms.add(`${doubled}ing`);
    forms.add(`${doubled}ed`);
  } else {
    forms.add(`${verb}ing`);
    forms.add(`${verb}ed`);
  }

  return [...forms];
}

const VERB_FORMS = buildVerbForms(ACTION_VERBS);

/** All recognized action-verb surface forms (membership test). */
export const ACTION_VERB_FORMS: ReadonlySet<string> = VERB_FORMS.forms;

/** Surface form → base verb, for verb-form normalization. */
export const VERB_FORM_TO_BASE: ReadonlyMap<string, string> = VERB_FORMS.toBase;

/** Base action verbs (the registry itself), for capability filtering. */
export const ACTION_VERB_BASES: ReadonlySet<string> = new Set(ACTION_VERBS);

/** Maps a known action-verb surface form to its base verb; other tokens pass through. */
export function normalizeVerbForm(token: string): string {
  return VERB_FORM_TO_BASE.get(token) ?? token;
}

/**
 * Conservative singularizer. Only reduces endings it is confident are regular
 * plurals; non-plural `-s` endings (analysis, status, class) and short words are
 * left alone so it never invents a stem like `analysi`.
 */
/** Irregular plurals the suffix rules below would mangle (analyses → "analyse"). */
const IRREGULAR_SINGULARS: Readonly<Record<string, string>> = {
  analyses: 'analysis',
  crises: 'crisis',
  theses: 'thesis',
  indices: 'index',
  matrices: 'matrix',
  series: 'series',
  movies: 'movie',
  buses: 'bus',
};

export function singularize(token: string): string {
  const irregular = IRREGULAR_SINGULARS[token];
  if (irregular) {
    return irregular;
  }
  if (token.length <= 3) {
    return token; // gas, bus, is
  }
  if (/(is|us|ss)$/.test(token)) {
    return token; // analysis, status, focus, class
  }
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`; // companies -> company (but not ties -> ty)
  }
  if (/(ches|shes|sses|xes)$/.test(token)) {
    return token.slice(0, -2); // batches->batch, dishes->dish, classes->class, boxes->box
  }
  if (token.endsWith('ses')) {
    return token.slice(0, -1); // cases->case, databases->database, releases->release
  }
  if (token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1); // reports->report, files->file, sizes->size
  }
  return token;
}

/**
 * Normalization applied to collision content tokens: fold a known verb form to
 * its base first (so 3rd-person forms ending in a sibilant are not mangled by the
 * singularizer), then singularize the remainder for plural-insensitive matching.
 */
export function normalizeContentToken(token: string): string {
  return singularize(normalizeVerbForm(token));
}
