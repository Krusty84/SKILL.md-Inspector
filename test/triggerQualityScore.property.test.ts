import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { computeTriggerQuality } from '../src/quality/triggerQualityScore';

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

describe('computeTriggerQuality invariants (Task 67)', () => {
  it('always yields an integer 0..100 whose finding points sum to the score', () => {
    fc.assert(
      fc.property(anyText, (desc) => {
        const result = computeTriggerQuality(desc);
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

  it('does not throw on empty, very long, or unicode descriptions', () => {
    for (const desc of ['', 'x'.repeat(10000), '📄'.repeat(500), 'Отчёт '.repeat(300)]) {
      expect(() => computeTriggerQuality(desc)).not.toThrow();
      const result = computeTriggerQuality(desc);
      expect(result.score).toBeGreaterThanOrEqual(0);
      expect(result.score).toBeLessThanOrEqual(100);
    }
  });
});
