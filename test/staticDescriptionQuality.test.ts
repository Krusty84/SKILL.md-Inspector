import { describe, it, expect } from 'vitest';
import { computeStaticDescriptionQuality, labelFor } from '../src/quality/staticDescriptionQuality';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
} from '../src/quality/dictionaries';

const EXCELLENT =
  'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.';

describe('computeStaticDescriptionQuality', () => {
  it('gives full marks to a complete, trigger-friendly description', () => {
    const result = computeStaticDescriptionQuality(EXCELLENT);
    expect(result.score).toBe(100);
    expect(result.rawScore).toBe(100);
    expect(result.adjustedScore).toBe(100);
    expect(result.label).toBe('excellent');
    expect(result.gradeLimitations).toEqual([]);
    expect(result.findings).toHaveLength(7);
    for (const f of result.findings) {
      expect(f.pointsEarned).toBe(f.pointsPossible);
    }
  });

  it('scores the vague example from the brief as poor', () => {
    const result = computeStaticDescriptionQuality('Helps with documents.');
    expect(result.label).toBe('poor');
    expect(result.score).toBeLessThan(40);
  });

  it('awards points per criterion and never exceeds 100', () => {
    const result = computeStaticDescriptionQuality('Format reports.');
    const verb = result.findings.find((f) => f.criterion.startsWith('Action verb'));
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    expect(verb?.pointsEarned).toBe(20);
    expect(trigger?.pointsEarned).toBe(0);
    expect(result.score).toBeGreaterThan(0);
    expect(result.score).toBeLessThanOrEqual(100);
  });

  it('does not award trigger points to a negative-only description', () => {
    const result = computeStaticDescriptionQuality(
      'Format reports. Do not use when handling PDFs.',
    );
    const verb = result.findings.find((f) => f.criterion.startsWith('Action verb'));
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    const boundary = result.findings.find((f) => f.criterion === 'Boundary phrase');
    expect(verb?.pointsEarned).toBe(20);
    expect(trigger?.pointsEarned).toBe(0);
    expect(boundary?.pointsEarned).toBe(15);
  });

  it('awards no artifact points for arbitrary uppercase words but still credits acronyms (Task 72)', () => {
    const artifactPoints = (desc: string): number =>
      computeStaticDescriptionQuality(desc).findings.find((f) =>
        f.criterion.startsWith('Concrete artifact'),
      )!.pointsEarned;
    // Regression: "any run of uppercase letters" used to count as a concrete artifact.
    expect(artifactPoints('Format IMPORTANT THINGS.')).toBe(0);
    expect(artifactPoints('Generate GOOD RESULTS.')).toBe(0);
    // A real acronym is still recognized as a concrete artifact.
    expect(artifactPoints('Format PDF files. Use when converting. Do not use for images.')).toBe(
      15,
    );
  });

  it('credits the canonical "Use this skill when ..." trigger form', () => {
    const result = computeStaticDescriptionQuality(
      'Generate PDF reports from customer invoices. Use this skill when preparing customer reports. Do not use for scanned images.',
    );
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    expect(trigger?.pointsEarned).toBe(20);
    expect(result.score).toBe(100);
  });

  it('credits "Trigger when the user ..." as a usage trigger', () => {
    const trigger = computeStaticDescriptionQuality(
      'Trigger when the user asks to convert CSV files to JSON.',
    ).findings.find((f) => f.criterion === 'Usage trigger phrase');
    expect(trigger?.pointsEarned).toBe(20);
  });

  it('does not credit "Not intended for ..." as a positive trigger', () => {
    const result = computeStaticDescriptionQuality(
      'Formats SQL queries for readability. Not intended for query optimization.',
    );
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    const boundary = result.findings.find((f) => f.criterion === 'Boundary phrase');
    expect(trigger?.pointsEarned).toBe(0);
    expect(boundary?.pointsEarned).toBe(15);
  });

  it('accepts a single concrete artifact as trigger scope content ("Use for SQL.")', () => {
    const trigger = computeStaticDescriptionQuality('Format reports. Use for SQL.').findings.find(
      (f) => f.criterion === 'Usage trigger phrase',
    );
    expect(trigger?.pointsEarned).toBe(20);
  });

  it('gives only partial credit when the trigger scope is vague', () => {
    const result = computeStaticDescriptionQuality('Analyze logs. Use when appropriate for tasks.');
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    expect(trigger?.pointsEarned).toBe(5); // marker present, content too vague
    expect(result.adjustedScore).toBeLessThanOrEqual(74);
    expect(result.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'vague-usage-trigger', ceiling: 74 }),
    );
  });

  it('keeps additive evidence in rawScore but caps a missing concrete trigger at 69', () => {
    const result = computeStaticDescriptionQuality(
      'Format technical engineering reports using company layout rules.',
      {
        weights: {
          actionVerb: 20,
          triggerPhrase: 20,
          concreteArtifact: 20,
          boundary: 5,
          frontLoaded: 10,
          lowVagueness: 10,
          goodLength: 15,
        },
      },
    );

    expect(result.rawScore).toBe(75);
    expect(result.adjustedScore).toBe(69);
    expect(result.score).toBe(result.adjustedScore);
    expect(result.label).toBe('acceptable');
    expect(result.findings.reduce((sum, finding) => sum + finding.pointsEarned, 0)).toBe(
      result.rawScore,
    );
    expect(result.gradeLimitations).toEqual([
      expect.objectContaining({ code: 'missing-usage-trigger', ceiling: 69 }),
    ]);
    expect(result.gradeLimitations[0].reason).toContain('69');
  });

  it('caps descriptions without an action capability or concrete artifact at 59', () => {
    const noAction = computeStaticDescriptionQuality(
      'PDF reports for customer audits. Use when customer audit packages are due. Do not use for invoices.',
    );
    const noArtifact = computeStaticDescriptionQuality(
      'Format useful material carefully. Use when preparing a detailed customer delivery. Do not use for internal work.',
    );

    expect(noAction.adjustedScore).toBeLessThanOrEqual(59);
    expect(noAction.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'missing-action-capability', ceiling: 59 }),
    );
    expect(noArtifact.adjustedScore).toBeLessThanOrEqual(59);
    expect(noArtifact.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'missing-concrete-artifact', ceiling: 59 }),
    );
  });

  it('reports and applies the overbroad usage-scope ceiling', () => {
    const result = computeStaticDescriptionQuality(
      'Format inspection reports using standard rules. Always use this skill for everything involving reports. Do not use for invoices.',
    );
    expect(result.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'overbroad-usage-scope', ceiling: 69 }),
    );
    expect(result.adjustedScore).toBeLessThanOrEqual(69);
    expect(
      result.gradeLimitations.find((limitation) => limitation.code === 'overbroad-usage-scope')
        ?.reason,
    ).toContain('69');
  });

  it('reports and applies the instruction-heavy description ceiling', () => {
    const result = computeStaticDescriptionQuality(
      'Generate PDF reports. Step 1, inspect data. Step 2, validate rows. Step 3, format tables. Step 4, export PDF. Use when preparing audits. Do not use for invoices.',
    );
    expect(result.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'instruction-heavy-description', ceiling: 74 }),
    );
    expect(result.adjustedScore).toBeLessThanOrEqual(74);
    expect(
      result.gradeLimitations.find(
        (limitation) => limitation.code === 'instruction-heavy-description',
      )?.reason,
    ).toContain('Markdown body');
  });

  it('awards both trigger and boundary points for "only use when"', () => {
    const result = computeStaticDescriptionQuality(
      'Format release notes. Only use when preparing a tagged release.',
    );
    const trigger = result.findings.find((f) => f.criterion === 'Usage trigger phrase');
    const boundary = result.findings.find((f) => f.criterion === 'Boundary phrase');
    expect(trigger?.pointsEarned).toBe(20);
    expect(boundary?.pointsEarned).toBe(15);
  });

  it('deducts for vague wording', () => {
    const withVague = computeStaticDescriptionQuality('Format powerful reports. Use when needed.');
    const vagueFinding = withVague.findings.find((f) => f.criterion === 'Low vagueness');
    expect(vagueFinding?.pointsEarned).toBe(5);
  });

  it('applies custom vague and boundary dictionaries to scoring', () => {
    const vague = resolveHeuristicDictionaries({
      vagueTerms: [...DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms, 'calibrated'],
    });
    const customVague = computeStaticDescriptionQuality(
      'Format calibrated reports. Use when audits drift. Do not use for invoices.',
      { dictionaries: vague },
    );
    expect(customVague.findings.find((f) => f.criterion === 'Low vagueness')?.pointsEarned).toBe(5);

    const noPowerful = resolveHeuristicDictionaries({
      vagueTerms: DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms.filter((term) => term !== 'powerful'),
    });
    expect(
      computeStaticDescriptionQuality('Format powerful reports.', {
        dictionaries: noPowerful,
      }).findings.find((f) => f.criterion === 'Low vagueness')?.pointsEarned,
    ).toBe(10);

    const boundary = resolveHeuristicDictionaries({
      restrictiveBoundaryPhrases: [
        ...DEFAULT_HEURISTIC_DICTIONARIES.restrictiveBoundaryPhrases,
        'reserved for',
      ],
    });
    expect(
      computeStaticDescriptionQuality(
        'Format inspection reports. Use when audits drift. Reserved for audited releases.',
        { dictionaries: boundary },
      ).findings.find((f) => f.criterion === 'Boundary phrase')?.pointsEarned,
    ).toBe(15);
  });

  it('lets a custom artifact hint change artifact points and the adjusted score', () => {
    const description = 'Analyze widgets carefully. Use when widget calibration drifts.';
    const before = computeStaticDescriptionQuality(description);
    const dictionaries = resolveHeuristicDictionaries({
      artifactHints: [...DEFAULT_HEURISTIC_DICTIONARIES.artifactHints, 'widget'],
    });
    const after = computeStaticDescriptionQuality(description, { dictionaries });
    if (before.state !== 'scored' || after.state !== 'scored') {
      throw new Error('Expected valid descriptions to be scored');
    }
    expect(
      before.findings.find((f) => f.criterion === 'Concrete artifact / domain')?.pointsEarned,
    ).toBe(0);
    expect(
      after.findings.find((f) => f.criterion === 'Concrete artifact / domain')?.pointsEarned,
    ).toBe(15);
    expect(after.adjustedScore).toBeGreaterThan(before.adjustedScore);
  });

  it('respects a configurable minimum length', () => {
    const strict = computeStaticDescriptionQuality('Format inspection reports. Use when needed.', {
      minLength: 200,
    });
    const lengthFinding = strict.findings.find((f) => f.criterion === 'Good length');
    expect(lengthFinding?.pointsEarned).toBeLessThan(10);
  });

  it('penalizes length gradually and zeroes out over the maximum', () => {
    const good = (text: string) =>
      computeStaticDescriptionQuality(text).findings.find((f) => f.criterion === 'Good length')!
        .pointsEarned;
    expect(good('x'.repeat(501))).toBeGreaterThan(good('x'.repeat(1000)));
    expect(good('x'.repeat(1100))).toBe(0); // over the 1024 maximum
  });

  it('caps the full-credit band at a smaller configured maximum', () => {
    const goodLengthPoints = (length: number) =>
      computeStaticDescriptionQuality('x'.repeat(length), {
        minLength: 40,
        maxLength: 100,
      }).findings.find((finding) => finding.criterion === 'Good length')!.pointsEarned;

    expect(goodLengthPoints(100)).toBe(10);
    expect(goodLengthPoints(101)).toBe(0);
    expect(goodLengthPoints(166)).toBe(0);
  });

  it('keeps graduated penalties between 500 and a larger configured maximum', () => {
    const goodLengthPoints = (length: number) =>
      computeStaticDescriptionQuality('x'.repeat(length), {
        minLength: 40,
        maxLength: 700,
      }).findings.find((finding) => finding.criterion === 'Good length')!.pointsEarned;

    expect(goodLengthPoints(500)).toBe(10);
    expect(goodLengthPoints(501)).toBe(6);
    expect(goodLengthPoints(700)).toBe(3);
    expect(goodLengthPoints(701)).toBe(0);
  });

  it('keeps the recommended band coherent when minLength exceeds the default ceiling', () => {
    const atMin = computeStaticDescriptionQuality('x'.repeat(600), {
      minLength: 600,
      maxLength: 2048,
    });
    expect(atMin.findings.find((f) => f.criterion === 'Good length')?.pointsEarned).toBe(10);

    const short = computeStaticDescriptionQuality('x'.repeat(550), {
      minLength: 600,
      maxLength: 2048,
    });
    const shortFinding = short.findings.find((f) => f.criterion === 'Good length')!;
    expect(shortFinding.pointsEarned).toBe(5); // slightly short, not "over the ceiling"
    expect(shortFinding.message).toContain('600–600'); // never an inverted "600–500" band
  });
});

describe('computeStaticDescriptionQuality language support', () => {
  const CYRILLIC = 'Форматировать инспекционные отчёты. Использовать когда нужно готовить.';

  it('flags a non-English description as partial in auto mode', () => {
    const result = computeStaticDescriptionQuality(CYRILLIC, { language: 'auto' });
    expect(result.partial).toBe(true);
    expect(result.findings.some((f) => f.criterion === 'Language support')).toBe(true);
  });

  it('does not flag English descriptions and keeps 7 findings', () => {
    const result = computeStaticDescriptionQuality(EXCELLENT, { language: 'auto' });
    expect(result.partial).toBeUndefined();
    expect(result.findings).toHaveLength(7);
  });

  it('forces English heuristics in "en" mode (no language finding)', () => {
    const result = computeStaticDescriptionQuality(CYRILLIC, { language: 'en' });
    expect(result.partial).toBeUndefined();
    expect(result.findings.some((f) => f.criterion === 'Language support')).toBe(false);
  });
});

describe('computeStaticDescriptionQuality coverage (Task 79)', () => {
  it('is high for a sufficient English description with no limitations', () => {
    const result = computeStaticDescriptionQuality(EXCELLENT);
    expect(result.coverage).toBe('high');
    expect(result.limitations).toEqual([]);
  });

  it('is low for a non-English description and lists a limitation', () => {
    const result = computeStaticDescriptionQuality(
      'Форматировать инспекционные отчёты. Использовать когда нужно готовить.',
      { language: 'auto' },
    );
    expect(result.coverage).toBe('low');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('retains low coverage while marking an empty description not scored', () => {
    const result = computeStaticDescriptionQuality('');
    expect(result.state).toBe('not-scored');
    expect(result.score).toBeNull();
    expect(result.coverage).toBe('low');
    expect(result.limitations.length).toBeGreaterThan(0);
  });

  it('is medium for a short English description below the recommended minimum', () => {
    const result = computeStaticDescriptionQuality('Format reports.');
    expect(result.coverage).toBe('medium');
    expect(result.limitations.some((l) => l.toLowerCase().includes('minimum'))).toBe(true);
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
