import { describe, it, expect } from 'vitest';
import { detectCollisions, riskFor } from '../src/workspace/detectSkillCollisions';

describe('detectCollisions', () => {
  const skills = [
    {
      name: 'pdf-report-formatter',
      description:
        'Format technical PDF reports using company layout rules. Use when asked to standardize inspection reports.',
    },
    {
      name: 'engineering-report-formatter',
      description:
        'Format technical engineering reports using company layout rules. Use when asked to standardize inspection reports.',
    },
    {
      name: 'release-notes-generator',
      description:
        'Generate release notes from git commit history when preparing a version release.',
    },
  ];

  it('flags the two overlapping report formatters and nothing else', () => {
    const collisions = detectCollisions(skills);
    expect(collisions).toHaveLength(1);
    const [collision] = collisions;
    expect([collision.a, collision.b].sort()).toEqual([
      'engineering-report-formatter',
      'pdf-report-formatter',
    ]);
    expect(collision.risk === 'High' || collision.risk === 'Medium').toBe(true);
    // Shared terms are normalized (reports -> report) so plural variants collide.
    expect(collision.sharedTerms).toEqual(expect.arrayContaining(['report', 'format']));
    expect(collision.recommendation.length).toBeGreaterThan(0);
    // The result carries the individual metric breakdown, incl. both TF-IDF and Jaccard.
    expect(collision.metrics.cosine).toBeGreaterThan(0);
    expect(collision.metrics.jaccard).toBeGreaterThan(0);
    expect(collision.metrics.charNgram).toBeGreaterThan(0);
  });

  it('returns nothing for a single skill', () => {
    expect(detectCollisions([skills[0]])).toEqual([]);
  });
});

describe('detectCollisions threshold before rounding (Task 30)', () => {
  // Put the whole composite weight on name similarity so it can be driven to an
  // exact value: nameSimilarity = 1 - editDistance/maxLen, with equal-length names.
  const onlyName = {
    weights: { jaccard: 0, cosine: 0, charNgram: 0, nameSimilarity: 1 },
    boundarySeparationWeight: 0,
    threshold: 0.4,
  };
  const base = 'a'.repeat(200);
  const desc = 'identical shared description text';

  it('excludes a pair whose raw similarity (0.395) is just below the threshold', () => {
    // 121 substitutions over length 200 → nameSimilarity 0.395.
    const other = 'a'.repeat(79) + 'b'.repeat(121);
    const collisions = detectCollisions(
      [
        { name: base, description: desc },
        { name: other, description: desc },
      ],
      onlyName,
    );
    expect(collisions).toHaveLength(0);
  });

  it('includes a pair whose raw similarity is exactly 0.400, displayed rounded to 2 dp', () => {
    // 120 substitutions over length 200 → nameSimilarity 0.400.
    const other = 'a'.repeat(80) + 'b'.repeat(120);
    const collisions = detectCollisions(
      [
        { name: base, description: desc },
        { name: other, description: desc },
      ],
      onlyName,
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0].similarity).toBe(0.4);
  });
});

describe('detectCollisions metric stability (Task 34)', () => {
  const a = {
    name: 'alpha-formatter',
    description: 'Format technical PDF reports using company layout rules.',
  };
  const b = {
    name: 'beta-formatter',
    description: 'Format technical PDF documents using company layout rules.',
  };
  const unrelated = {
    name: 'notes-generator',
    description: 'Generate release notes from git commit history.',
  };

  it('keeps a pair Jaccard identical when an unrelated third skill is added', () => {
    const [pairTwo] = detectCollisions([a, b]);
    const three = detectCollisions([a, b, unrelated]);
    const pairThree = three.find((c) => c.a === pairTwo.a && c.b === pairTwo.b);
    expect(pairThree).toBeDefined();
    expect(pairThree!.metrics.jaccard).toBe(pairTwo.metrics.jaccard);
  });
});

describe('detectCollisions boundary separation (Task 40)', () => {
  const a = { name: 'invoice-helper', description: 'Use for invoices. Do not use for manuals.' };
  const b = { name: 'manual-helper', description: 'Use for manuals. Do not use for invoices.' };

  it('scores lower than the same shared words would without the boundary adjustment', () => {
    const [adjusted] = detectCollisions([a, b], { threshold: 0, boundarySeparationWeight: 0.5 });
    const [unadjusted] = detectCollisions([a, b], { threshold: 0, boundarySeparationWeight: 0 });
    expect(adjusted.metrics.boundarySeparation).toBeGreaterThan(0);
    expect(adjusted.similarity).toBeLessThan(unadjusted.similarity);
  });
});

describe('detectCollisions morphological overlap (Task 75)', () => {
  it('matches different grammatical forms of the same concepts after normalization', () => {
    const collisions = detectCollisions([
      { name: 'inspection-report-formatter', description: 'Format inspection reports.' },
      { name: 'report-doc-formatter', description: 'Formatting inspection report documents.' },
    ]);
    // Detected at all means the composite reached the 0.4 threshold after normalization.
    expect(collisions).toHaveLength(1);
    expect(collisions[0].similarity).toBeGreaterThanOrEqual(0.4);
    expect(collisions[0].sharedTerms).toEqual(
      expect.arrayContaining(['format', 'inspection', 'report']),
    );
  });
});

describe('detectCollisions confidence (Task 80)', () => {
  it('gives high confidence to long descriptions whose metrics agree', () => {
    const [collision] = detectCollisions([
      {
        name: 'pdf-report-formatter',
        description:
          'Format technical PDF reports using company layout rules. Use when asked to standardize inspection reports.',
      },
      {
        name: 'engineering-report-formatter',
        description:
          'Format technical engineering reports using company layout rules. Use when asked to standardize inspection reports.',
      },
    ]);
    expect(collision.confidence).toBe('high');
  });

  it('gives low confidence to very short descriptions, independent of risk', () => {
    const collisions = detectCollisions(
      [
        { name: 'a-formatter', description: 'Format X.' },
        { name: 'b-formatter', description: 'Format Y.' },
      ],
      { threshold: 0 },
    );
    expect(collisions).toHaveLength(1);
    expect(collisions[0].confidence).toBe('low');
    // Risk and confidence are distinct — a short pair can still read as high risk.
    expect(['High', 'Medium', 'Low']).toContain(collisions[0].risk);
  });
});

describe('riskFor', () => {
  it('maps similarity to risk bands', () => {
    expect(riskFor(0.85)).toBe('High');
    expect(riskFor(0.7)).toBe('Medium');
    expect(riskFor(0.45)).toBe('Low');
  });
});
