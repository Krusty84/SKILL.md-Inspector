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
 * Ratchets, set to what plan 10 measured after replacing surface overlap with a
 * scope metric. Plan 8's baseline was recall 0.00, precision 0.00, AUC 0.533, with
 * the three highest-scoring pairs in the corpus all DISTINCT.
 *
 * Plan 10's own acceptance targets were recall 0.70 / precision 0.60 / AUC 0.85.
 * **Precision is met, recall and AUC are not**, and `PLAN_10_TARGETS` below records
 * why together with the arithmetic that shows why the AUC target is unreachable on
 * this corpus. The plan's instruction for that outcome is explicit — report it
 * rather than tune until the numbers pass — so these constants pin the measured
 * result and the shortfall is documented rather than fitted away.
 *
 * Never lower them to make a change pass: a drop here means the metric regressed,
 * not that the corpus needs adjusting (benchmarks/README.md).
 *
 * Plan 16 ratcheted `AUC_GATE` from 0.72 to 0.83. Making every synonym-group
 * member reachable, moving `spec` from the `interface` group to `test`, and
 * resolving `test` by position gave two of the four zero-scope COLLIDE pairs
 * real evidence: measured AUC rose 0.7381 → 0.8304 with recall (0.333) and
 * precision (1.000) unchanged, and the blind-collision set halved.
 *
 * TODO(plan-11): the two remaining zero-scope COLLIDE pairs listed in
 * `PLAN_10_TARGETS` need evidence the dictionaries cannot supply. Raise these
 * once they have it.
 */
export const RECALL_GATE = 0.33;
export const PRECISION_GATE = 1.0;
export const AUC_GATE = 0.83;

/**
 * Plan 10's targets, and the measured distance to each. Kept as a live assertion
 * rather than a comment so the shortfall cannot rot: the block below fails if a
 * target is *reached*, which is the signal to promote it into the gates above.
 */
const PLAN_10_TARGETS = { recall: 0.7, precision: 0.6, auc: 0.85 } as const;

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

/** Looks up one measured pair by corpus id, failing loudly if the id is stale. */
function byId(id: string): Measured {
  const entry = measured.find(({ pair }) => pair.id === id);
  if (!entry) {
    throw new Error(`no pair "${id}" in the corpus — a named acceptance case was renamed away`);
  }
  return entry;
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

  /**
   * Plan 10 acceptance criterion 2. The aggregate gates above can be satisfied
   * while still failing on the pairs that motivated the plan, so each is named.
   */
  it('reports pdf-extract-vs-pdf-reader (paraphrase of one job, both about PDFs)', () => {
    const entry = byId('pdf-extract-vs-pdf-reader');
    expect(
      entry.similarity,
      `scored ${entry.similarity.toFixed(2)}, below the ${DEFAULT_COLLISION_THRESHOLD} threshold${rankingTable()}`,
    ).toBeGreaterThanOrEqual(DEFAULT_COLLISION_THRESHOLD);
  });

  it('rates pdf-extract-vs-pdf-reader at least Medium risk', () => {
    // A band, not just a score: the pair is a genuine duplicate-scope collision,
    // and "Low" would under-report it even if it clears the threshold.
    const entry = byId('pdf-extract-vs-pdf-reader');
    expect(entry.collision?.risk, `similarity ${entry.similarity.toFixed(2)}`).not.toBe('Low');
  });

  it.each([
    ['pdf-read-vs-pdf-write', 'same artifact, opposite capability'],
    ['py2-migrate-vs-py3-lint', 'explicit mutual boundaries'],
    ['k8s-deploy-vs-recipe-scale', 'identical template prose, unrelated domains'],
  ])('does not report %s (%s)', (id) => {
    const entry = byId(id);
    expect(
      entry.similarity,
      `${id} scored ${entry.similarity.toFixed(2)}, at or above the ${DEFAULT_COLLISION_THRESHOLD} threshold${rankingTable()}`,
    ).toBeLessThan(DEFAULT_COLLISION_THRESHOLD);
  });

  it('drops py2-migrate-vs-py3-lint below every pair it is reported alongside', () => {
    // It was the second-highest-scoring pair in the whole corpus, and it is the
    // exact disambiguation pattern the extension's own diagnostics tell authors to
    // write. A metric that punishes following its own advice is the headline defect
    // plan 10 exists to fix.
    //
    // The plan asked for it to rank strictly below *every* labeled collision. It
    // does not: four collisions score below it because they have no scope evidence
    // at all (see `PLAN_10_TARGETS`). What it does clear is the useful part — it is
    // below every collision that actually gets reported.
    const disambiguated = byId('py2-migrate-vs-py3-lint').similarity;
    const reported = measured.filter(
      ({ pair, similarity }) =>
        pair.label === 'COLLIDE' && similarity >= DEFAULT_COLLISION_THRESHOLD,
    );
    expect(reported.length, 'no collisions reported at all').toBeGreaterThan(0);
    const offenders = reported.filter(({ similarity }) => similarity <= disambiguated);
    expect(
      offenders.map(({ pair, similarity }) => `${pair.id} @ ${similarity.toFixed(2)}`),
      `py2/py3 scored ${disambiguated.toFixed(2)}${rankingTable()}`,
    ).toEqual([]);
  });

  /**
   * Plan 10's stop rule: "If after all three the corpus still fails, stop and
   * report rather than tuning weights until the numbers pass. Weight-fitting a
   * 24-pair corpus produces a metric that works on 24 pairs."
   *
   * This is that report, as assertions rather than prose so it cannot drift out of
   * date. Each expectation says a target is *not yet* met; when one starts failing,
   * the metric has improved and the value belongs in the gates at the top.
   */
  describe('plan 10 targets not yet met', () => {
    it('misses the recall target', () => {
      expect(metrics.recall).toBeLessThan(PLAN_10_TARGETS.recall);
    });

    it('meets the precision target', () => {
      expect(metrics.precision).toBeGreaterThanOrEqual(PLAN_10_TARGETS.precision);
    });

    it('misses the AUC target', () => {
      expect(areaUnderCurve()).toBeLessThan(PLAN_10_TARGETS.auc);
    });

    /**
     * How far the AUC can go while some collisions have no scope evidence at all.
     *
     * A labeled collision scoring exactly 0 on scope overlap ties with every
     * DISTINCT pair that also scores 0, and a tie contributes 0.5 to AUC. So the
     * blind collisions put a hard ceiling on what any re-weighting can reach:
     *
     *     ((12 - blind) x 14 + blind x 11 x 0.5) / (12 x 14)
     *
     * Plan 10 left four blind collisions, a ceiling of 0.798 — below the 0.85
     * target, which is why that target was reported unreachable rather than
     * tuned toward. Plan 16 gave two of them evidence
     * (`commit-msg-vs-change-summary` through the reachable synonym members,
     * `test-writer-vs-spec-generator` through `spec`'s move to the `test` group
     * and the dual-role guard), lifting the ceiling to 0.899. The target is no
     * longer structurally out of reach — the remaining 0.02 is real distance.
     *
     * The two that are still blind need evidence the dictionaries cannot supply:
     * `docx-vs-doc-coauthoring` shares only generic container nouns, and
     * `otchet-formatter-vs-otchet-generator` is Cyrillic, where the English
     * capability and artifact vocabularies match nothing by construction.
     */
    it('is bounded above by the pairs with no scope evidence at all', () => {
      const collisions = measured.filter(({ pair }) => pair.label === 'COLLIDE');
      const distinct = measured.filter(({ pair }) => pair.label === 'DISTINCT');
      const zeroScope = (list: Measured[]) =>
        list.filter(({ collision }) => (collision?.metrics.scopeOverlap ?? 0) === 0);
      const blindCollisions = zeroScope(collisions);
      const blindDistinct = zeroScope(distinct);

      expect(blindCollisions.map(({ pair }) => pair.id).sort()).toEqual([
        'docx-vs-doc-coauthoring',
        'otchet-formatter-vs-otchet-generator',
      ]);

      const ceiling =
        ((collisions.length - blindCollisions.length) * distinct.length +
          blindCollisions.length * blindDistinct.length * 0.5) /
        (collisions.length * distinct.length);
      expect(areaUnderCurve()).toBeLessThanOrEqual(ceiling);
      // Still short of the target, but no longer by construction.
      expect(areaUnderCurve()).toBeLessThan(PLAN_10_TARGETS.auc);
    });
  });

  it('reads the non-Latin pair instead of scoring it on its name alone', () => {
    // Plan 6 flagged this pair low-coverage because `tokenizeContent` kept only
    // `[a-z0-9]`, so every text metric was 0. Plan 10 Part D widened it, so the text
    // is now genuinely compared and the coverage flag correctly reports `full`.
    // Confidence stays low: the dictionaries are English, so the pair has no scope
    // evidence, which is a real limit and still surfaced.
    const nonLatin = measured.filter(({ pair }) => pair.class === 'non-latin');
    expect(nonLatin.length).toBeGreaterThan(0);
    for (const { pair, collision } of nonLatin) {
      expect(collision?.textCoverage, pair.id).toBe('full');
      expect(collision?.confidence, pair.id).toBe('low');
      expect(collision?.metrics.charNgram, pair.id).toBeGreaterThan(0);
    }
  });
});
