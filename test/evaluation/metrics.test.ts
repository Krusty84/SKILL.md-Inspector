import { describe, expect, it } from 'vitest';
import { parseEvalSuite } from '../../src/evaluation/loadEvalSuite';
import { calculateTriggerMetrics } from '../../src/evaluation/metrics';
describe('behavioral trigger metrics', () => {
 const suite = parseEvalSuite({ skill: './SKILL.md', runsPerQuery: 1, queries: [{ id: 'tp', prompt: 'a', expected: 'should-trigger' }, { id: 'fn', prompt: 'b', expected: 'should-trigger' }, { id: 'fp', prompt: 'c', expected: 'should-not-trigger' }, { id: 'tn', prompt: 'd', expected: 'should-not-trigger' }] });
 it('calculates a known confusion matrix', () => { const m = calculateTriggerMetrics(suite, [{queryId:'tp',run:0,triggered:true},{queryId:'fn',run:0,triggered:false},{queryId:'fp',run:0,triggered:true},{queryId:'tn',run:0,triggered:false}]); expect(m).toMatchObject({truePositives:1,falseNegatives:1,falsePositives:1,trueNegatives:1,precision:.5,recall:.5,specificity:.5,f1:.5,stability:1}); });
 it('rejects malformed suites', () => expect(() => parseEvalSuite({})).toThrow());
});
