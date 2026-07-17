import type { TriggerDecision, TriggerEvalSuite, TriggerMetrics } from './model';
const ratio = (n: number, d: number) => d === 0 ? 0 : n / d;
export function calculateTriggerMetrics(suite: TriggerEvalSuite, decisions: TriggerDecision[]): TriggerMetrics {
  let truePositives = 0; let falsePositives = 0; let trueNegatives = 0; let falseNegatives = 0;
  let stable = 0;
  for (const query of suite.queries) {
    const runs = decisions.filter((decision) => decision.queryId === query.id).map((decision) => decision.triggered);
    if (runs.length !== suite.runsPerQuery) throw new Error(`Missing recorded runs for ${query.id}.`);
    if (runs.every((value) => value === runs[0])) stable += 1;
    for (const triggered of runs) {
      if (query.expected === 'should-trigger') { if (triggered) truePositives++; else falseNegatives++; }
      else if (triggered) falsePositives++; else trueNegatives++;
    }
  }
  const precision = ratio(truePositives, truePositives + falsePositives);
  const recall = ratio(truePositives, truePositives + falseNegatives);
  return { truePositives, falsePositives, trueNegatives, falseNegatives, precision, recall, specificity: ratio(trueNegatives, trueNegatives + falsePositives), f1: ratio(2 * precision * recall, precision + recall), stability: ratio(stable, suite.queries.length), queryCount: suite.queries.length, runsPerQuery: suite.runsPerQuery };
}
