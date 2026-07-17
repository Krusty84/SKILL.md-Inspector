import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEvalSuite } from '../../src/evaluation/loadEvalSuite';
import { runTriggerEvaluation, FakeTriggerProvider } from '../../src/evaluation/runner';
import { calculateTriggerMetrics } from '../../src/evaluation/metrics';

// The shipped example suite is the documented on-disk format — run it through
// the whole parse -> evaluate -> metrics pipeline so the format stays honest.
describe('evaluation/examples/sample-suite.json end to end', () => {
  it('flows from disk through parseEvalSuite, the runner, and the metrics', async () => {
    const suite = parseEvalSuite(
      JSON.parse(readFileSync('evaluation/examples/sample-suite.json', 'utf8')),
    );
    expect(suite.skill).toBe('./SKILL.md');
    expect(suite.queries).toHaveLength(20);
    expect(suite.runsPerQuery).toBe(3);

    // Deterministic provider with one miss on each side of the ground truth.
    const decisions: Record<string, boolean> = {};
    for (let i = 1; i <= 10; i++) {
      decisions[`Perform supported task ${i}`] = i !== 10;
      decisions[`Unrelated request ${i}`] = i === 1;
    }
    const recorded = await runTriggerEvaluation(suite, new FakeTriggerProvider(decisions));
    expect(recorded).toHaveLength(60);

    const metrics = calculateTriggerMetrics(suite, recorded);
    expect(metrics).toMatchObject({
      truePositives: 27,
      falseNegatives: 3,
      falsePositives: 3,
      trueNegatives: 27,
      precision: 0.9,
      recall: 0.9,
      specificity: 0.9,
      stability: 1,
      queryCount: 20,
      runsPerQuery: 3,
    });
    expect(metrics.f1).toBeCloseTo(0.9, 12);
  });
});
