/**
 * Structured features extracted from a skill description for collision analysis
 * (brief §13.2): what the skill *does* (capabilities), what it operates *on*
 * (artifacts), and the clauses that say when it should / should not fire. Reuses
 * the quality-layer registries so the vocabulary stays a single source of truth.
 */
import { normalizeVerbForm, normalizeContentToken, ACTION_VERB_BASES } from '../quality/wordForms';
import { ARTIFACT_HINTS, MULTI_WORD_ARTIFACTS } from '../quality/artifacts';
import { isKnownAcronym } from '../quality/acronyms';
import {
  POSITIVE_TRIGGER_PHRASES,
  NEGATIVE_BOUNDARY_PHRASES,
  EXCLUSIVE_TRIGGER_PHRASES,
} from '../quality/triggerPhrases';
import { tokenizeContent } from './similarity';

export interface SkillFeatures {
  capabilities: string[];
  artifacts: string[];
  positiveTriggers: string[];
  negativeBoundaries: string[];
}

const ARTIFACT_HINT_SET = new Set(ARTIFACT_HINTS);
const POSITIVE_MARKERS = [...POSITIVE_TRIGGER_PHRASES, ...EXCLUSIVE_TRIGGER_PHRASES];
const TERMINATOR = /[.;!?]/;

/** All four feature lists for one description. */
export function extractFeatures(description: string): SkillFeatures {
  return {
    capabilities: extractCapabilities(description),
    artifacts: extractArtifacts(description),
    positiveTriggers: extractPositiveTriggers(description),
    negativeBoundaries: extractNegativeBoundaries(description),
  };
}

/** Recognized action verbs, normalized to their base form and de-duplicated (Task 36). */
export function extractCapabilities(description: string): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of contentWords(description)) {
    const base = normalizeVerbForm(token);
    if (ACTION_VERB_BASES.has(base) && !seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}

/** Recognized artifacts/domain terms — single-word hints, acronyms, and multi-word phrases (Task 37). */
export function extractArtifacts(description: string): string[] {
  const lower = description.toLowerCase();
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  };
  for (const phrase of MULTI_WORD_ARTIFACTS) {
    if (lower.includes(phrase)) {
      add(phrase);
    }
  }
  for (const token of contentWords(description)) {
    const normalized = normalizeContentToken(token);
    if (ARTIFACT_HINT_SET.has(normalized) || isKnownAcronym(normalized)) {
      add(normalized);
    }
  }
  return result;
}

/**
 * Text following positive trigger markers ("Use when…", "Use for…"), in document
 * order (Task 38). Negative boundary clauses are removed first so their embedded
 * "use when" fragment is never captured as a positive trigger.
 */
export function extractPositiveTriggers(description: string): string[] {
  const withoutBoundaries = stripClauses(description, NEGATIVE_BOUNDARY_PHRASES);
  return extractClauses(withoutBoundaries, POSITIVE_MARKERS);
}

/** Text following negative boundary markers ("Do not use for…") (Task 39). */
export function extractNegativeBoundaries(description: string): string[] {
  return extractClauses(description, NEGATIVE_BOUNDARY_PHRASES);
}

/**
 * How strongly two skills' scopes are separated by their negative boundaries
 * (0..1, Task 40): the mean fraction of each skill's positive domain that the
 * other skill explicitly excludes. Mutually-exclusive scopes approach 1.
 */
export function boundarySeparation(a: string, b: string): number {
  const excludedA = fractionExcluded(domainTokens(a), boundaryTokens(b));
  const excludedB = fractionExcluded(domainTokens(b), boundaryTokens(a));
  return 0.5 * excludedA + 0.5 * excludedB;
}

/** Lower-cased alphanumeric word tokens (keeps short tokens like acronyms). */
function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Normalized content tokens with negative boundary clauses removed. */
function domainTokens(description: string): Set<string> {
  const withoutBoundaries = stripClauses(description, NEGATIVE_BOUNDARY_PHRASES);
  return new Set(tokenizeContent(withoutBoundaries).map(normalizeContentToken));
}

/** Normalized content tokens taken only from the negative boundary clauses. */
function boundaryTokens(description: string): Set<string> {
  const clauses = extractClauses(description, NEGATIVE_BOUNDARY_PHRASES).join(' ');
  return new Set(tokenizeContent(clauses).map(normalizeContentToken));
}

function fractionExcluded(domain: Set<string>, boundary: Set<string>): number {
  if (domain.size === 0) {
    return 0;
  }
  let hits = 0;
  for (const token of domain) {
    if (boundary.has(token)) {
      hits += 1;
    }
  }
  return hits / domain.size;
}

/** Clause text after each marker occurrence, up to the next sentence terminator, in order. */
function extractClauses(text: string, markers: readonly string[]): string[] {
  const lower = text.toLowerCase();
  const found: { at: number; text: string }[] = [];
  for (const marker of markers) {
    let idx = lower.indexOf(marker);
    while (idx !== -1) {
      const clause = clauseAfter(text, idx + marker.length);
      if (clause) {
        found.push({ at: idx, text: clause });
      }
      idx = lower.indexOf(marker, idx + marker.length);
    }
  }
  const seen = new Set<string>();
  return found
    .sort((x, y) => x.at - y.at)
    .map((c) => c.text)
    .filter((clause) => (seen.has(clause) ? false : (seen.add(clause), true)));
}

/** Removes every marker clause (marker → next terminator) from the text. */
function stripClauses(text: string, markers: readonly string[]): string {
  let result = text;
  for (const marker of markers) {
    let idx = result.toLowerCase().indexOf(marker);
    while (idx !== -1) {
      const after = result.slice(idx + marker.length);
      const term = after.search(TERMINATOR);
      const end = term === -1 ? result.length : idx + marker.length + term;
      result = result.slice(0, idx) + result.slice(end);
      idx = result.toLowerCase().indexOf(marker);
    }
  }
  return result;
}

function clauseAfter(text: string, start: number): string {
  const rest = text.slice(start);
  const term = rest.search(TERMINATOR);
  return (term === -1 ? rest : rest.slice(0, term)).trim();
}
