import type {
  SkillCollision,
  CollisionRisk,
  CollisionConfidence,
  CollisionMetrics,
  CollisionTextCoverage,
  CollisionWeights,
} from '../types/Workspace';
import {
  tokenizeContent,
  tfidfVectors,
  cosineNormed,
  normedVector,
  charNgramVector,
  jaccard,
  sharedTerms,
  nameSimilarity,
} from './similarity';
import { normalizeContentToken } from '../quality/wordForms';
import { boundaryFeatures, boundarySeparationOf, scopeOverlapOf } from './collisionFeatures';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  type HeuristicDictionaries,
} from '../quality/dictionaries';

export interface SkillDescriptor {
  name: string;
  description: string;
}

/**
 * Default blend of the normalized similarity metrics (need not sum to 1).
 *
 * `scopeOverlap` leads because it is the only metric that models the question
 * being asked; cosine and Jaccard stay as corroborating lexical evidence.
 * `nameSimilarity` fell from 0.20 to 0.05 in plan 10: it is a tiebreaker, not
 * evidence. At 0.20 it contributed 0.14 to `report-builder` vs `report-breaker`
 * — zero shared content tokens — and shared naming conventions (`pdf-*`,
 * `*-writer`) inflated every pair in a tidy workspace.
 */
export const DEFAULT_COLLISION_WEIGHTS: Required<CollisionWeights> = {
  scopeOverlap: 0.7,
  cosine: 0.13,
  jaccard: 0.07,
  charNgram: 0.05,
  nameSimilarity: 0.05,
};

/**
 * Minimum composite similarity to report a collision, recalibrated by plan 10
 * Part E from the observed distribution of the labeled corpus rather than chosen a
 * priori.
 *
 * Was 0.40, which suited a composite dominated by lexical overlap. The scope-led
 * composite scores lower across the board — a pair with no shared artifact scores
 * near 0 rather than picking up 0.2 of incidental token overlap — so 0.40 reported
 * almost nothing. At 0.30 the corpus gives precision 1.00 and recall 0.33; the
 * next step down, 0.25, buys recall 0.42 at precision 0.83. Precision was
 * preferred: a collision warning the author disagrees with costs more trust than a
 * missed one.
 */
export const DEFAULT_COLLISION_THRESHOLD = 0.3;
export const DEFAULT_NGRAM_SIZE = 3;
export const DEFAULT_BOUNDARY_SEPARATION_WEIGHT = 0.5;

/** Fewest normalized content tokens a side may contribute before the text metrics stop meaning anything. */
const MIN_COMPARABLE_TOKENS = 3;

export interface CollisionOptions {
  /** Minimum composite similarity to report a collision (brief §13.2: Low starts at 0.40). */
  threshold?: number;
  /** Weights for blending the metrics into the composite score. */
  weights?: CollisionWeights;
  /** Character n-gram size for the char-similarity metric. */
  ngramSize?: number;
  /** How strongly mutually-exclusive boundaries reduce the composite (0..1). */
  boundarySeparationWeight?: number;
}

/**
 * Detects pairs of skills whose scope overlaps (brief §13.2). Each pair gets a
 * deterministic composite score led by scope overlap — whether the two skills do
 * the same kind of thing to the same kind of object — corroborated by token
 * Jaccard, TF-IDF cosine, and character n-gram similarity, with name similarity
 * as a tiebreaker, reduced when the skills' negative boundaries separate their
 * scopes. The raw composite is compared to the threshold; the
 * displayed similarity is rounded to two decimals and the risk band is derived
 * from that same rounded value. Pairs at or above the threshold are returned,
 * highest similarity first.
 *
 * Which metrics see capability verbs (plan 4 — deliberate asymmetry, do not
 * "fix"): the **Jaccard** token sets exclude tokens whose normalized base is a
 * registered action verb — many skills legitimately share verbs (review,
 * validate, lint), and scope is what they operate *on*. The **TF-IDF cosine**
 * keeps verbs because corpus-wide document frequency already tempers common
 * ones; the **char n-gram** metric runs over the normalized, stopword-filtered
 * content tokens (verbs included) rather than the raw text, so template prose
 * cannot dominate it; and `sharedTerms` reporting keeps verbs so the report
 * still explains what overlapped.
 *
 * Plan 10 added `scopeOverlap` and made it the leading term. The four lexical
 * metrics all measure surface overlap, which on the labeled corpus was
 * *anti-correlated* with genuine collision: paraphrases share little text, and
 * two skills that merely share an artifact share a lot of it. They are kept as
 * corroborating evidence — and because users have tuned their weights — but they
 * are no longer what decides a collision. See `scopeOverlapOf`.
 */
export function detectCollisions(
  skills: SkillDescriptor[],
  options: CollisionOptions = {},
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
  cancel?: { isCancellationRequested: boolean },
): SkillCollision[] {
  const threshold = options.threshold ?? DEFAULT_COLLISION_THRESHOLD;
  const weights = normalizeWeights(options.weights ?? DEFAULT_COLLISION_WEIGHTS);
  const ngramSize = options.ngramSize ?? DEFAULT_NGRAM_SIZE;
  const boundaryWeight = options.boundarySeparationWeight ?? DEFAULT_BOUNDARY_SEPARATION_WEIGHT;

  // O(n) pre-pass (P3): compute every per-skill quantity once here so the O(n²)
  // pair loop only combines precomputed values. Previously the char n-gram
  // vectors and boundary token sets were rebuilt for both skills on every pair.
  // Normalize plural/verb forms so morphological variants collide (Tasks 31–32).
  const tokens = skills.map((skill) =>
    tokenizeContent(skill.description, dictionaries.collisionStopwords).map((token) =>
      normalizeContentToken(token, dictionaries),
    ),
  );
  const vectors = tfidfVectors(tokens).map(normedVector);
  // N-grams over the normalized content tokens, not the raw description: the
  // metric's purpose is spelling/morphological variation between *content*
  // words, and raw text let shared template prose read as scope overlap.
  const ngramVectors = tokens.map((list) => charNgramVector(list.join(' '), ngramSize));
  // Jaccard compares what the skills operate on, so capability verbs are
  // excluded (kept in TF-IDF and sharedTerms — see the function docs). A
  // verbs-only description yields an empty set, which jaccard() scores 0.
  const verbBases = new Set(dictionaries.actionVerbs);
  const jaccardTokens = tokens.map((list) => list.filter((token) => !verbBases.has(token)));
  // The same O(n) pre-pass now carries the capability-group and artifact sets, so
  // the pair loop stays a set intersection (plan 10 Part A).
  const boundaries = skills.map((skill) => boundaryFeatures(skill.description, dictionaries));
  const collisions: SkillCollision[] = [];

  for (let i = 0; i < skills.length; i++) {
    // The pair loop can dominate a large workspace scan; honor cancellation
    // between rows so it is not an unabortable freeze (P3).
    if (cancel?.isCancellationRequested) {
      break;
    }
    for (let j = i + 1; j < skills.length; j++) {
      const scope = scopeOverlapOf(boundaries[i], boundaries[j]);
      const metrics: CollisionMetrics = {
        scopeOverlap: scope.value,
        cosine: cosineNormed(vectors[i], vectors[j]),
        jaccard: jaccard(jaccardTokens[i], jaccardTokens[j]),
        charNgram: cosineNormed(ngramVectors[i], ngramVectors[j]),
        nameSimilarity: nameSimilarity(skills[i].name, skills[j].name),
        boundarySeparation: boundarySeparationOf(boundaries[i], boundaries[j]),
      };
      // Blind only when there was nothing to compare, not when the comparison
      // returned zero (see compositeScore).
      const composite = compositeScore(
        metrics,
        weights,
        boundaryWeight,
        scope.degenerate && scope.value === 0,
      );
      if (composite < threshold) {
        continue;
      }
      // Risk is banded on the same rounded value the report displays, so a
      // composite of 0.797 can never render as "0.80 / Medium".
      const similarity = round2(composite);
      const risk = riskFor(similarity);
      collisions.push({
        a: skills[i].name,
        b: skills[j].name,
        similarity,
        metrics: roundMetrics(metrics),
        sharedTerms: sharedTerms(tokens[i], tokens[j]),
        risk,
        confidence: confidenceFor(
          skills[i].description,
          skills[j].description,
          tokens[i],
          tokens[j],
          metrics,
          scope.degenerate,
        ),
        textCoverage: textCoverageFor(tokens[i], tokens[j]),
        recommendation: recommendationFor(risk),
      });
    }
  }

  return collisions.sort((x, y) => y.similarity - x.similarity);
}

/**
 * Risk bands, recalibrated by plan 10 Part E from the observed corpus
 * distribution.
 *
 * The old edges (High >= 0.80, Medium >= 0.60) were calibrated to an empty region:
 * byte-identical descriptions scored 0.80, changing one word dropped to 0.48, and
 * a genuine paraphrase reached 0.36 — so `High` and `Medium` were unreachable
 * except by near-verbatim duplication and in practice there was a single band.
 *
 * Observed COLLIDE scores on benchmarks/collision-pairs (26 pairs, 12 labeled
 * COLLIDE), ascending:
 *
 *     0.01 0.02 0.05 0.09 0.13 0.17 0.19 0.27 0.30 0.30 0.35 0.41
 *
 * and the labeled DISTINCT pairs top out at 0.28. The edges below put real pairs
 * in every band: `Low` starts at the 0.30 threshold, `Medium` at 0.35 (the
 * strongest two collisions in the corpus), `High` at 0.40 (the single strongest,
 * `pdf-extract` / `pdf-reader`). Every DISTINCT pair stays below `Low`. Identical
 * descriptions still score 1.0 and read `High`.
 *
 * These are narrow because the corpus is: re-derive them, do not widen them by
 * eye, if the score distribution moves.
 */
export function riskFor(similarity: number): CollisionRisk {
  if (similarity >= 0.4) return 'High';
  if (similarity >= 0.35) return 'Medium';
  return 'Low';
}

/**
 * How much textual evidence backs a collision (Task 80) — distinct from risk.
 * Short descriptions or too few meaningful tokens give low confidence; long
 * descriptions whose similarity metrics agree give high confidence.
 */
function confidenceFor(
  descA: string,
  descB: string,
  tokensA: string[],
  tokensB: string[],
  metrics: CollisionMetrics,
  degenerateScope: boolean,
): CollisionConfidence {
  const minLength = Math.min(descA.trim().length, descB.trim().length);
  const minTokens = Math.min(tokensA.length, tokensB.length);
  if (minLength < 30 || minTokens < 3) {
    return 'low'; // too little text to trust the overlap
  }
  // One side named no capability or no artifact, so `scopeOverlap` is an
  // evidence-gap estimate rather than a comparison (plan 10 Part A). The number is
  // still reported; the confidence says not to lean on it.
  if (degenerateScope) {
    return 'low';
  }
  const sims = [metrics.cosine, metrics.jaccard, metrics.charNgram];
  const spread = Math.max(...sims) - Math.min(...sims);
  if (minTokens >= 6 && minLength >= 60 && spread <= 0.25) {
    return 'high'; // ample tokens and the metrics agree
  }
  return 'medium';
}

/**
 * Whether Jaccard, cosine, and the char n-gram actually had text to compare
 * (plan 6). `tokenizeContent` keeps only Latin word characters, so a Cyrillic or
 * CJK description reduces to a near-empty token set: all three text metrics
 * return 0 and the composite is effectively `nameSimilarity` alone, which makes
 * identical and unrelated descriptions score the same. The flag lets the report
 * say so instead of presenting a bare number.
 */
function textCoverageFor(tokensA: string[], tokensB: string[]): CollisionTextCoverage {
  return Math.min(tokensA.length, tokensB.length) < MIN_COMPARABLE_TOKENS ? 'low' : 'full';
}

/**
 * Weighted blend of the metrics (weights normalized to sum 1), reduced by the
 * boundary-separation adjustment (Tasks 35 + 40). Clamped to 0..1.
 */
function compositeScore(
  metrics: CollisionMetrics,
  weights: Required<CollisionWeights>,
  boundaryWeight: number,
  scopeIsBlind = false,
): number {
  // When the scope metric had nothing to read — neither description named an
  // artifact or a capability the dictionaries recognize — its zero is absence of
  // evidence, not evidence of absence. Counting it as a zero at the leading weight
  // would cap such a pair at 0.30 however identical the two descriptions are, which
  // is what happened to non-Latin text: the dictionaries are English, so scope is
  // blind, and two *identical* Russian descriptions scored 0.29.
  //
  // A measured zero is different and is kept: `pdf-read` / `pdf-write` both state
  // artifacts and capabilities, and those capabilities genuinely do not overlap.
  // `ScopeOverlap.degenerate` is what tells the two apart.
  const textTotal = weights.jaccard + weights.cosine + weights.charNgram;
  const textScore =
    textTotal > 0
      ? (weights.jaccard * metrics.jaccard +
          weights.cosine * metrics.cosine +
          weights.charNgram * metrics.charNgram) /
        textTotal
      : 0;
  // `nameSimilarity` keeps its absolute weight in both branches: it is a
  // tiebreaker, not evidence, and letting it absorb a share of the scope weight
  // would put two unrelated skills with similar names (`report-builder` /
  // `report-breaker`, no shared content tokens at all) back where plan 10 found
  // them.
  const nameTerm = weights.nameSimilarity * metrics.nameSimilarity;
  const base = scopeIsBlind
    ? // Scope is blind, so the only evidence left is that the two descriptions are
      // worded alike — which on the labeled corpus is chance-level evidence of
      // collision (cosine 0.470, Jaccard 0.494, char n-gram 0.527 AUC). It is
      // therefore squared: it carries the composite only when agreement is close to
      // total. Two identical Cyrillic descriptions still score ~0.99, while two
      // unrelated skills sharing house template prose stay well below the threshold
      // instead of being promoted by the freed weight.
      (weights.scopeOverlap + textTotal) * textScore * textScore + nameTerm
    : weights.scopeOverlap * metrics.scopeOverlap + textTotal * textScore + nameTerm;
  const adjusted = base * (1 - boundaryWeight * metrics.boundarySeparation);
  return Math.min(1, Math.max(0, adjusted));
}

/**
 * Scales the weights so they sum to 1; falls back to the defaults if non-positive.
 *
 * A weights object with **no** `scopeOverlap` key is a user setting written
 * against the pre-plan-10 schema. The missing key takes the default 0.45, not 0:
 * reading it as 0 would leave every user who ever customized their weights on the
 * old surface-overlap metric, which is the defect plan 10 exists to remove. Their
 * four explicit values are still honored, and the sum normalization means the
 * relative balance they chose between those four survives.
 */
function normalizeWeights(weights: CollisionWeights): Required<CollisionWeights> {
  const scopeOverlap = weights.scopeOverlap ?? DEFAULT_COLLISION_WEIGHTS.scopeOverlap;
  const sum =
    scopeOverlap + weights.jaccard + weights.cosine + weights.charNgram + weights.nameSimilarity;
  if (sum <= 0) {
    return normalizeWeights(DEFAULT_COLLISION_WEIGHTS);
  }
  return {
    scopeOverlap: scopeOverlap / sum,
    jaccard: weights.jaccard / sum,
    cosine: weights.cosine / sum,
    charNgram: weights.charNgram / sum,
    nameSimilarity: weights.nameSimilarity / sum,
  };
}

function recommendationFor(risk: CollisionRisk): string {
  switch (risk) {
    case 'High':
      return 'Descriptions are nearly interchangeable — merge the skills or sharply differentiate their scope and boundaries.';
    case 'Medium':
      return 'Clarify each description with distinct artifacts and "Do not use when..." boundaries.';
    case 'Low':
      return 'Minor overlap — verify the trigger contexts do not compete.';
  }
}

function roundMetrics(metrics: CollisionMetrics): CollisionMetrics {
  return {
    scopeOverlap: round2(metrics.scopeOverlap),
    cosine: round2(metrics.cosine),
    jaccard: round2(metrics.jaccard),
    charNgram: round2(metrics.charNgram),
    nameSimilarity: round2(metrics.nameSimilarity),
    boundarySeparation: round2(metrics.boundarySeparation),
  };
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
