/**
 * Structured features extracted from a skill description for collision analysis
 * (brief §13.2): what the skill *does* (capabilities), what it operates *on*
 * (artifacts), and the clauses that say when it should / should not fire. Reuses
 * the quality-layer registries so the vocabulary stays a single source of truth.
 */
import { normalizeContentToken, buildVerbForms } from '../quality/wordForms';
import { analyzeArtifactEvidence } from '../quality/descriptionHeuristics';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  type HeuristicDictionaries,
} from '../quality/dictionaries';
import { escapeRegex, phraseRegex } from '../quality/textMatch';
import { tokenizeContent } from './similarity';

export interface SkillFeatures {
  capabilities: string[];
  artifacts: string[];
  positiveTriggers: string[];
  negativeBoundaries: string[];
}

const TERMINATOR = /[.;!?]/;

/** All four feature lists for one description. */
export function extractFeatures(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): SkillFeatures {
  return {
    capabilities: extractCapabilities(description, dictionaries),
    artifacts: extractArtifacts(description, dictionaries),
    positiveTriggers: extractPositiveTriggers(description, dictionaries),
    negativeBoundaries: extractNegativeBoundaries(description, dictionaries),
  };
}

/** Recognized action verbs, normalized to their base form and de-duplicated (Task 36). */
export function extractCapabilities(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const { forms, toBase } = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms);
  for (const token of contentWords(description)) {
    if (!forms.has(token)) {
      continue;
    }
    // Fold with the registry's own map so custom verbs normalize too.
    const base = toBase.get(token) ?? token;
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}

/** Recognized artifacts/domain terms — single-word hints, acronyms, and multi-word phrases (Task 37). */
export function extractArtifacts(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
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
    const pattern = words
      .map((word, index) => `${escapeRegex(word)}${index === words.length - 1 ? 's?' : ''}`)
      .join('\\s+');
    if (new RegExp(`\\b${pattern}\\b`, 'i').test(description)) add(phrase);
  }
  for (const token of contentWords(description)) {
    const normalized = normalizeContentToken(token, dictionaries);
    if (dictionaries.artifactHints.includes(normalized) && evidence.found) add(normalized);
  }
  return result;
}

/**
 * Markers whose clause names a scope the skill *excludes*. `scopeRestrictionPhrases`
 * ("only for X", "limited to X") are deliberately absent: they name the skill's own
 * scope, so treating them as exclusions inverts their meaning and damps the
 * composite of two skills that both say "Only for PDF files" — i.e. of a true
 * positive (plan 7 Part A).
 *
 * The quality layer scores those same phrases as boundary markers, which is
 * correct there and must not be "unified" with this list — see the note on
 * `BOUNDARY_MARKER_KEYS` in `quality/descriptionHeuristics.ts`.
 */
function exclusionMarkers(dictionaries: HeuristicDictionaries): string[] {
  return [...dictionaries.negativeBoundaryPhrases, ...dictionaries.restrictiveBoundaryPhrases];
}

/**
 * Text following positive trigger markers ("Use when…", "Use for…", "Only for…"),
 * in document order (Task 38). Exclusion clauses are removed first so their
 * embedded "use when" fragment is never captured as a positive trigger.
 *
 * `scopeRestrictionPhrases` count as positive-trigger markers here: a skill that
 * says "Only for PDF files" has told you its trigger scope (plan 7 Part A).
 *
 * Deliberately list-based: the quality layer's `assessScopeClause` additionally
 * recognizes a marker *grammar* ("should be used when…", "designed for…"), but
 * collision clause extraction stays on the configurable dictionary lists so the
 * workspace-level trigger/boundary vocabulary remains stable, user-editable, and
 * cheap over many skills. Grammar-only phrasings simply contribute their tokens
 * to the domain sets instead of a dedicated clause.
 */
export function extractPositiveTriggers(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  const withoutBoundaries = stripClauses(description, exclusionMarkers(dictionaries));
  return extractClauses(withoutBoundaries, [
    ...dictionaries.positiveTriggerPhrases,
    ...dictionaries.exclusiveTriggerPhrases,
    ...dictionaries.scopeRestrictionPhrases,
  ]);
}

/** Text following negative boundary markers ("Do not use for…") (Task 39). */
export function extractNegativeBoundaries(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  return extractClauses(description, exclusionMarkers(dictionaries));
}

/** One description's domain and negative-boundary token sets, precomputed once. */
export interface BoundaryFeatures {
  /** Normalized content tokens with negative boundary clauses removed. */
  domain: Set<string>;
  /** Normalized content tokens taken only from the negative boundary clauses. */
  boundary: Set<string>;
}

/**
 * Extracts one description's boundary features in a single pass (Task 40, P3
 * pre-pass). Hoisting this out of the O(n²) collision loop turns the per-pair
 * cost from repeated regex clause-stripping into a set intersection.
 */
export function boundaryFeatures(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): BoundaryFeatures {
  return {
    domain: domainTokens(description, dictionaries),
    boundary: boundaryTokens(description, dictionaries),
  };
}

/**
 * How strongly two skills' scopes are separated by their negative boundaries
 * (0..1, Task 40), computed from precomputed features: the mean fraction of each
 * skill's positive domain that the other skill explicitly excludes.
 */
export function boundarySeparationOf(a: BoundaryFeatures, b: BoundaryFeatures): number {
  return 0.5 * fractionExcluded(a.domain, b.boundary) + 0.5 * fractionExcluded(b.domain, a.boundary);
}

/**
 * How strongly two skills' scopes are separated by their negative boundaries
 * (0..1, Task 40): the mean fraction of each skill's positive domain that the
 * other skill explicitly excludes. Mutually-exclusive scopes approach 1.
 */
export function boundarySeparation(
  a: string,
  b: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): number {
  return boundarySeparationOf(
    boundaryFeatures(a, dictionaries),
    boundaryFeatures(b, dictionaries),
  );
}

/** Lower-cased alphanumeric word tokens (keeps short tokens like acronyms). */
function contentWords(text: string): string[] {
  return text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
}

/**
 * Normalized content tokens with exclusion clauses removed. An "only for X"
 * clause is *not* stripped, so its tokens stay in the domain set — which is what
 * makes two "Only for PDF files" skills read as overlapping (plan 7 Part A).
 */
function domainTokens(description: string, dictionaries: HeuristicDictionaries): Set<string> {
  const withoutBoundaries = stripClauses(description, exclusionMarkers(dictionaries));
  return new Set(
    tokenizeContent(withoutBoundaries, dictionaries.collisionStopwords).map((token) =>
      normalizeContentToken(token, dictionaries),
    ),
  );
}

/** Normalized content tokens taken only from the exclusion clauses. */
function boundaryTokens(description: string, dictionaries: HeuristicDictionaries): Set<string> {
  const clauses = extractClauses(description, exclusionMarkers(dictionaries)).join(' ');
  return new Set(
    tokenizeContent(clauses, dictionaries.collisionStopwords).map((token) =>
      normalizeContentToken(token, dictionaries),
    ),
  );
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

/**
 * Clause text after each marker occurrence, up to the next sentence terminator,
 * in order. Markers match on word boundaries only — "do not use for" must not
 * fire inside "do not use formatting".
 */
function extractClauses(text: string, markers: readonly string[]): string[] {
  const found: { at: number; text: string }[] = [];
  for (const marker of markers) {
    for (const match of text.matchAll(phraseRegex(marker, 'gi'))) {
      const at = match.index ?? 0;
      const clause = clauseAfter(text, at + match[0].length);
      if (clause) {
        found.push({ at, text: clause });
      }
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
    const re = phraseRegex(marker, 'i');
    let match: RegExpExecArray | null;
    // Non-global regex: each exec rescans from the start of the shrunken text,
    // and every iteration removes at least the marker, so this terminates.
    while ((match = re.exec(result)) !== null) {
      const start = match.index;
      const after = result.slice(start + match[0].length);
      const term = after.search(TERMINATOR);
      const end = term === -1 ? result.length : start + match[0].length + term;
      result = result.slice(0, start) + result.slice(end);
    }
  }
  return result;
}

function clauseAfter(text: string, start: number): string {
  const rest = text.slice(start);
  const term = rest.search(TERMINATOR);
  return (term === -1 ? rest : rest.slice(0, term)).trim();
}
