import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';

// Random strings plus explicit empty / very-long / unicode edge cases.
const anyText = fc.oneof(
  fc.string(),
  fc.constantFrom(
    '',
    'x'.repeat(4000),
    'Форматировать инспекционные отчёты. Использовать когда нужно.',
    '📄 report 😀 generate 🚀',
    '日本語のテキスト',
    'a\tb\nc\r\nd',
  ),
);

/**
 * `rawScore` is the additive sum of the findings whenever every criterion could
 * be evaluated. Plan 15 Part F marks the five English-dictionary criteria as
 * *not applicable* (0 of 0) on a description the dictionaries cannot read, so
 * there the score is the share of the applicable weight that was earned —
 * scoring an unmeasured criterion as a failure was what capped a well-formed
 * Chinese description at 35/poor. This states the invariant in the form that
 * covers both.
 */
function expectRawScoreMatchesFindings(result: {
  rawScore: number | null;
  findings: ReadonlyArray<{ pointsEarned: number; pointsPossible: number }>;
}): void {
  const earned = result.findings.reduce((total, f) => total + f.pointsEarned, 0);
  const possible = result.findings.reduce((total, f) => total + f.pointsPossible, 0);
  const expected =
    possible === 0 ? 0 : possible === 100 ? Math.round(earned) : Math.round((100 * earned) / possible);
  expect(result.rawScore).toBe(Math.max(0, Math.min(100, expected)));
}

describe('computeStaticDescriptionQuality invariants (Task 67)', () => {
  it('always yields 0 <= score <= rawScore <= 100 and findings sum to rawScore', () => {
    fc.assert(
      fc.property(anyText, (desc) => {
        const result = computeStaticDescriptionQuality(desc);
        if (desc.trim() === '') {
          expect(result).toMatchObject({ state: 'not-scored', score: null, rawScore: null });
          return;
        }
        if (result.state !== 'scored') {
          throw new Error('Expected a non-empty description to be scored');
        }
        expect(Number.isInteger(result.score)).toBe(true);
        expect(Number.isInteger(result.rawScore)).toBe(true);
        expect(result.score).toBe(result.adjustedScore);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(result.rawScore);
        expect(result.rawScore).toBeLessThanOrEqual(100);

        expectRawScoreMatchesFindings(result);

        for (const finding of result.findings) {
          expect(finding.pointsEarned).toBeGreaterThanOrEqual(0);
          expect(finding.pointsEarned).toBeLessThanOrEqual(finding.pointsPossible);
        }
      }),
    );
  });

  it('holds the sum invariant under custom weights that do not sum to 100', () => {
    const weightSet = fc
      .record({
        actionVerb: fc.integer({ min: 0, max: 40 }),
        triggerPhrase: fc.integer({ min: 0, max: 40 }),
        concreteArtifact: fc.integer({ min: 0, max: 40 }),
        boundary: fc.integer({ min: 0, max: 40 }),
        frontLoaded: fc.integer({ min: 0, max: 40 }),
        lowVagueness: fc.integer({ min: 0, max: 40 }),
        goodLength: fc.integer({ min: 0, max: 40 }),
      })
      .filter((weights) => Object.values(weights).some((value) => value > 0));

    fc.assert(
      fc.property(anyText, weightSet, (desc, weights) => {
        const result = computeStaticDescriptionQuality(desc, { weights });
        if (desc.trim() === '') {
          expect(result).toMatchObject({ state: 'not-scored', score: null, rawScore: null });
          return;
        }
        if (result.state !== 'scored') {
          throw new Error('Expected a non-empty description to be scored');
        }
        expect(Number.isInteger(result.score)).toBe(true);
        expect(Number.isInteger(result.rawScore)).toBe(true);
        expect(result.score).toBe(result.adjustedScore);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(result.rawScore);
        expect(result.rawScore).toBeLessThanOrEqual(100);
        expectRawScoreMatchesFindings(result);
        // 100 when every criterion applies; less when some were skipped as
        // not-applicable, which only happens on a language-limited description.
        const possible = result.findings.reduce((total, f) => total + f.pointsPossible, 0);
        expect(possible).toBeLessThanOrEqual(100);
        expect(result.partial === true || possible === 100).toBe(true);
        for (const finding of result.findings) {
          expect(Number.isInteger(finding.pointsEarned)).toBe(true);
          expect(finding.pointsEarned).toBeGreaterThanOrEqual(0);
          expect(finding.pointsEarned).toBeLessThanOrEqual(finding.pointsPossible);
        }
      }),
    );
  });

  it('does not throw on empty, very long, or unicode descriptions', () => {
    for (const desc of ['', 'x'.repeat(10000), '📄'.repeat(500), 'Отчёт '.repeat(300)]) {
      expect(() => computeStaticDescriptionQuality(desc)).not.toThrow();
      const result = computeStaticDescriptionQuality(desc);
      if (result.state === 'not-scored') {
        expect(desc.trim()).toBe('');
        expect(result.score).toBeNull();
        continue;
      }
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
