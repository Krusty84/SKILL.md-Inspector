import { describe, expect, it } from 'vitest';
import { parseEvalSuite } from '../../src/evaluation/loadEvalSuite';
import { calculateTriggerMetrics } from '../../src/evaluation/metrics';
import { runTriggerEvaluation, FakeTriggerProvider } from '../../src/evaluation/runner';
import type { TriggerDecision } from '../../src/evaluation/model';

const suite = parseEvalSuite({
  skill: './SKILL.md',
  runsPerQuery: 1,
  queries: [
    { id: 'tp', prompt: 'a', expected: 'should-trigger' },
    { id: 'fn', prompt: 'b', expected: 'should-trigger' },
    { id: 'fp', prompt: 'c', expected: 'should-not-trigger' },
    { id: 'tn', prompt: 'd', expected: 'should-not-trigger' },
  ],
});

const knownDecisions: TriggerDecision[] = [
  { queryId: 'tp', run: 0, triggered: true },
  { queryId: 'fn', run: 0, triggered: false },
  { queryId: 'fp', run: 0, triggered: true },
  { queryId: 'tn', run: 0, triggered: false },
];

describe('behavioral trigger metrics', () => {
  it('calculates a known confusion matrix', () => {
    const m = calculateTriggerMetrics(suite, knownDecisions);
    expect(m).toMatchObject({
      truePositives: 1,
      falseNegatives: 1,
      falsePositives: 1,
      trueNegatives: 1,
      precision: 0.5,
      recall: 0.5,
      specificity: 0.5,
      f1: 0.5,
      stability: 1,
    });
  });

  it('computes stability from disagreeing repeated runs', () => {
    const repeated = parseEvalSuite({
      skill: './SKILL.md',
      runsPerQuery: 2,
      queries: [
        { id: 'flaky', prompt: 'a', expected: 'should-trigger' },
        { id: 'steady', prompt: 'b', expected: 'should-trigger' },
      ],
    });
    const m = calculateTriggerMetrics(repeated, [
      { queryId: 'flaky', run: 0, triggered: true },
      { queryId: 'flaky', run: 1, triggered: false },
      { queryId: 'steady', run: 0, triggered: true },
      { queryId: 'steady', run: 1, triggered: true },
    ]);
    expect(m.stability).toBe(0.5);
    expect(m.truePositives).toBe(3);
    expect(m.falseNegatives).toBe(1);
  });

  it('rejects missing runs', () => {
    expect(() => calculateTriggerMetrics(suite, knownDecisions.slice(0, 3))).toThrow(/Missing/);
  });

  it('rejects duplicate decisions for the same run index', () => {
    expect(() =>
      calculateTriggerMetrics(suite, [
        ...knownDecisions,
        { queryId: 'tp', run: 0, triggered: false },
      ]),
    ).toThrow(/Duplicate decision/);
  });

  it('rejects extra runs beyond runsPerQuery', () => {
    expect(() =>
      calculateTriggerMetrics(suite, [
        ...knownDecisions,
        { queryId: 'tp', run: 1, triggered: true },
      ]),
    ).toThrow(/extra runs/);
  });
});

describe('parseEvalSuite', () => {
  it('rejects malformed suites', () => {
    expect(() => parseEvalSuite({})).toThrow();
    expect(() => parseEvalSuite(null)).toThrow();
    expect(() => parseEvalSuite({ skill: 's', queries: [] })).toThrow(/queries/);
  });

  it('rejects duplicate query ids', () => {
    expect(() =>
      parseEvalSuite({
        skill: './SKILL.md',
        queries: [
          { id: 'same', prompt: 'a', expected: 'should-trigger' },
          { id: 'same', prompt: 'b', expected: 'should-not-trigger' },
        ],
      }),
    ).toThrow(/Duplicate query id/);
  });

  it('rejects empty prompts, empty ids, and bad expectations', () => {
    const base = { skill: './SKILL.md' };
    expect(() =>
      parseEvalSuite({ ...base, queries: [{ id: '', prompt: 'a', expected: 'should-trigger' }] }),
    ).toThrow(/id/);
    expect(() =>
      parseEvalSuite({ ...base, queries: [{ id: 'q', prompt: '', expected: 'should-trigger' }] }),
    ).toThrow(/prompt/);
    expect(() =>
      parseEvalSuite({ ...base, queries: [{ id: 'q', prompt: 'a', expected: 'maybe' }] }),
    ).toThrow(/expected/);
  });

  it('rejects non-integer runsPerQuery and defaults it to 1', () => {
    const queries = [{ id: 'q', prompt: 'a', expected: 'should-trigger' }];
    expect(() => parseEvalSuite({ skill: 's', queries, runsPerQuery: 0 })).toThrow();
    expect(() => parseEvalSuite({ skill: 's', queries, runsPerQuery: 1.5 })).toThrow();
    expect(parseEvalSuite({ skill: 's', queries }).runsPerQuery).toBe(1);
  });
});

describe('runTriggerEvaluation', () => {
  it('collects one decision per query per run from the provider', async () => {
    const repeated = parseEvalSuite({
      skill: './SKILL.md',
      runsPerQuery: 3,
      queries: [
        { id: 'q1', prompt: 'convert csv', expected: 'should-trigger' },
        { id: 'q2', prompt: 'unrelated', expected: 'should-not-trigger' },
      ],
    });
    const provider = new FakeTriggerProvider({ 'convert csv': true });
    const decisions = await runTriggerEvaluation(repeated, provider);
    expect(decisions).toHaveLength(6);

    const metrics = calculateTriggerMetrics(repeated, decisions);
    expect(metrics.truePositives).toBe(3);
    expect(metrics.trueNegatives).toBe(3);
    expect(metrics.precision).toBe(1);
    expect(metrics.recall).toBe(1);
    expect(metrics.stability).toBe(1);
  });
});
