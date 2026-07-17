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

describe('profile-dependent trigger-quality weights', () => {
  it('lets the generic profile reach excellent without a boundary', () => {
    const result = computeStaticDescriptionQuality(NO_BOUNDARY, opts(genericProfile));
    expect(result.findings.find((f) => f.criterion === 'Boundary phrase')?.pointsEarned).toBe(0);
    expect(result.score).toBeGreaterThanOrEqual(90);
    expect(result.label).toBe('excellent');
  });

  it('weights the missing boundary more heavily under codex', () => {
    const generic = computeStaticDescriptionQuality(NO_BOUNDARY, opts(genericProfile));
    const codex = computeStaticDescriptionQuality(NO_BOUNDARY, opts(codexProfile));
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
    expect(computeStaticDescriptionQuality(full, { weights: doubled }).score).toBeCloseTo(100, 5);
  });
});
