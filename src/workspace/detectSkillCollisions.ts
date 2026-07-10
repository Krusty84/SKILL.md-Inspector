import type { SkillCollision, CollisionRisk } from '../types/Workspace';
import { tokenizeContent, tfidfVectors, cosine, sharedTerms } from './similarity';

export interface SkillDescriptor {
  name: string;
  description: string;
}

export interface CollisionOptions {
  /** Minimum similarity to report a collision (brief §13.2: Low starts at 0.40). */
  threshold?: number;
}

/**
 * Detects pairs of skills whose descriptions overlap (brief §13.2). Similarity
 * is the smoothed TF-IDF cosine of the descriptions across the whole set; pairs
 * at or above the threshold are returned, highest similarity first.
 */
export function detectCollisions(
  skills: SkillDescriptor[],
  options: CollisionOptions = {},
): SkillCollision[] {
  const threshold = options.threshold ?? 0.4;
  const tokens = skills.map((skill) => tokenizeContent(skill.description));
  const vectors = tfidfVectors(tokens);
  const collisions: SkillCollision[] = [];

  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const similarity = round2(cosine(vectors[i], vectors[j]));
      if (similarity < threshold) {
        continue;
      }
      const risk = riskFor(similarity);
      collisions.push({
        a: skills[i].name,
        b: skills[j].name,
        similarity,
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

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
