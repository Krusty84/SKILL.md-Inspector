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

describe('computeStaticDescriptionQuality invariants (Task 67)', () => {
  it('always yields an integer 0..100 whose finding points sum to the score', () => {
    fc.assert(
      fc.property(anyText, (desc) => {
        const result = computeStaticDescriptionQuality(desc);
        expect(Number.isInteger(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);

        const sum = result.findings.reduce((total, f) => total + f.pointsEarned, 0);
        expect(sum).toBe(result.score);

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
        expect(Number.isInteger(result.score)).toBe(true);
        expect(result.score).toBeGreaterThanOrEqual(0);
        expect(result.score).toBeLessThanOrEqual(100);
        expect(result.findings.reduce((total, f) => total + f.pointsEarned, 0)).toBe(result.score);
        expect(result.findings.reduce((total, f) => total + f.pointsPossible, 0)).toBe(100);
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
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
