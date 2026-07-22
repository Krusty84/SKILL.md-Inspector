import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { computeStaticDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import { analyzeDescription } from '../../src/quality/descriptionHeuristics';
import type { ScopeClauseAnalysis } from '../../src/quality/descriptionHeuristics';
import { genericProfile } from '../../src/profiles';
import type { StaticDescriptionQualityGradeLimitationCode } from '../../src/types/StaticDescriptionQuality';

type ClauseExpectation = 'full' | 'partial' | 'none';

interface Case {
  id: string;
  language: string;
  description: string;
  expected: {
    minScore: number;
    maxScore: number;
    minRawScore?: number;
    maxRawScore?: number;
    gradeLimitations?: StaticDescriptionQualityGradeLimitationCode[];
    trigger: ClauseExpectation;
    boundary: ClauseExpectation;
    frontLoaded: boolean;
  };
  notes: string;
}

const cases: Case[] = JSON.parse(
  readFileSync('benchmarks/static-description-quality/cases.json', 'utf8'),
);

/** Widest tolerated expectation band. A 0–100 band can detect no regression. */
const MAX_BAND_WIDTH = 25;

const clauseState = (clause: ScopeClauseAnalysis): ClauseExpectation =>
  clause.contentFound ? 'full' : clause.markerFound ? 'partial' : 'none';

describe('static description quality benchmark', () => {
  it('contains a broad curated corpus', () => {
    expect(cases.length).toBeGreaterThanOrEqual(45);
  });

  it('keeps every expectation band narrow enough to catch regressions', () => {
    for (const item of cases) {
      expect(item.expected.maxScore - item.expected.minScore, item.id).toBeLessThanOrEqual(
        MAX_BAND_WIDTH,
      );
    }
  });

  for (const item of cases) {
    it(`${item.id}: ${item.notes}`, () => {
      const profile = genericProfile;
      const result = computeStaticDescriptionQuality(item.description, {
        minLength: profile.description.minLength,
        maxLength: profile.description.maxLength,
        language: profile.description.language,
        weights: profile.description.weights,
      });
      const analysis = analyzeDescription(item.description);

      expect(result.score).toBeGreaterThanOrEqual(item.expected.minScore);
      expect(result.score).toBeLessThanOrEqual(item.expected.maxScore);
      expect(result.rawScore).toBeGreaterThanOrEqual(item.expected.minRawScore ?? 0);
      expect(result.rawScore).toBeLessThanOrEqual(item.expected.maxRawScore ?? 100);
      if (item.expected.gradeLimitations) {
        expect(result.gradeLimitations.map((limitation) => limitation.code)).toEqual(
          item.expected.gradeLimitations,
        );
      }
      expect(clauseState(analysis.triggerClause)).toBe(item.expected.trigger);
      expect(clauseState(analysis.boundaryClause)).toBe(item.expected.boundary);
      expect(analysis.frontLoadedIntent.found).toBe(item.expected.frontLoaded);

      if (item.language !== 'en') {
        // Non-English text must be reported as language-limited, never silently
        // scored as though the English dictionaries applied.
        expect(result.partial).toBe(true);
        expect(result.coverage).toBe('low');
      }
    });
  }
});
