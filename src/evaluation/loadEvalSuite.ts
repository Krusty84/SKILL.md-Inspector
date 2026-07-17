import type { TriggerEvalSuite, TriggerQuery } from './model';

/**
 * Validates and normalizes a parsed suite file (JSON already decoded). Throws
 * a descriptive error on the first malformed field so authors can fix suites
 * without spelunking through stack traces.
 */
export function parseEvalSuite(value: unknown): TriggerEvalSuite {
  if (!value || typeof value !== 'object') {
    throw new Error('Evaluation suite must be an object.');
  }
  const input = value as Record<string, unknown>;

  if (typeof input.skill !== 'string' || input.skill.length === 0) {
    throw new Error('Evaluation suite requires skill.');
  }
  if (!Array.isArray(input.queries) || input.queries.length === 0) {
    throw new Error('Evaluation suite requires queries.');
  }

  const runsPerQuery = input.runsPerQuery ?? 1;
  if (typeof runsPerQuery !== 'number' || !Number.isInteger(runsPerQuery) || runsPerQuery < 1) {
    throw new Error('runsPerQuery must be a positive integer.');
  }

  const seenIds = new Set<string>();
  const queries: TriggerQuery[] = input.queries.map((query, index) => {
    if (!query || typeof query !== 'object') {
      throw new Error(`Query ${index} must be an object.`);
    }
    const q = query as Record<string, unknown>;
    if (typeof q.id !== 'string' || q.id.length === 0) {
      throw new Error(`Query ${index} requires a non-empty string id.`);
    }
    if (typeof q.prompt !== 'string' || q.prompt.length === 0) {
      throw new Error(`Query "${q.id}" requires a non-empty prompt.`);
    }
    if (q.expected !== 'should-trigger' && q.expected !== 'should-not-trigger') {
      throw new Error(
        `Query "${q.id}" has invalid expected value; use "should-trigger" or "should-not-trigger".`,
      );
    }
    if (seenIds.has(q.id)) {
      throw new Error(`Duplicate query id "${q.id}"; metrics require unique ids.`);
    }
    seenIds.add(q.id);
    return { id: q.id, prompt: q.prompt, expected: q.expected };
  });

  return { skill: input.skill, queries, runsPerQuery };
}
