import type { NameConflict, SimilarNames } from '../types/Workspace';
import { nameSimilarity } from './similarity';

export interface NamedSkill {
  name: string;
  path: string;
}

/**
 * Groups skills by case-insensitive name and returns every group with 2+ members
 * (brief §13). An exact/case-differing duplicate name is a hard conflict regardless
 * of description — distinct from description "text collisions".
 */
export function detectNameConflicts(skills: NamedSkill[]): NameConflict[] {
  const groups = new Map<string, NamedSkill[]>();
  for (const skill of skills) {
    const key = skill.name.trim().toLowerCase();
    const group = groups.get(key);
    if (group) {
      group.push(skill);
    } else {
      groups.set(key, [skill]);
    }
  }
  return [...groups.entries()]
    .filter(([, entries]) => entries.length > 1)
    .map(([normalized, entries]) => ({
      normalized,
      entries: entries.map((s) => ({ name: s.name, path: s.path })),
    }));
}

/**
 * Finds pairs of skills whose names are confusingly similar but not identical
 * (normalized edit distance ≥ threshold). Exact/case duplicates are excluded —
 * they are reported as higher-severity NameConflicts.
 */
export function detectSimilarNames(skills: NamedSkill[], threshold = 0.8): SimilarNames[] {
  const results: SimilarNames[] = [];
  for (let i = 0; i < skills.length; i++) {
    for (let j = i + 1; j < skills.length; j++) {
      const similarity = nameSimilarity(skills[i].name, skills[j].name);
      if (similarity >= 1 || similarity < threshold) {
        continue;
      }
      results.push({
        a: skills[i].name,
        b: skills[j].name,
        aPath: skills[i].path,
        bPath: skills[j].path,
        similarity: Math.round(similarity * 100) / 100,
      });
    }
  }
  return results.sort((x, y) => y.similarity - x.similarity);
}
