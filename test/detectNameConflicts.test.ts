import { describe, it, expect } from 'vitest';
import { detectNameConflicts, detectSimilarNames } from '../src/workspace/detectNameConflicts';
import { nameSimilarity } from '../src/workspace/similarity';

describe('detectNameConflicts', () => {
  it('groups exact and case-differing duplicate names, listing every path', () => {
    const conflicts = detectNameConflicts([
      { name: 'pdf-helper', path: 'a/SKILL.md' },
      { name: 'PDF-Helper', path: 'b/SKILL.md' },
      { name: 'Pdf-Helper', path: 'c/SKILL.md' },
      { name: 'release-notes', path: 'd/SKILL.md' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].normalized).toBe('pdf-helper');
    expect(conflicts[0].entries.map((e) => e.path).sort()).toEqual([
      'a/SKILL.md',
      'b/SKILL.md',
      'c/SKILL.md',
    ]);
  });

  it('reports nothing when all names are unique', () => {
    expect(
      detectNameConflicts([
        { name: 'a', path: 'a/SKILL.md' },
        { name: 'b', path: 'b/SKILL.md' },
      ]),
    ).toEqual([]);
  });
});

describe('detectSimilarNames', () => {
  const skills = [
    { name: 'pdf-report-formatter', path: 'a/SKILL.md' },
    { name: 'pdf-reports-formatter', path: 'b/SKILL.md' },
    { name: 'release-notes-generator', path: 'c/SKILL.md' },
  ];

  it('flags small spelling variations, not unrelated names', () => {
    const similar = detectSimilarNames(skills);
    expect(similar).toHaveLength(1);
    expect([similar[0].a, similar[0].b].sort()).toEqual([
      'pdf-report-formatter',
      'pdf-reports-formatter',
    ]);
    expect(similar[0].similarity).toBeGreaterThanOrEqual(0.8);
  });

  it('excludes exact/case duplicates (those are name conflicts)', () => {
    expect(
      detectSimilarNames([
        { name: 'pdf-helper', path: 'a/SKILL.md' },
        { name: 'PDF-Helper', path: 'b/SKILL.md' },
      ]),
    ).toEqual([]);
  });

  it('respects a configurable threshold', () => {
    expect(detectSimilarNames(skills, 0.99)).toEqual([]); // suppresses the ~0.95 pair
  });
});

describe('detectSimilarNames cancellation and length gate (plan 7 Part C)', () => {
  /** A ≥50-name corpus mixing near-duplicates, length variants, and unrelated names. */
  const corpus = [
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `pdf-report-formatter-${i}`,
      path: `pdf/${i}/SKILL.md`,
    })),
    ...Array.from({ length: 20 }, (_, i) => ({
      name: `release-notes-generator-v${i}`,
      path: `release/${i}/SKILL.md`,
    })),
    ...Array.from({ length: 15 }, (_, i) => ({
      name: 'x'.repeat(i + 1),
      path: `short/${i}/SKILL.md`,
    })),
    { name: 'pdf-reports-formatter', path: 'extra/a/SKILL.md' },
    { name: 'PDF-Report-Formatter-0', path: 'extra/b/SKILL.md' },
  ];

  /** The pre-optimization loop: every pair, full edit distance, no gate. */
  function reference(skills: typeof corpus, threshold: number) {
    const results = [];
    for (let i = 0; i < skills.length; i++) {
      for (let j = i + 1; j < skills.length; j++) {
        const similarity = nameSimilarity(skills[i].name, skills[j].name);
        if (similarity >= 1 || similarity < threshold) {
          continue;
        }
        results.push({
          a: skills[i].name,
          b: skills[j].name,
          aPath: skills[i].path,
          bPath: skills[j].path,
          similarity: Math.round(similarity * 100) / 100,
        });
      }
    }
    return results.sort((x, y) => y.similarity - x.similarity);
  }

  it.each([0.5, 0.8, 0.9, 0.95])(
    'matches the unoptimized loop exactly at threshold %s, order included',
    (threshold) => {
      expect(corpus.length).toBeGreaterThanOrEqual(50);
      expect(detectSimilarNames(corpus, threshold)).toEqual(reference(corpus, threshold));
    },
  );

  it('returns nothing when cancellation is already requested', () => {
    expect(detectSimilarNames(corpus, 0.8, { isCancellationRequested: true })).toEqual([]);
  });

  it('abandons a 1000-name comparison promptly once cancelled', () => {
    const many = Array.from({ length: 1000 }, (_, i) => ({
      name: `skill-name-number-${i}`,
      path: `many/${i}/SKILL.md`,
    }));
    const started = performance.now();
    expect(detectSimilarNames(many, 0.8, { isCancellationRequested: true })).toEqual([]);
    expect(performance.now() - started).toBeLessThan(50);
  });

  it('checks cancellation per row, like the collision loop', () => {
    let checks = 0;
    const signal = {
      get isCancellationRequested() {
        checks += 1;
        return checks > 1;
      },
    };
    const partial = detectSimilarNames(corpus, 0.5, signal);
    expect(partial.length).toBeLessThan(reference(corpus, 0.5).length);
    expect(checks).toBeLessThanOrEqual(3);
  });

  it('without a signal, compares every pair', () => {
    expect(detectSimilarNames(corpus, 0.5)).toEqual(reference(corpus, 0.5));
  });
});
