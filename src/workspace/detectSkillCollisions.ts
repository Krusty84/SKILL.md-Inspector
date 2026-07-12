import type {
  SkillCollision,
  CollisionRisk,
  CollisionMetrics,
  CollisionWeights,
} from '../types/Workspace';
import {
  tokenizeContent,
  tfidfVectors,
  cosine,
  jaccard,
  sharedTerms,
  charNgramSimilarity,
  nameSimilarity,
} from './similarity';
import { normalizeContentToken } from '../quality/wordForms';
import { boundarySeparation } from './collisionFeatures';

export interface SkillDescriptor {
  name: string;
  description: string;
}

/** Default blend of the four normalized similarity metrics (need not sum to 1). */
export const DEFAULT_COLLISION_WEIGHTS: CollisionWeights = {
  jaccard: 0.3,
  cosine: 0.3,
  charNgram: 0.2,
  nameSimilarity: 0.2,
};

export const DEFAULT_COLLISION_THRESHOLD = 0.4;
export const DEFAULT_NGRAM_SIZE = 3;
export const DEFAULT_BOUNDARY_SEPARATION_WEIGHT = 0.5;

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
 * deterministic composite score blending token Jaccard, TF-IDF cosine, character
 * n-gram, and name similarity, reduced when the skills' negative boundaries
 * separate their scopes. The raw composite is compared to the threshold (rounding
 * is display-only); pairs at or above it are returned, highest similarity first.
 */
export function detectCollisions(
  skills: SkillDescriptor[],
  options: CollisionOptions = {},
): SkillCollision[] {
  const threshold = options.threshold ?? DEFAULT_COLLISION_THRESHOLD;
  const weights = normalizeWeights(options.weights ?? DEFAULT_COLLISION_WEIGHTS);
  const ngramSize = options.ngramSize ?? DEFAULT_NGRAM_SIZE;
  const boundaryWeight = options.boundarySeparationWeight ?? DEFAULT_BOUNDARY_SEPARATION_WEIGHT;

  // Normalize plural/verb forms so morphological variants collide (Tasks 31–32).
  const tokens = skills.map((skill) =>
    tokenizeContent(skill.description).map(normalizeContentToken),
  );
  const vectors = tfidfVectors(tokens);
  const collisions: SkillCollision[] = [];

  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const metrics: CollisionMetrics = {
        cosine: cosine(vectors[i], vectors[j]),
        jaccard: jaccard(tokens[i], tokens[j]),
        charNgram: charNgramSimilarity(skills[i].description, skills[j].description, ngramSize),
        nameSimilarity: nameSimilarity(skills[i].name, skills[j].name),
        boundarySeparation: boundarySeparation(skills[i].description, skills[j].description),
      };
      const composite = compositeScore(metrics, weights, boundaryWeight);
      if (composite < threshold) {
        continue;
      }
      const risk = riskFor(composite);
      collisions.push({
        a: skills[i].name,
        b: skills[j].name,
        similarity: round2(composite),
        metrics: roundMetrics(metrics),
        sharedTerms: sharedTerms(tokens[i], tokens[j]),
        risk,
        recommendation: recommendationFor(risk),
      });
    }
  }

  return collisions.sort((x, y) => y.similarity - x.similarity);
}

export function riskFor(similarity: number): CollisionRisk {
  if (similarity >= 0.8) return 'High';
  if (similarity >= 0.6) return 'Medium';
  return 'Low';
}

/**
 * Weighted blend of the metrics (weights normalized to sum 1), reduced by the
 * boundary-separation adjustment (Tasks 35 + 40). Clamped to 0..1.
 */
function compositeScore(
  metrics: CollisionMetrics,
  weights: CollisionWeights,
  boundaryWeight: number,
): number {
  const base =
    weights.jaccard * metrics.jaccard +
    weights.cosine * metrics.cosine +
    weights.charNgram * metrics.charNgram +
    weights.nameSimilarity * metrics.nameSimilarity;
  const adjusted = base * (1 - boundaryWeight * metrics.boundarySeparation);
  return Math.min(1, Math.max(0, adjusted));
}

/** Scales the weights so they sum to 1; falls back to the defaults if non-positive. */
function normalizeWeights(weights: CollisionWeights): CollisionWeights {
  const sum = weights.jaccard + weights.cosine + weights.charNgram + weights.nameSimilarity;
  if (sum <= 0) {
    return normalizeWeights(DEFAULT_COLLISION_WEIGHTS);
  }
  return {
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
