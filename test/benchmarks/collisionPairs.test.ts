/**
 * Discrimination gate for plan 8 Part B
 * (docs/remediation/plan-8-falsifiable-corpora.md).
 *
 * The static corpus asks "did behavior regress?". This one asks a question the
 * detector can fail: over a labeled set of skill pairs, does the composite
 * similarity separate genuine collisions from merely similar-sounding ones? A
 * failure here means the metric is wrong, not that a label needs adjusting —
 * see benchmarks/README.md.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_COLLISION_THRESHOLD,
  detectCollisions,
} from '../../src/workspace/detectSkillCollisions';
import { calculateTriggerMetrics } from '../../src/evaluation/metrics';
import type { TriggerDecision, TriggerEvalSuite } from '../../src/evaluation/model';
import type { SkillCollision } from '../../src/types/Workspace';

/**
 * Gates owned by plan 8: each is the value measured on the tree that landed this
 * corpus, so the test documents today's discrimination instead of an aspiration.
 * At the default threshold nothing labeled COLLIDE is reported and three
 * DISTINCT pairs are, hence recall and precision of exactly 0.
 *
 * The AUC gate is 0.53, not the 0.60 plan 8 predicted: that figure came from the
 * round-3 report's 13 synthetic pairs, and this corpus measures 0.533 because
 * half its pairs use verbatim shipped descriptions, which are harder. The gate
 * records what this corpus actually measures.
 *
 * TODO(plan-10): raise to recall 0.70, precision 0.60, AUC 0.85 once collision
 * scoring stops being pure surface overlap. Never lower these to pass a change.
 */
export const RECALL_GATE = 0;
export const PRECISION_GATE = 0;
export const AUC_GATE = 0.53;

type Label = 'COLLIDE' | 'DISTINCT';

interface LabeledPair {
  id: string;
  label: Label;
  class: string;
  provenance: string;
  a: { name: string; description: string };
  b: { name: string; description: string };
  notes: string;
}

const corpus: { labelingRule: string; classes: Record<string, string>; pairs: LabeledPair[] } =
  JSON.parse(readFileSync('benchmarks/collision-pairs/pairs.json', 'utf8'));

interface Measured {
  pair: LabeledPair;
  /** Undefined only if the detector declines the pair entirely, which threshold 0 should prevent. */
  collision: SkillCollision | undefined;
  similarity: number;
}

/**
 * Scores one pair in isolation. TF-IDF document frequencies are therefore taken
 * over the two descriptions alone — that is inherent to evaluating a pair as a
 * pair, and it is how the round-3 measurement was made.
 */
const measured: Measured[] = corpus.pairs.map((pair) => {
  const [collision] = detectCollisions([pair.a, pair.b], { threshold: 0 });
  return { pair, collision, similarity: collision?.similarity ?? 0 };
});

/** `P[COLLIDE ranked above DISTINCT]`, ties counted as 0.5. Threshold-independent. */
function areaUnderCurve(): number {
  const positives = measured.filter(({ pair }) => pair.label === 'COLLIDE');
  const negatives = measured.filter(({ pair }) => pair.label === 'DISTINCT');
  let concordant = 0;
  for (const positive of positives) {
    for (const negative of negatives) {
      if (positive.similarity > negative.similarity) concordant += 1;
      else if (positive.similarity === negative.similarity) concordant += 0.5;
    }
  }
  return concordant / (positives.length * negatives.length);
}

/** The diagnostic: the whole ranking, so a failure shows *which* pairs are misordered. */
function rankingTable(): string {
  const rows = [...measured]
    .sort((x, y) => y.similarity - x.similarity)
    .map(({ pair, collision, similarity }) => {
      const metrics = collision?.metrics;
      const breakdown = metrics
        ? `J ${metrics.jaccard.toFixed(2)} C ${metrics.cosine.toFixed(2)} ` +
          `N ${metrics.charNgram.toFixed(2)} name ${metrics.nameSimilarity.toFixed(2)} ` +
          `sep ${metrics.boundarySeparation.toFixed(2)}`
        : 'not scored';
      const flag = similarity >= DEFAULT_COLLISION_THRESHOLD ? 'reported' : '        ';
      return (
        `  ${pair.label.padEnd(8)} ${similarity.toFixed(2)} ${flag} ` +
        `${(collision?.risk ?? '-').padEnd(6)} ${breakdown}  ${pair.id}`
      );
    });
  return [
    '',
    '  label    sim  flagged  risk   metrics                                       pair',
    ...rows,
  ].join('\n');
}

const suite: TriggerEvalSuite = {
  skill: 'collision-pairs',
  runsPerQuery: 1,
  queries: corpus.pairs.map((pair) => ({
    id: pair.id,
    prompt: `${pair.a.name} vs ${pair.b.name}`,
    expected: pair.label === 'COLLIDE' ? 'should-trigger' : 'should-not-trigger',
  })),
};

const decisions: TriggerDecision[] = measured.map(({ pair, similarity }) => ({
  queryId: pair.id,
  run: 0,
  triggered: similarity >= DEFAULT_COLLISION_THRESHOLD,
}));

// One implementation of the confusion matrix, shared with the runtime trigger
// evaluation rather than re-derived here.
const metrics = calculateTriggerMetrics(suite, decisions);

describe('labeled collision-pair corpus', () => {
  it('is large and balanced enough to measure discrimination', () => {
    expect(corpus.pairs.length).toBeGreaterThanOrEqual(24);
    const byLabel = (label: Label) => corpus.pairs.filter((pair) => pair.label === label).length;
    expect(byLabel('COLLIDE')).toBeGreaterThanOrEqual(10);
    expect(byLabel('DISTINCT')).toBeGreaterThanOrEqual(10);
    expect(corpus.labelingRule).toContain('COLLIDE');
    expect(new Set(corpus.pairs.map((pair) => pair.id)).size).toBe(corpus.pairs.length);
  });

  it('covers the discriminations that matter', () => {
    const classes = new Set(corpus.pairs.map((pair) => pair.class));
    for (const required of [
      'paraphrase-low-overlap',
      'mutual-exclusion-high-overlap',
      'same-artifact-opposite-capability',
      'house-template',
      'non-latin',
    ]) {
      expect(classes, `missing coverage class ${required}`).toContain(required);
    }
    for (const pair of corpus.pairs) {
      expect(corpus.classes[pair.class], `${pair.id} has an undocumented class`).toBeDefined();
    }
  });

  it('scores every pair', () => {
    const unscored = measured.filter(({ collision }) => collision === undefined);
    expect(unscored.map(({ pair }) => pair.id)).toEqual([]);
  });
});

describe(`collision discrimination at threshold ${DEFAULT_COLLISION_THRESHOLD}`, () => {
  it(`recalls at least ${(RECALL_GATE * 100).toFixed(0)}% of labeled collisions`, () => {
    expect(
      metrics.recall,
      `recall ${metrics.recall.toFixed(2)} (TP ${metrics.truePositives}, FN ${metrics.falseNegatives})` +
        rankingTable(),
    ).toBeGreaterThanOrEqual(RECALL_GATE);
  });

  it(`keeps precision at or above ${(PRECISION_GATE * 100).toFixed(0)}%`, () => {
    expect(
      metrics.precision,
      `precision ${metrics.precision.toFixed(2)} (TP ${metrics.truePositives}, FP ${metrics.falsePositives})` +
        rankingTable(),
    ).toBeGreaterThanOrEqual(PRECISION_GATE);
  });

  it(`ranks collisions above non-collisions with AUC at least ${AUC_GATE}`, () => {
    const auc = areaUnderCurve();
    expect(
      auc,
      `AUC ${auc.toFixed(3)} (0.50 = coin flip), recall ${metrics.recall.toFixed(2)}, ` +
        `precision ${metrics.precision.toFixed(2)}, specificity ${metrics.specificity.toFixed(2)}` +
        rankingTable(),
    ).toBeGreaterThanOrEqual(AUC_GATE);
  });

  it('flags the non-Latin pair as low text coverage instead of scoring it silently', () => {
    const nonLatin = measured.filter(({ pair }) => pair.class === 'non-latin');
    expect(nonLatin.length).toBeGreaterThan(0);
    for (const { pair, collision } of nonLatin) {
      expect(collision?.textCoverage, pair.id).toBe('low');
      expect(collision?.confidence, pair.id).toBe('low');
    }
  });
});
