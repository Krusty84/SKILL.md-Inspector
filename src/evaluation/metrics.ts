import type { TriggerDecision, TriggerEvalSuite, TriggerMetrics } from './model';

const ratio = (n: number, d: number): number => (d === 0 ? 0 : n / d);

/**
 * Aggregates recorded trigger decisions into confusion-matrix metrics.
 * Each query must have exactly one decision per run index 0..runsPerQuery-1;
 * missing or duplicated runs are rejected rather than silently skewing the
 * counts. Stability is the share of queries whose repeated runs all agreed
 * (trivially 1 when runsPerQuery is 1).
 */
export function calculateTriggerMetrics(
  suite: TriggerEvalSuite,
  decisions: TriggerDecision[],
): TriggerMetrics {
  let truePositives = 0;
  let falsePositives = 0;
  let trueNegatives = 0;
  let falseNegatives = 0;
  let stable = 0;

  for (const query of suite.queries) {
    const runs = decisionsForQuery(query.id, suite.runsPerQuery, decisions);
    if (runs.every((value) => value === runs[0])) {
      stable += 1;
    }
    for (const triggered of runs) {
      if (query.expected === 'should-trigger') {
        if (triggered) truePositives++;
        else falseNegatives++;
      } else if (triggered) {
        falsePositives++;
      } else {
        trueNegatives++;
      }
    }
  }

  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  return {
    truePositives,
    falsePositives,
    trueNegatives,
    falseNegatives,
    precision,
    recall,
    specificity: ratio(trueNegatives, trueNegatives + falsePositives),
    f1: ratio(2 * precision * recall, precision + recall),
    stability: ratio(stable, suite.queries.length),
    queryCount: suite.queries.length,
    runsPerQuery: suite.runsPerQuery,
  };
}

/** Returns the decision per run index, requiring exactly one for each run. */
function decisionsForQuery(
  queryId: string,
  runsPerQuery: number,
  decisions: TriggerDecision[],
): boolean[] {
  const byRun = new Map<number, boolean>();
  for (const decision of decisions) {
    if (decision.queryId !== queryId) continue;
    if (byRun.has(decision.run)) {
      throw new Error(`Duplicate decision for ${queryId} run ${decision.run}.`);
    }
    byRun.set(decision.run, decision.triggered);
  }
  const runs: boolean[] = [];
  for (let run = 0; run < runsPerQuery; run++) {
    const triggered = byRun.get(run);
    if (triggered === undefined) {
      throw new Error(`Missing recorded runs for ${queryId}.`);
    }
    runs.push(triggered);
  }
  if (byRun.size > runsPerQuery) {
    throw new Error(`Unexpected extra runs recorded for ${queryId}.`);
  }
  return runs;
}
