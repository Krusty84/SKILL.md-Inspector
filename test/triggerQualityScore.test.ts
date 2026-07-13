import { describe, it, expect } from 'vitest';
import { computeTriggerQuality, labelFor } from '../src/quality/triggerQualityScore';

const EXCELLENT =
  'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.';

describe('computeTriggerQuality', () => {
  it('gives full marks to a complete, trigger-friendly description', () => {
    const result = computeTriggerQuality(EXCELLENT);
    expect(result.score).toBe(100);
    expect(result.label).toBe('excellent');
    expect(result.findings).toHaveLength(7);
    for (const f of result.findings) {
      expect(f.pointsEarned).toBe(f.pointsPossible);
    }
  });

  it('scores the vague example from the brief as poor', () => {
    const result = computeTriggerQuality('Helps with documents.');
    expect(result.label).toBe('poor');
    expect(result.score).toBeLessThan(40);
  });

  it('awards points per criterion and never exceeds 100', () => {
    const result = computeTriggerQuality('Format reports.');
    const verb = result.findings.find((f) => f.criterion.startsWith('Action verb'));
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    expect(verb?.pointsEarned).toBe(20);
    expect(trigger?.pointsEarned).toBe(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('does not award trigger points to a negative-only description', () => {
    const result = computeTriggerQuality('Format reports. Do not use when handling PDFs.');
    const verb = result.findings.find((f) => f.criterion.startsWith('Action verb'));
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    const boundary = result.findings.find((f) => f.criterion === 'Boundary phrase');
    expect(verb?.pointsEarned).toBe(20);
    expect(trigger?.pointsEarned).toBe(0);
    expect(boundary?.pointsEarned).toBe(15);
  });

  it('awards no artifact points for arbitrary uppercase words but still credits acronyms (Task 72)', () => {
    const artifactPoints = (desc: string): number =>
      computeTriggerQuality(desc).findings.find((f) => f.criterion.startsWith('Concrete artifact'))!
        .pointsEarned;
    // Regression: "any run of uppercase letters" used to count as a concrete artifact.
    expect(artifactPoints('Format IMPORTANT THINGS.')).toBe(0);
    expect(artifactPoints('Generate GOOD RESULTS.')).toBe(0);
    // A real acronym is still recognized as a concrete artifact.
    expect(artifactPoints('Format PDF files. Use when converting. Do not use for images.')).toBe(
      15,
    );
  });

  it('awards both trigger and boundary points for "only use when"', () => {
    const result = computeTriggerQuality(
      'Format release notes. Only use when preparing a tagged release.',
    );
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    const boundary = result.findings.find((f) => f.criterion === 'Boundary phrase');
    expect(trigger?.pointsEarned).toBe(20);
    expect(boundary?.pointsEarned).toBe(15);
  });

  it('deducts for vague wording', () => {
    const withVague = computeTriggerQuality('Format powerful reports. Use when needed.');
    const vagueFinding = withVague.findings.find((f) => f.criterion === 'Low vagueness');
    expect(vagueFinding?.pointsEarned).toBe(5);
  });

  it('respects a configurable minimum length', () => {
    const strict = computeTriggerQuality('Format inspection reports. Use when needed.', {
      minLength: 200,
    });
    const lengthFinding = strict.findings.find((f) => f.criterion === 'Good length');
    expect(lengthFinding?.pointsEarned).toBeLessThan(10);
  });

  it('penalizes length gradually and zeroes out over the maximum', () => {
    const good = (text: string) =>
      computeTriggerQuality(text).findings.find((f) => f.criterion === 'Good length')!.pointsEarned;
    expect(good('x'.repeat(501))).toBeGreaterThan(good('x'.repeat(1000)));
    expect(good('x'.repeat(1100))).toBe(0); // over the 1024 maximum
  });
});

describe('computeTriggerQuality language support', () => {
  const CYRILLIC = 'Форматировать инспекционные отчёты. Использовать когда нужно готовить.';

  it('flags a non-English description as partial in auto mode', () => {
    const result = computeTriggerQuality(CYRILLIC, { language: 'auto' });
    expect(result.partial).toBe(true);
    expect(result.findings.some((f) => f.criterion === 'Language support')).toBe(true);
  });

  it('does not flag English descriptions and keeps 7 findings', () => {
    const result = computeTriggerQuality(EXCELLENT, { language: 'auto' });
    expect(result.partial).toBeUndefined();
    expect(result.findings).toHaveLength(7);
  });

  it('forces English heuristics in "en" mode (no language finding)', () => {
    const result = computeTriggerQuality(CYRILLIC, { language: 'en' });
    expect(result.partial).toBeUndefined();
    expect(result.findings.some((f) => f.criterion === 'Language support')).toBe(false);
  });
});

describe('labelFor', () => {
  it.each([
    [100, 'excellent'],
    [90, 'excellent'],
    [89, 'good'],
    [75, 'good'],
    [74, 'acceptable'],
    [60, 'acceptable'],
    [59, 'weak'],
    [40, 'weak'],
    [39, 'poor'],
    [0, 'poor'],
  ])('%i -> %s', (score, label) => {
    expect(labelFor(score)).toBe(label);
  });
});
