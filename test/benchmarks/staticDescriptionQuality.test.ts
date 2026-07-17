import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeStaticDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import { analyzeDescription } from '../../src/quality/descriptionHeuristics';
type Case = { id: string; description: string; expected: { minScore: number; maxScore: number; trigger: 'full' | 'none'; boundary: 'full' | 'none'; frontLoaded: boolean } };
const cases: Case[] = JSON.parse(readFileSync('benchmarks/static-description-quality/cases.json', 'utf8'));
describe('static description quality benchmark', () => {
 it('contains a broad curated corpus', () => expect(cases.length).toBeGreaterThanOrEqual(60));
 for (const item of cases) it(item.id, () => { const result = computeStaticDescriptionQuality(item.description); const analysis = analyzeDescription(item.description); expect(result.score).toBeGreaterThanOrEqual(item.expected.minScore); expect(result.score).toBeLessThanOrEqual(item.expected.maxScore); expect(typeof analysis.triggerClause.contentFound).toBe('boolean'); expect(typeof analysis.boundaryClause.contentFound).toBe('boolean'); expect(typeof analysis.frontLoadedIntent.found).toBe('boolean'); });
});
