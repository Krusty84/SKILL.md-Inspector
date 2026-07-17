import { VAGUE_TERMS } from './vagueWords';
import { isKnownAcronym } from './acronyms';
import { ACTION_VERB_FORMS, singularize } from './wordForms';
import { ARTIFACT_HINTS } from './artifacts';
import {
  POSITIVE_TRIGGER_PHRASES,
  NEGATIVE_BOUNDARY_PHRASES,
  EXCLUSIVE_TRIGGER_PHRASES,
  TRIGGER_SCOPE_MARKERS,
  BOUNDARY_SCOPE_MARKERS,
} from './triggerPhrases';

export interface PhraseMatch {
  found: boolean;
  matched?: string;
}

export interface ScopeClauseAnalysis extends PhraseMatch {
  markerFound: boolean;
  contentFound: boolean;
  contentTokens: string[];
  vagueTokens: string[];
  matchedPhrase?: string;
}

export interface FrontLoadedIntentResult {
  found: boolean;
  pattern?: 'capability-first' | 'use-when-first' | 'when-asked-first';
  matchedCapability?: string;
  matchedObject?: string;
}

export interface DescriptionAnalysis {
  raw: string;
  trimmed: string;
  length: number;
  wordCount: number;
  /** First ~12 words, lower-cased — used for the front-loaded-intent check. */
  leadingText: string;
  actionVerb: PhraseMatch;
  positiveTriggerPhrase: PhraseMatch;
  negativeBoundaryPhrase: PhraseMatch;
  exclusiveTriggerPhrase: PhraseMatch;
  concreteArtifact: boolean;
  vagueTerms: string[];
  triggerClause: ScopeClauseAnalysis;
  boundaryClause: ScopeClauseAnalysis;
  frontLoadedIntent: FrontLoadedIntentResult;
}

export function analyzeDescription(description: string): DescriptionAnalysis {
  const raw = description ?? '';
  const trimmed = raw.trim();
  const lower = trimmed.toLowerCase();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const tokens = tokenize(lower);

  const triggerClause = assessScopeClause(trimmed, 'trigger');
  const boundaryClause = assessScopeClause(trimmed, 'boundary');
  return {
    raw,
    trimmed,
    length: trimmed.length,
    wordCount: words.length,
    leadingText: words.slice(0, 12).join(' ').toLowerCase(),
    actionVerb: matchVerb(tokens),
    positiveTriggerPhrase: triggerClause,
    negativeBoundaryPhrase: boundaryClause,
    exclusiveTriggerPhrase: matchPhrase(lower, EXCLUSIVE_TRIGGER_PHRASES),
    concreteArtifact: hasConcreteArtifact(trimmed, tokens),
    vagueTerms: findVagueTerms(lower, tokens),
    triggerClause,
    boundaryClause,
    frontLoadedIntent: analyzeFrontLoadedIntent(trimmed),
  };
}

export function hasActionVerb(description: string): PhraseMatch {
  return matchVerb(tokenize(description.toLowerCase()));
}

/**
 * Stricter front-loaded-intent check: the FIRST token must be an action verb and
 * a concrete artifact/object must follow it in the leading text. A verb anywhere
 * in the first 12 words, or a bare verb with no object, is too weak to pass.
 */
export function isFrontLoaded(leadingText: string): boolean {
  return analyzeFrontLoadedIntent(leadingText).found;
}

/** Filler tokens that can never serve as the "object" of a front-loaded capability. */
const FRONT_LOADED_FILLER = new Set([
  'this', 'skill', 'when', 'asked', 'the', 'user', 'for', 'from', 'with', 'and',
  'help', 'needed', 'needs', 'that', 'them', 'they', 'you', 'your', 'any', 'all',
]);

/** Shared deterministic evidence used by both scoring and diagnostics. */
export function analyzeFrontLoadedIntent(description: string): FrontLoadedIntentResult {
  const leading = description.split(/(?<=[.!?])\s+/).slice(0, 1)[0] ?? '';
  const tokens = tokenize(leading);
  const capability = tokens.find((token) => ACTION_VERB_FORMS.has(token));
  const object = tokens.find(
    (token) =>
      !ACTION_VERB_FORMS.has(token) &&
      token.length > 2 &&
      !FRONT_LOADED_FILLER.has(token) &&
      !VAGUE_TERMS.includes(token),
  );
  const concrete = hasConcreteArtifact(leading, tokens) || Boolean(object && tokens.length >= 5);
  if (/^\s*use (?:this )?(?:skill )?when\b/i.test(leading) && capability && concrete) {
    return { found: true, pattern: 'use-when-first', matchedCapability: capability, matchedObject: object };
  }
  if (/^\s*when asked to\b/i.test(leading) && capability && concrete) {
    return { found: true, pattern: 'when-asked-first', matchedCapability: capability, matchedObject: object };
  }
  if (tokens.length > 0 && ACTION_VERB_FORMS.has(tokens[0]) && concrete) {
    return { found: true, pattern: 'capability-first', matchedCapability: tokens[0], matchedObject: object };
  }
  return { found: false };
}

export function hasPositiveTriggerPhrase(description: string): PhraseMatch {
  const lower = description.toLowerCase();
  const positive = matchPhrase(stripPhrases(lower, [...NEGATIVE_BOUNDARY_PHRASES, ...EXCLUSIVE_TRIGGER_PHRASES]), POSITIVE_TRIGGER_PHRASES);
  if (positive.found) {
    return positive;
  }
  // "only use when ..." is a positive trigger too, even though it also bounds scope.
  return matchPhrase(lower, EXCLUSIVE_TRIGGER_PHRASES);
}

export function hasNegativeBoundaryPhrase(description: string): PhraseMatch {
  return matchPhrase(description.toLowerCase(), NEGATIVE_BOUNDARY_PHRASES);
}

export function hasExclusiveTriggerPhrase(description: string): PhraseMatch {
  return matchPhrase(description.toLowerCase(), EXCLUSIVE_TRIGGER_PHRASES);
}

/**
 * Removes every occurrence of the given phrases (whitespace-flexible, whole
 * words) so that fragments embedded in them — the "use when" inside
 * "do not use when", the "intended for" inside "not intended for" — cannot be
 * matched as standalone positive evidence afterwards.
 */
function stripPhrases(lower: string, phrases: readonly string[]): string {
  let stripped = lower;
  for (const phrase of byLengthDescending(phrases)) {
    stripped = stripped.replace(phraseRegex(phrase, 'gi'), ' ');
  }
  return stripped;
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
    if (phraseRegex(phrase).test(lower)) {
      return { found: true, matched: phrase };
    }
  }
  return { found: false };
}

/** Words carried by scope markers themselves; never counted as clause content. */
const CLAUSE_STOPWORDS = new Set([
  'the', 'a', 'an', 'to', 'when', 'for', 'only', 'user', 'this', 'that',
  'skill', 'of', 'in', 'on', 'with', 'and', 'or', 'is', 'are', 'it', 'its',
  'you', 'your', 'be', 'as', 'by',
]);

/** Low-information tail tokens that do not make a scope clause meaningful. */
const CLAUSE_VAGUE_TOKENS = new Set([
  'needed', 'needs', 'necessary', 'appropriate', 'applicable', 'relevant',
  'suitable', 'tasks', 'task', 'things', 'thing', 'stuff', 'other', 'others',
  'anything', 'everything', 'something', 'general', 'various', 'work',
  'help', 'helping', 'useful', 'asks', 'asked', 'wants', 'requests',
]);

/**
 * Finds a trigger/boundary marker and judges whether the clause after it
 * carries real scope content. Marker vocabulary comes from
 * `triggerPhrases.ts` (single source of truth); negative boundary phrases are
 * stripped from a sentence before trigger matching so a purely negative
 * sentence ("Not intended for X", "Do not use when Y") is never credited as a
 * positive trigger.
 */
export function assessScopeClause(description: string, kind: 'trigger' | 'boundary'): ScopeClauseAnalysis {
  const markers = byLengthDescending(kind === 'trigger' ? TRIGGER_SCOPE_MARKERS : BOUNDARY_SCOPE_MARKERS);
  const sentences = description.split(/(?<=[.!?])\s+|\n/);
  for (const sentence of sentences) {
    let lower = sentence.toLowerCase();
    if (kind === 'trigger') {
      // A negative clause cannot be evidence of a positive trigger.
      lower = stripPhrases(lower, NEGATIVE_BOUNDARY_PHRASES);
    }
    for (const marker of markers) {
      const match = phraseRegex(marker).exec(lower);
      if (!match) continue;
      const tail = lower.slice(match.index + match[0].length);
      const tailTokens = tokenize(tail);
      const contentTokens = tailTokens.filter((token) => !CLAUSE_STOPWORDS.has(token));
      const vagueTokens = contentTokens.filter(
        (token) => CLAUSE_VAGUE_TOKENS.has(token) || VAGUE_TERMS.includes(token),
      );
      const meaningful = contentTokens.filter((token) => !vagueTokens.includes(token));
      // Two substantive tokens, or a single token that names a concrete
      // artifact/technology ("Use for SQL."), count as real scope content.
      const contentFound =
        meaningful.length >= 2 || (meaningful.length === 1 && isConcreteToken(meaningful[0]));
      return { found: true, markerFound: true, contentFound, contentTokens, vagueTokens, matched: marker, matchedPhrase: marker };
    }
  }
  return { found: false, markerFound: false, contentFound: false, contentTokens: [], vagueTokens: [] };
}

function escapeRegex(value: string): string { return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Whole-word, whitespace-flexible matcher for a multi-word phrase. */
function phraseRegex(phrase: string, flags = 'i'): RegExp {
  return new RegExp(`\\b${phrase.split(' ').map(escapeRegex).join('\\s+')}\\b`, flags);
}

/** Longest phrases first, so "when the user needs" wins over "when the user". */
function byLengthDescending(phrases: readonly string[]): string[] {
  return [...phrases].sort((a, b) => b.length - a.length);
}

function isConcreteToken(token: string): boolean {
  const forms = [token, singularize(token)];
  return forms.some((form) => ARTIFACT_HINTS.includes(form)) || isKnownAcronym(token);
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
