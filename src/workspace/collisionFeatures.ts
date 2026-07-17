/**
 * Structured features extracted from a skill description for collision analysis
 * (brief §13.2): what the skill *does* (capabilities), what it operates *on*
 * (artifacts), and the clauses that say when it should / should not fire. Reuses
 * the quality-layer registries so the vocabulary stays a single source of truth.
 */
import { normalizeVerbForm, normalizeContentToken, buildVerbForms } from '../quality/wordForms';
import { analyzeArtifactEvidence } from '../quality/descriptionHeuristics';
import { DEFAULT_HEURISTIC_DICTIONARIES, type HeuristicDictionaries } from '../quality/dictionaries';
import { tokenizeContent } from './similarity';

export interface SkillFeatures {
  capabilities: string[];
  artifacts: string[];
  positiveTriggers: string[];
  negativeBoundaries: string[];
}

const TERMINATOR = /[.;!?]/;

/** All four feature lists for one description. */
export function extractFeatures(description: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): SkillFeatures {
  return {
    capabilities: extractCapabilities(description, dictionaries),
    artifacts: extractArtifacts(description, dictionaries),
    positiveTriggers: extractPositiveTriggers(description, dictionaries),
    negativeBoundaries: extractNegativeBoundaries(description, dictionaries),
  };
}

/** Recognized action verbs, normalized to their base form and de-duplicated (Task 36). */
export function extractCapabilities(description: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  for (const token of contentWords(description)) {
    const base = normalizeVerbForm(token);
    if (buildVerbForms(dictionaries.actionVerbs).forms.has(token) && !seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}

/** Recognized artifacts/domain terms — single-word hints, acronyms, and multi-word phrases (Task 37). */
export function extractArtifacts(description: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const add = (value: string): void => {
    if (!seen.has(value)) {
      seen.add(value);
      result.push(value);
    }
  };
  const evidence = analyzeArtifactEvidence(description, dictionaries);
  for (const term of evidence.matchedTerms) add(term);
  for (const phrase of dictionaries.multiWordArtifacts) {
    const words = phrase.split(' ');
    const pattern = words.map((word, index) => `${word}${index === words.length - 1 ? 's?' : ''}`).join('\\s+');
    if (new RegExp(`\\b${pattern}\\b`, 'i').test(description)) add(phrase);
  }
  for (const token of contentWords(description)) {
    const normalized = normalizeContentToken(token);
    if (dictionaries.artifactHints.includes(normalized) && evidence.found) add(normalized);
  }
  return result;
}

/**
 * Text following positive trigger markers ("Use when…", "Use for…"), in document
 * order (Task 38). Negative boundary clauses are removed first so their embedded
 * "use when" fragment is never captured as a positive trigger.
 */
export function extractPositiveTriggers(description: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): string[] {
  const withoutBoundaries = stripClauses(description, dictionaries.negativeBoundaryPhrases);
  return extractClauses(withoutBoundaries, [...dictionaries.positiveTriggerPhrases, ...dictionaries.exclusiveTriggerPhrases]);
}

/** Text following negative boundary markers ("Do not use for…") (Task 39). */
export function extractNegativeBoundaries(description: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): string[] {
  return extractClauses(description, dictionaries.negativeBoundaryPhrases);
}

/**
 * How strongly two skills' scopes are separated by their negative boundaries
 * (0..1, Task 40): the mean fraction of each skill's positive domain that the
 * other skill explicitly excludes. Mutually-exclusive scopes approach 1.
 */
export function boundarySeparation(a: string, b: string, dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES): number {
  const excludedA = fractionExcluded(domainTokens(a, dictionaries), boundaryTokens(b, dictionaries));
  const excludedB = fractionExcluded(domainTokens(b, dictionaries), boundaryTokens(a, dictionaries));
  return 0.5 * excludedA + 0.5 * excludedB;
}

/** Lower-cased alphanumeric word tokens (keeps short tokens like acronyms). */
function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/** Normalized content tokens with negative boundary clauses removed. */
function domainTokens(description: string, dictionaries: HeuristicDictionaries): Set<string> {
  const withoutBoundaries = stripClauses(description, dictionaries.negativeBoundaryPhrases);
  return new Set(tokenizeContent(withoutBoundaries).map(normalizeContentToken));
}

/** Normalized content tokens taken only from the negative boundary clauses. */
function boundaryTokens(description: string, dictionaries: HeuristicDictionaries): Set<string> {
  const clauses = extractClauses(description, dictionaries.negativeBoundaryPhrases).join(' ');
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
