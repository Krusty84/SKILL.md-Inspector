import { describe, it, expect } from 'vitest';
import {
  extractCapabilities,
  extractArtifacts,
  extractPositiveTriggers,
  extractNegativeBoundaries,
  boundarySeparation,
} from '../src/workspace/collisionFeatures';

describe('extractCapabilities (Task 36)', () => {
  it('normalizes verb forms to their base and de-duplicates', () => {
    expect(extractCapabilities('Formats and formatting; will format the reports.')).toEqual([
      'format',
    ]);
  });

  it('drops unknown words', () => {
    expect(extractCapabilities('Frobnicate the wodgets')).toEqual([]);
  });
});

describe('extractArtifacts (Task 37)', () => {
  it('detects single-word artifacts, acronyms, and multi-word phrases', () => {
    const artifacts = extractArtifacts('Format PDF inspection reports and CSV files.');
    expect(artifacts).toEqual(
      expect.arrayContaining(['pdf', 'inspection report', 'report', 'csv']),
    );
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
});
