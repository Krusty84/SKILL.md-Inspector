/**
 * Structured features extracted from a skill description for collision analysis
 * (brief §13.2): what the skill *does* (capabilities), what it operates *on*
 * (artifacts), and the clauses that say when it should / should not fire. Reuses
 * the quality-layer registries so the vocabulary stays a single source of truth.
 */
import {
  normalizeContentToken,
  buildVerbForms,
  capabilityGroupOf,
  artifactGroupOf,
} from '../quality/wordForms';
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
  const dualRole = new Set(dictionaries.dualRoleTerms);
  for (const occurrence of wordOccurrences(description)) {
    if (!forms.has(occurrence.token)) {
      continue;
    }
    // Fold with the registry's own map so custom verbs normalize too.
    const base = toBase.get(occurrence.token) ?? occurrence.token;
    // `test`, `draft`, `patch`… are both a verb and an artifact. Without this
    // guard the noun won by extraction order: "Create unit tests for a source
    // file" yielded capabilities ["create", "test"], putting the skill in two
    // capability groups and halving its overlap with a genuine paraphrase.
    if (dualRole.has(base) && !occurrence.inVerbPosition) {
      continue;
    }
    if (!seen.has(base)) {
      seen.add(base);
      result.push(base);
    }
  }
  return result;
}

/** Words that put the token after them in a verb position. */
const VERB_POSITION_LEAD_INS = new Set(['to', 'and', 'or', 'then', 'can', 'will', 'should', 'must']);

interface WordOccurrence {
  token: string;
  /**
   * True when the token opens a sentence or follows a lead-in that only a verb
   * can follow ("…asks **to** test a module"). Nouns are introduced by a
   * determiner or a modifier instead ("unit **tests**"), which is the signal
   * that separates the two readings of a dual-role term.
   */
  inVerbPosition: boolean;
}

/** Lower-cased word tokens with the verb/noun position of each. */
function wordOccurrences(text: string): WordOccurrence[] {
  const normalized = text.normalize('NFC');
  const occurrences: WordOccurrence[] = [];
  let previousToken: string | undefined;
  let previousEnd = 0;
  for (const match of normalized.matchAll(WORD_RE)) {
    const start = match.index ?? 0;
    const gap = normalized.slice(previousEnd, start);
    const startsSentence = previousToken === undefined || /[.!?:;\n]/.test(gap);
    occurrences.push({
      token: match[0].toLowerCase(),
      inVerbPosition:
        startsSentence || (previousToken !== undefined && VERB_POSITION_LEAD_INS.has(previousToken)),
    });
    previousToken = match[0].toLowerCase();
    previousEnd = start + match[0].length;
  }
  return occurrences;
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
  const uppercaseOnly = new Set(dictionaries.uppercaseOnlyAcronyms);
  // Set rather than Array.includes: this runs per token against a list that plan 9
  // grew to 256 entries, inside the per-skill pre-pass.
  const hints = artifactHintSet(dictionaries.artifactHints);
  for (const token of contentWords(description)) {
    const normalized = normalizeContentToken(token, dictionaries);
    // Honor the uppercase-only guard here too. Without it this loop re-admitted
    // exactly the terms `analyzeArtifactEvidence` had filtered out, so "follow the
    // documented steps" yielded the CAD format `step` and two skills sharing house
    // template prose read as sharing an artifact (plan 10).
    if (
      uppercaseOnly.has(normalized) &&
      !acronymMatches(description, normalized, dictionaries.uppercaseOnlyAcronyms)
    ) {
      continue;
    }
    if (hints.has(normalized) && evidence.found) add(normalized);
  }
  return result;
}

const HINT_SET_CACHE = new WeakMap<readonly string[], ReadonlySet<string>>();

/** Memoized set view of `artifactHints`, keyed on the dictionary's own array. */
function artifactHintSet(hints: readonly string[]): ReadonlySet<string> {
  const cached = HINT_SET_CACHE.get(hints);
  if (cached) return cached;
  const set = new Set(hints);
  HINT_SET_CACHE.set(hints, set);
  return set;
}

/** True when `term` appears in `text` with the casing its uppercase-only rule requires. */
function acronymMatches(
  text: string,
  term: string,
  uppercaseOnlyAcronyms: readonly string[],
): boolean {
  const uppercaseOnly = new Set(uppercaseOnlyAcronyms);
  const matches = [...text.matchAll(new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi'))];
  return matches.some(
    (match) => !uppercaseOnly.has(term.toLowerCase()) || match[0] === match[0].toUpperCase(),
  );
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
  /** Capability groups the description states (plan 10 Part A). */
  capabilityGroups: Set<string>;
  /** Artifacts/domain terms the description names (plan 10 Part A). */
  artifacts: Set<string>;
  /** `artifacts` plus the content tokens of the skill's own trigger clauses. */
  scopeObjects: Set<string>;
}

/** Scope comparison of two skills, with the evidence behind it (plan 10 Part A). */
export interface ScopeOverlap {
  /** Composite scope agreement in 0..1. */
  value: number;
  artifactOverlap: number;
  capabilityOverlap: number;
  /**
   * True when one side stated no capability or no artifact at all, so `value` is
   * an evidence-gap estimate rather than a comparison. The caller lowers
   * confidence rather than presenting it as a measurement.
   */
  degenerate: boolean;
}

/**
 * How much two skills' *scopes* overlap: do they do the same kind of thing to the
 * same kind of object (plan 10 Part A)?
 *
 * This is the metric the other four are not. Jaccard, cosine, the char n-gram and
 * name similarity all measure lexical surface overlap, but genuine collisions are
 * usually paraphrases with little shared text, while two skills that merely share
 * an artifact share a great deal of it. On the labeled corpus the surface metrics
 * were anti-correlated with the property of interest — the two highest-scoring
 * pairs were both correctly-disambiguated skills — so no threshold or weight
 * choice could fix them.
 *
 *     scopeOverlap = sqrt(artifactOverlap * capabilityOverlap)
 *
 * The geometric mean is load-bearing: it is 0 when *either* factor is 0. That is
 * what separates `pdf-read`/`pdf-write` (same artifact, disjoint capability → 0)
 * from `pdf-extract`/`pdf-reader` (both agree → high). An arithmetic mean would
 * hold the first pair near 0.5 and reproduce the defect.
 *
 * Both degenerate cases are deliberate, not incidental:
 *
 * - **Either set empty** → 0 and `degenerate`. Nothing was stated, so there is
 *   nothing to compare.
 * - **Both capability sets empty but artifacts overlap** → `artifactOverlap * 0.5`
 *   and `degenerate`. "Neither description names a recognized verb" is an evidence
 *   gap, not evidence of distinctness, and scoring it 0 would silently clear two
 *   same-artifact skills.
 */
export function scopeOverlapOf(a: BoundaryFeatures, b: BoundaryFeatures): ScopeOverlap {
  // Both views of "what it works on" must agree: the recognized artifacts and the
  // author's own trigger wording. Taking the lower of the two is what stops a pair
  // agreeing on one template-supplied artifact from reading as total scope
  // agreement, without letting differently-worded triggers dilute a pair that
  // genuinely names the same object.
  const artifactOverlap = Math.min(
    jaccardOfSets(a.artifacts, b.artifacts),
    jaccardOfSets(a.scopeObjects, b.scopeObjects),
  );
  const capabilityOverlap = jaccardOfSets(a.capabilityGroups, b.capabilityGroups);
  const noArtifacts = a.artifacts.size === 0 || b.artifacts.size === 0;
  const noCapabilities = a.capabilityGroups.size === 0 || b.capabilityGroups.size === 0;

  if (noCapabilities && !noArtifacts) {
    return {
      value: artifactOverlap * 0.5,
      artifactOverlap,
      capabilityOverlap,
      degenerate: true,
    };
  }
  if (noArtifacts || noCapabilities) {
    return { value: 0, artifactOverlap, capabilityOverlap, degenerate: true };
  }
  return {
    value:
      Math.pow(artifactOverlap, ARTIFACT_EXPONENT) *
      Math.pow(capabilityOverlap, 1 - ARTIFACT_EXPONENT),
    artifactOverlap,
    capabilityOverlap,
    degenerate: false,
  };
}

/**
 * Artifact agreement is weighted above capability agreement (the plan's escalation
 * 1, applied after the plain geometric mean fell short): what a skill operates on
 * is the stronger collision signal, because two skills acting on the same object
 * compete even when their verbs differ, while the same verb on different objects
 * rarely competes. Measured on the labeled corpus this raised AUC from 0.720 to
 * 0.726 and, more usefully, moved the identical-template `k8s-deploy` /
 * `recipe-scale` pair below every reported collision, taking precision at the
 * default threshold from 0.80 to 1.00.
 *
 * Still a weighted *geometric* mean, so the zero-kills-it property that separates
 * `pdf-read` from `pdf-write` is unchanged.
 */
const ARTIFACT_EXPONENT = 0.6;

function jaccardOfSets(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let intersection = 0;
  for (const value of a) if (b.has(value)) intersection += 1;
  const union = a.size + b.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * Extracts one description's boundary features in a single pass (Task 40, P3
 * pre-pass). Hoisting this out of the O(n²) collision loop turns the per-pair
 * cost from repeated regex clause-stripping into a set intersection.
 *
 * Plan 10 adds the capability-group and artifact sets to the same pre-pass, for
 * the same reason: `extractCapabilities` and `extractArtifacts` run regexes over
 * the whole description, so calling them per pair would make an n=600 scan
 * quadratic in description length rather than in n.
 */
export function boundaryFeatures(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): BoundaryFeatures {
  // Scope features come from the description with its *exclusion* clauses removed.
  // Reading them from the whole description let a skill's own boundary define what
  // it does: "Extract text out of PDFs. Do not use for creating PDFs." reported
  // `create` as one of its capabilities, which made it look like the PDF *writer*
  // it had just disclaimed (plan 10).
  const scopeText = stripClauses(description, exclusionMarkers(dictionaries));
  // Computed once and reused: this runs per skill in the O(n) pre-pass, and
  // extractArtifacts is the most expensive call in it.
  const artifacts = scopeArtifacts(scopeText, dictionaries);
  return {
    domain: domainTokens(description, dictionaries),
    boundary: boundaryTokens(description, dictionaries),
    capabilityGroups: new Set(
      extractCapabilities(scopeText, dictionaries).map((base) =>
        capabilityGroupOf(base, dictionaries),
      ),
    ),
    artifacts: new Set(artifacts),
    scopeObjects: new Set([...artifacts, ...triggerObjects(description, dictionaries)]),
  };
}

/**
 * The synthetic term `extractArtifacts` adds when it sees a filename or
 * extension. It says a file format was named, not *which* object the skill works
 * on, so it is not scope evidence.
 */
const FILE_EXTENSION_MARKER = 'file extension';

/**
 * Artifacts that identify what a skill operates on, folded to their synonym
 * groups (plan 10 Part A/B).
 *
 * Low-signal terms are excluded. `file`, `data`, `document` and their kin name a
 * container rather than a domain object — that is why the description scorer
 * requires a supporting term before crediting them — and two skills both
 * mentioning "documented steps" have not told you they work on the same thing.
 * Leaving them in was what kept `k8s-deploy` and `recipe-scale` at a perfect
 * scope score off nothing but shared template prose.
 */
function scopeArtifacts(scopeText: string, dictionaries: HeuristicDictionaries): string[] {
  const lowSignal = new Set(dictionaries.lowSignalArtifactTerms);
  return extractArtifacts(scopeText, dictionaries)
    .filter((term) => term !== FILE_EXTENSION_MARKER && !lowSignal.has(term))
    .map((term) => artifactGroupOf(term, dictionaries));
}

/**
 * Content tokens of the skill's own trigger clauses (plan 10 Part A, the plan's
 * escalation 2 folded into the artifact set rather than added as a separate
 * factor).
 *
 * "Use when the user asks to roll out a Kubernetes deployment" names the object
 * the skill acts on just as directly as a registered artifact hint does — and it
 * names it in the author's own words, which is the only place the distinguishing
 * detail lives when a description is otherwise house-template prose. Without it,
 * `k8s-deploy` and `recipe-scale` agreed perfectly on scope because the only
 * dictionary terms either one contained came from the shared template.
 *
 * Deliberately part of the artifact set rather than a third factor in the
 * geometric mean: as a factor it would zero any pair whose triggers are phrased
 * differently, which describes most genuine paraphrase collisions — the very
 * thing this metric exists to catch.
 */
function triggerObjects(description: string, dictionaries: HeuristicDictionaries): string[] {
  const clauses = extractPositiveTriggers(description, dictionaries).join(' ');
  return tokenizeContent(clauses, dictionaries.collisionStopwords).map((token) =>
    normalizeContentToken(token, dictionaries),
  );
}

/**
 * How strongly two skills' scopes are separated by their negative boundaries
 * (0..1, Task 40), computed from precomputed features: the mean fraction of each
 * skill's positive domain that the other skill explicitly excludes.
 */
export function boundarySeparationOf(a: BoundaryFeatures, b: BoundaryFeatures): number {
  return (
    0.5 * fractionExcluded(a.domain, b.boundary) + 0.5 * fractionExcluded(b.domain, a.boundary)
  );
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
  return boundarySeparationOf(boundaryFeatures(a, dictionaries), boundaryFeatures(b, dictionaries));
}

/**
 * Word tokens, matching `similarity.tokenizeContent` (keeps short tokens like
 * acronyms).
 *
 * Plan 10 widened `similarity.ts` to `\p{L}\p{N}` but left this on `[a-z0-9]`,
 * and scope overlap carries weight 0.70 — the leading term in the composite. So
 * the metric that decides collisions was blind to every non-Latin description
 * (Russian and Chinese produced no capabilities and no artifacts at all) and
 * shredded accented Latin: `cálculo` tokenized as `['c', 'lculo']`. NFC first,
 * so the same visible word tokenizes the same however the author's editor
 * encoded it.
 */
const WORD_RE = /[\p{L}\p{N}]+/gu;

function contentWords(text: string): string[] {
  return text.normalize('NFC').toLowerCase().match(WORD_RE) ?? [];
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
