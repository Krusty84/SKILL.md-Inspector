import type { TriggerEvalSuite } from './model';
export function parseEvalSuite(value: unknown): TriggerEvalSuite {
  if (!value || typeof value !== 'object') throw new Error('Evaluation suite must be an object.');
  const input = value as Record<string, unknown>;
  if (typeof input.skill !== 'string' || input.skill.length === 0) throw new Error('Evaluation suite requires skill.');
  if (!Array.isArray(input.queries) || input.queries.length === 0) throw new Error('Evaluation suite requires queries.');
  const runsPerQuery = input.runsPerQuery ?? 1;
  if (!Number.isInteger(runsPerQuery) || typeof runsPerQuery !== 'number' || runsPerQuery < 1) throw new Error('runsPerQuery must be a positive integer.');
  const queries = input.queries.map((query, index) => {
    if (!query || typeof query !== 'object') throw new Error(`Query ${index} must be an object.`);
    const q = query as Record<string, unknown>;
    if (typeof q.id !== 'string' || typeof q.prompt !== 'string' || (q.expected !== 'should-trigger' && q.expected !== 'should-not-trigger')) throw new Error(`Query ${index} is malformed.`);
    return { id: q.id, prompt: q.prompt, expected: q.expected as 'should-trigger' | 'should-not-trigger' };
  });
  return { skill: input.skill, queries, runsPerQuery };
}
