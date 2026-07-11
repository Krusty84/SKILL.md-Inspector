import { ACTION_VERBS } from './actionVerbs';
import { VAGUE_TERMS } from './vagueWords';
import { TRIGGER_PHRASES, BOUNDARY_PHRASES } from './triggerPhrases';
import { isKnownAcronym } from './acronyms';
import { IRREGULAR_VERB_FORMS } from './irregularVerbs';

export interface PhraseMatch {
  found: boolean;
  matched?: string;
}

export interface DescriptionAnalysis {
  raw: string;
  trimmed: string;
  length: number;
  wordCount: number;
  /** First ~12 words, lower-cased — used for the front-loaded-intent check. */
  leadingText: string;
  actionVerb: PhraseMatch;
  triggerPhrase: PhraseMatch;
  boundaryPhrase: PhraseMatch;
  concreteArtifact: boolean;
  vagueTerms: string[];
}

/** Domain/artifact hints signalling a concrete subject (brief §7.7 item 3). */
const ARTIFACT_HINTS: readonly string[] = [
  'report',
  'document',
  'file',
  'code',
  'api',
  'table',
  'data',
  'config',
  'configuration',
  'schema',
  'log',
  'test',
  'image',
  'markdown',
  'pdf',
  'csv',
  'json',
  'yaml',
  'diagram',
  'template',
  'manual',
  'spreadsheet',
  'contract',
  'invoice',
  'email',
  'commit',
  'changelog',
  'release',
  'component',
  'query',
  'database',
];

const ACTION_VERB_FORMS: ReadonlySet<string> = buildVerbForms(ACTION_VERBS);

export function analyzeDescription(description: string): DescriptionAnalysis {
  const raw = description ?? '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const tokens = tokenize(lower);

  return {
    raw,
    trimmed,
    length: trimmed.length,
    wordCount: words.length,
    leadingText: words.slice(0, 12).join(' ').toLowerCase(),
    actionVerb: matchVerb(tokens),
    triggerPhrase: matchPhrase(lower, TRIGGER_PHRASES),
    boundaryPhrase: matchPhrase(lower, BOUNDARY_PHRASES),
    concreteArtifact: hasConcreteArtifact(trimmed, tokens),
    vagueTerms: findVagueTerms(lower, tokens),
  };
}

export function hasActionVerb(description: string): PhraseMatch {
  return matchVerb(tokenize(description.toLowerCase()));
}

export function hasTriggerPhrase(description: string): PhraseMatch {
  return matchPhrase(description.toLowerCase(), TRIGGER_PHRASES);
}

export function hasBoundaryPhrase(description: string): PhraseMatch {
  return matchPhrase(description.toLowerCase(), BOUNDARY_PHRASES);
}

export function findVagueTerms(lower: string, tokens: string[] = tokenize(lower)): string[] {
  const found: string[] = [];
  const forms = tokenForms(tokens);
  for (const term of VAGUE_TERMS) {
    if (term.includes(' ')) {
      if (lower.includes(term)) {
        found.push(term);
      }
    } else if (forms.has(term)) {
      found.push(term);
    }
  }
  return found;
}

function matchVerb(tokens: string[]): PhraseMatch {
  for (const token of tokens) {
    if (ACTION_VERB_FORMS.has(token)) {
      return { found: true, matched: token };
    }
  }
  return { found: false };
}

function matchPhrase(lower: string, phrases: readonly string[]): PhraseMatch {
  for (const phrase of phrases) {
    if (lower.includes(phrase)) {
      return { found: true, matched: phrase };
    }
  }
  return { found: false };
}

function hasConcreteArtifact(text: string, tokens: string[]): boolean {
  const forms = tokenForms(tokens);
  if (ARTIFACT_HINTS.some((hint) => forms.has(hint))) {
    return true; // artifact vocabulary
  }
  if (tokens.some((token) => isKnownAcronym(token))) {
    return true; // known acronym / technology (e.g. PDF, SQL, JSON)
  }
  // File extension like ".pdf". The broad "any run of uppercase letters"
  // heuristic is intentionally gone — it flagged words like "IMPORTANT".
  return /\.[a-z0-9]{2,4}\b/i.test(text);
}

export function tokenize(text: string): string[] {
  // Unicode-aware so Cyrillic/accented/CJK words are preserved as tokens.
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}

/** Token set augmented with naive singular forms, for plural-insensitive matching. */
function tokenForms(tokens: string[]): Set<string> {
  const forms = new Set<string>();
  for (const token of tokens) {
    forms.add(token);
    forms.add(singularize(token));
  }
  return forms;
}

function singularize(token: string): string {
  if (token.endsWith('ies') && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }
  if (/(ses|xes|zes|ches|shes)$/.test(token)) {
    return token.slice(0, -2);
  }
  if (token.endsWith('s') && !token.endsWith('ss')) {
    return token.slice(0, -1);
  }
  return token;
}

function buildVerbForms(verbs: readonly string[]): Set<string> {
  const forms = new Set<string>();
  const addForms = (verb: string): void => {
    for (const form of IRREGULAR_VERB_FORMS[verb] ?? inflect(verb)) {
      forms.add(form);
    }
  };
  for (const verb of verbs) {
    addForms(verb);
  }
  // Recognize every irregular verb, including ones not in ACTION_VERBS (write, read).
  for (const verb of Object.keys(IRREGULAR_VERB_FORMS)) {
    addForms(verb);
  }
  return forms;
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
  } else {
    forms.add(`${verb}ing`);
    forms.add(`${verb}ed`);
  }

  // Consonant-doubling for CVC verbs: format -> formatting, debug -> debugged.
  if (/[^aeiou][aeiou][^aeiouwxy]$/.test(verb)) {
    const doubled = verb + verb[verb.length - 1];
    forms.add(`${doubled}ing`);
    forms.add(`${doubled}ed`);
  }

  return [...forms];
}
