import { describe, it, expect } from 'vitest';
import { detectNameConflicts, detectSimilarNames } from '../src/workspace/detectNameConflicts';

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
