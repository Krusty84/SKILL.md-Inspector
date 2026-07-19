import { describe, it, expect } from 'vitest';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';
import { genericProfile } from '../src/profiles/genericProfile';
import { codexProfile } from '../src/profiles/codexProfile';
import type { SkillProfile } from '../src/types/SkillProfile';

// Complete and front-loaded, but with NO "Do not use when..." boundary.
const NO_BOUNDARY =
  'Format inspection reports using company layout rules. Use when standardizing PDF reports.';

const opts = (p: SkillProfile) => ({
  minLength: p.description.minLength,
  maxLength: p.description.maxLength,
  weights: p.description.weights,
});

describe('profile-dependent static-description-quality weights', () => {
  it('lets the generic profile reach excellent without a boundary', () => {
    const result = computeStaticDescriptionQuality(NO_BOUNDARY, opts(genericProfile));
    expect(result.findings.find((f) => f.criterion === 'Boundary phrase')?.pointsEarned).toBe(0);
    expect(result.gradeLimitations.some((limitation) => limitation.code.includes('boundary'))).toBe(false);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.label).toBe('excellent');
  });

  it('caps the Generic engineering-report regression despite its raw score of 75', () => {
    const result = computeStaticDescriptionQuality(
      'Format technical engineering reports using company layout rules.',
      opts(genericProfile),
    );

    expect(result.rawScore).toBe(75);
    expect(result.adjustedScore).toBeLessThanOrEqual(69);
    expect(result.label).toBe('acceptable');
  });

  it('weights the missing boundary more heavily under codex', () => {
    const generic = computeStaticDescriptionQuality(NO_BOUNDARY, opts(genericProfile));
    const codex = computeStaticDescriptionQuality(NO_BOUNDARY, opts(codexProfile));
    if (generic.state !== 'scored' || codex.state !== 'scored') {
      throw new Error('Expected valid descriptions to be scored');
    }
    expect(codex.score).toBeLessThan(generic.score);
    expect(codex.label).not.toBe('excellent');
  });

  it('normalizes weights that do not sum to 100', () => {
    const doubled = {
      actionVerb: 40,
      triggerPhrase: 40,
      concreteArtifact: 30,
      boundary: 30,
      frontLoaded: 20,
      lowVagueness: 20,
      goodLength: 20, // sum = 200
    };
    const full =
      'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.';
    expect(computeStaticDescriptionQuality(full, { weights: doubled }).score).toBe(100);
  });

  it('integerizes fractional normalized weights so findings sum to the score', () => {
    const ones = {
      actionVerb: 1,
      triggerPhrase: 1,
      concreteArtifact: 1,
      boundary: 1,
      frontLoaded: 1,
      lowVagueness: 1,
      goodLength: 1, // 100/7 is fractional for every criterion
    };
    const full =
      'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.';
    const result = computeStaticDescriptionQuality(full, { weights: ones });
    expect(result.score).toBe(100);
    expect(result.findings.reduce((sum, f) => sum + f.pointsEarned, 0)).toBe(result.rawScore);
    expect(result.findings.reduce((sum, f) => sum + f.pointsPossible, 0)).toBe(100);
    expect(result.findings.every((f) => Number.isInteger(f.pointsPossible))).toBe(true);
  });
});
