import { VAGUE_TERMS } from './vagueWords';
import { isKnownAcronym } from './acronyms';
import { ACTION_VERB_FORMS, singularize } from './wordForms';
import { ARTIFACT_HINTS } from './artifacts';
import {
  POSITIVE_TRIGGER_PHRASES,
  NEGATIVE_BOUNDARY_PHRASES,
  EXCLUSIVE_TRIGGER_PHRASES,
} from './triggerPhrases';

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
  positiveTriggerPhrase: PhraseMatch;
  negativeBoundaryPhrase: PhraseMatch;
  exclusiveTriggerPhrase: PhraseMatch;
  concreteArtifact: boolean;
  vagueTerms: string[];
}

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
    positiveTriggerPhrase: hasPositiveTriggerPhrase(lower),
    negativeBoundaryPhrase: hasNegativeBoundaryPhrase(lower),
    exclusiveTriggerPhrase: hasExclusiveTriggerPhrase(lower),
    concreteArtifact: hasConcreteArtifact(trimmed, tokens),
    vagueTerms: findVagueTerms(lower, tokens),
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
  const tokens = tokenize(leadingText);
  if (tokens.length === 0 || !ACTION_VERB_FORMS.has(tokens[0])) {
    return false;
  }
  return hasConcreteArtifact(leadingText, tokens.slice(1));
}

export function hasPositiveTriggerPhrase(description: string): PhraseMatch {
  const lower = description.toLowerCase();
  const positive = matchPhrase(stripBoundaryPhrases(lower), POSITIVE_TRIGGER_PHRASES);
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
 * Removes negative and exclusive boundary phrases from the text so that the
 * "use when" fragment embedded in "do not use when" / "only use when" is not
 * counted as a standalone positive trigger.
 */
function stripBoundaryPhrases(lower: string): string {
  let stripped = lower;
  for (const phrase of [...NEGATIVE_BOUNDARY_PHRASES, ...EXCLUSIVE_TRIGGER_PHRASES]) {
    stripped = stripped.split(phrase).join(' ');
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
