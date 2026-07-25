/**
 * Calibration gate for plan 8 Part A
 * (docs/remediation/plan-8-falsifiable-corpora.md).
 *
 * Unlike `staticDescriptionQuality.test.ts`, which records the behavior the
 * implementation already has, this corpus asks whether the metric agrees with
 * reality: every description in it is a verbatim frontmatter string from a real,
 * shipped skill. A low median here means the metric is miscalibrated, not that
 * the corpus needs adjusting — see benchmarks/README.md.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeStaticDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import { genericProfile } from '../../src/profiles';
import type { StaticDescriptionQualityResult } from '../../src/types/StaticDescriptionQuality';

/**
 * Minimum acceptable median score over the production corpus.
 *
 * Raised from plan 8's placeholder of 60 by plan 9, which widened the
 * dictionaries and stopped a dictionary miss from capping the score: the measured
 * median moved 60 -> 79 and the mean 62.9 -> 76.7.
 *
 * The gate is 75, not the measured 79, and the four points are deliberate. 75 is
 * the "good" label boundary, so the assertion means something a reader can state
 * — *half of the reference implementations of this format grade as good or
 * better* — rather than restating one sample. It also leaves room for the corpus
 * to grow: its own rules require adding verbatim entries and forbid removing
 * low-scoring ones, so a gate pinned to today's exact median would fight the
 * corpus it guards. Do not lower this constant to make a change pass.
 */
export const MEDIAN_SCORE_GATE = 75;

interface ProductionSkill {
  id: string;
  source: string;
  location: string;
  description: string;
}

const corpus: { skills: ProductionSkill[] } = JSON.parse(
  readFileSync('benchmarks/description-calibration/production-skills.json', 'utf8'),
);

interface Scored {
  id: string;
  result: StaticDescriptionQualityResult;
}

const scored: Scored[] = corpus.skills.map((skill) => ({
  id: skill.id,
  result: computeStaticDescriptionQuality(skill.description, {
    minLength: genericProfile.description.minLength,
    maxLength: genericProfile.description.maxLength,
    language: genericProfile.description.language,
    weights: genericProfile.description.weights,
  }),
}));

/**
 * The diagnostic. A bare "expected 59 to be >= 75" tells whoever picks this up
 * nothing; the per-skill table tells them which descriptions the metric rejects
 * and which ceiling did it.
 */
function distributionTable(): string {
  const rows = [...scored]
    .sort((a, b) => (b.result.score ?? -1) - (a.result.score ?? -1))
    .map(({ id, result }) => {
      const score = result.state === 'scored' ? String(result.score).padStart(3) : 'n/a';
      const label = String(result.label ?? `not-scored: ${result.notScoredReason}`).padEnd(11);
      const ceilings = result.gradeLimitations.map((limitation) => limitation.code).join(', ');
      return `  ${score}  ${label}  ${id.padEnd(24)}  ${ceilings}`;
    });
  return ['', '  score  label        skill                     grade limitations', ...rows].join(
    '\n',
  );
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

describe('production description calibration', () => {
  it('holds enough verbatim entries to be a distribution, each with provenance', () => {
    expect(corpus.skills.length).toBeGreaterThanOrEqual(30);
    for (const skill of corpus.skills) {
      expect(skill.source.length, skill.id).toBeGreaterThan(0);
      expect(skill.location.length, skill.id).toBeGreaterThan(0);
      expect(skill.description.trim(), skill.id).toBe(skill.description);
    }
    expect(new Set(corpus.skills.map((skill) => skill.id)).size).toBe(corpus.skills.length);
  });

  it('scores every real description (none may be not-scored)', () => {
    const unscored = scored.filter(({ result }) => result.state !== 'scored').map(({ id }) => id);
    expect(unscored, `not-scored entries: ${unscored.join(', ')}${distributionTable()}`).toEqual(
      [],
    );
  });

  it(`grades the shipped corpus at a median of at least ${MEDIAN_SCORE_GATE}`, () => {
    const scores = scored
      .map(({ result }) => result.score)
      .filter((score): score is number => score !== null);
    const value = median(scores);
    const mean = scores.reduce((sum, score) => sum + score, 0) / scores.length;
    const belowGood = scores.filter((score) => score < 75).length;

    expect(
      value,
      `median ${value} (mean ${mean.toFixed(1)}, ${belowGood}/${scores.length} below "good")` +
        distributionTable(),
    ).toBeGreaterThanOrEqual(MEDIAN_SCORE_GATE);
  });
});
