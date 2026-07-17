import { describe, it, expect } from 'vitest';
import {
  extractCapabilities,
  extractArtifacts,
  extractPositiveTriggers,
  extractNegativeBoundaries,
  boundarySeparation,
} from '../src/workspace/collisionFeatures';
import { resolveHeuristicDictionaries } from '../src/quality/dictionaries';

describe('extractCapabilities (Task 36)', () => {
  it('normalizes verb forms to their base and de-duplicates', () => {
    expect(extractCapabilities('Formats and formatting; will format the reports.')).toEqual([
      'format',
    ]);
  });

  it('drops unknown words', () => {
    expect(extractCapabilities('Frobnicate the wodgets')).toEqual([]);
  });

  it('folds custom verbs to their base form', () => {
    const dictionaries = resolveHeuristicDictionaries({ actionVerbs: { replace: ['triage'] } });
    expect(extractCapabilities('Triages and triaged the queue.', dictionaries)).toEqual(['triage']);
  });
});

describe('extractArtifacts (Task 37)', () => {
  it('detects single-word artifacts, acronyms, and multi-word phrases', () => {
    const artifacts = extractArtifacts('Format PDF inspection reports and CSV files.');
    expect(artifacts).toEqual(
      expect.arrayContaining(['pdf', 'inspection report', 'report', 'csv']),
    );
  });

  it('escapes regex metacharacters in custom multi-word artifact phrases', () => {
    const plus = resolveHeuristicDictionaries({ multiWordArtifacts: { add: ['c++ template'] } });
    expect(() => extractArtifacts('Refactor the C++ template layer.', plus)).not.toThrow();
    expect(extractArtifacts('Refactor the C++ template layer.', plus)).toContain('c++ template');

    const dotted = resolveHeuristicDictionaries({ multiWordArtifacts: { add: ['node.js service'] } });
    expect(extractArtifacts('Restart the nodeXjs service.', dotted)).not.toContain('node.js service');
  });
});

describe('extractPositiveTriggers (Task 38)', () => {
  it('extracts trigger clauses and excludes boundary clauses', () => {
    expect(
      extractPositiveTriggers(
        'Use when standardizing reports. Do not use when drafting contracts.',
      ),
    ).toEqual(['standardizing reports']);
  });

  it('supports multiple trigger clauses', () => {
    expect(extractPositiveTriggers('Use when formatting. Use for reviewing.')).toEqual([
      'formatting',
      'reviewing',
    ]);
  });
});

describe('extractNegativeBoundaries (Task 39)', () => {
  it('extracts the boundary clause text', () => {
    expect(extractNegativeBoundaries('Format reports. Do not use for invoices.')).toEqual([
      'invoices',
    ]);
  });

  it('does not match markers inside larger words', () => {
    expect(extractNegativeBoundaries('Do not use formatting hints.')).toEqual([]);
    expect(extractNegativeBoundaries('Avoid whenever possible.')).toEqual([]);
    expect(
      extractNegativeBoundaries('Format reports. Do not use for formatting slides.'),
    ).toEqual(['formatting slides']);
  });
});

describe('boundarySeparation (Task 40)', () => {
  it('is high when each skill excludes the other skill scope', () => {
    const value = boundarySeparation(
      'Use for invoices. Do not use for manuals.',
      'Use for manuals. Do not use for invoices.',
    );
    expect(value).toBeGreaterThan(0.9);
  });

  it('is zero when neither skill declares boundaries', () => {
    expect(boundarySeparation('Format PDF reports.', 'Generate release notes.')).toBe(0);
  });

  it('ignores boundary markers embedded inside larger words', () => {
    // "do not use for" must not fire inside "Do not use formatting", which would
    // manufacture a phantom boundary ("matting shortcuts") against skill B.
    expect(
      boundarySeparation('Do not use formatting shortcuts.', 'Generate keyboard shortcuts.'),
    ).toBe(0);
  });
});
