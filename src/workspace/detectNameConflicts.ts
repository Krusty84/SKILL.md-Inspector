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
    // NFC first: `café-tool` written composed and decomposed is one name to a
    // reader and to the filesystem, and used to be reported as merely
    // "confusingly similar" instead of a hard conflict.
    const key = skill.name.normalize('NFC').trim().toLowerCase();
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
 *
 * The pair loop is O(n²) edit distances (~2 s at n=1000), so it honors
 * cancellation between rows at the same granularity as `detectCollisions`;
 * without that, a cancelled workspace scan still blocked on this tail (plan 7
 * Part C).
 */
export function detectSimilarNames(
  skills: NamedSkill[],
  threshold = 0.8,
  cancel?: { isCancellationRequested: boolean },
): SimilarNames[] {
  const results: SimilarNames[] = [];
  // The same normalization `nameSimilarity` applies internally, so the
  // length-gap gate below measures exactly the strings it would compare.
  const lengths = skills.map((skill) => skill.name.trim().toLowerCase().length);
  for (let i = 0; i < skills.length; i++) {
    if (cancel?.isCancellationRequested) {
      break;
    }
    for (let j = i + 1; j < skills.length; j++) {
      // Edit distance is at least the length difference, so the best similarity
      // this pair could reach is 1 - |Δlength| / maxLength. When even that is
      // below the threshold, skip the O(len²) distance entirely. Computed in the
      // same form as `nameSimilarity` so the comparison is exactly equivalent.
      const longest = Math.max(lengths[i], lengths[j]);
      if (longest > 0 && 1 - Math.abs(lengths[i] - lengths[j]) / longest < threshold) {
        continue;
      }
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
