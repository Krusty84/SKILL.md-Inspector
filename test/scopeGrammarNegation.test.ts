/**
 * Regression suite for plan 5 Parts A–B
 * (docs/remediation/plan-5-grammar-negation-and-language-precision.md):
 * negated usage verbs must read as boundaries — never as positive triggers —
 * and duration/third-person behavior statements must not earn trigger credit.
 */
import { describe, expect, it } from 'vitest';
import { analyzeDescription } from '../src/quality/descriptionHeuristics';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';

describe('negated usage verbs are boundaries, not triggers (Part A)', () => {
  it.each([
    [
      'Convert DWG drawings to PDF exports. Do not run this skill when the repository is offline.',
      'the repository is offline',
    ],
    [
      'Generate release notes from commits. Never invoke for merge commits.',
      'merge commits',
    ],
    [
      'Generate BOM tables from CAD assemblies. Do not trigger when the assembly is checked out.',
      'the assembly is checked out',
    ],
    [
      "Normalize sensor telemetry into CSV. Don't apply for binary waveform captures.",
      'binary waveform captures',
    ],
    [
      'Migrate database schemas safely. Never run if a backup is missing.',
      'a backup is missing',
    ],
  ])('reads the negated clause as a boundary: %s', (description, excludedContext) => {
    const analysis = analyzeDescription(description);
    expect(analysis.triggerClause.contentFound).toBe(false);
    expect(analysis.boundaryClause.contentFound).toBe(true);
    expect(analysis.boundaryClause.clauseText).toContain(excludedContext);
  });

  it('keeps the "do not use when" control unchanged', () => {
    const analysis = analyzeDescription(
      'Generate BOM tables from CAD assemblies. Do not use when the assembly is checked out.',
    );
    expect(analysis.triggerClause.markerFound).toBe(false);
    expect(analysis.boundaryClause.contentFound).toBe(true);
    expect(analysis.boundaryClause.clauseText).toContain('the assembly is checked out');
  });

  it('reads "avoid running when …" as a boundary', () => {
    const analysis = analyzeDescription(
      'Convert CAD assemblies to previews. Avoid running when meshes exceed 2 GB.',
    );
    expect(analysis.boundaryClause.contentFound).toBe(true);
    expect(analysis.boundaryClause.clauseText).toContain('meshes exceed 2 GB');
    expect(analysis.triggerClause.contentFound).toBe(false);
  });

  it('keeps a genuine positive after a negated clause in the same sentence', () => {
    const analysis = analyzeDescription(
      'Convert scanned archives. Do not use for scans but run for digital exports.',
    );
    expect(analysis.triggerClause.contentFound).toBe(true);
    expect(analysis.boundaryClause.contentFound).toBe(true);
  });

  it.each([
    'Format inspection reports using standard rules. Use when standardizing reports.',
    'Decode CAN captures into frames. Should be used when decoding CAN captures.',
    'Convert DWG drawings to PDF. Use this skill whenever the user shares CAD drawings.',
    'Review deployment manifests. Run this skill when reviewers ask for a check.',
  ])('keeps full positive trigger credit: %s', (description) => {
    expect(analyzeDescription(description).triggerClause.contentFound).toBe(true);
  });
});

describe('behavior statements are not usage triggers (Part B)', () => {
  it('rejects a duration statement after "for"', () => {
    const description =
      'Cleans stale build caches from CI runners. Runs for 10 minutes on large repos.';
    const analysis = analyzeDescription(description);
    const result = computeStaticDescriptionQuality(description);
    expect(analysis.triggerClause.contentFound).toBe(false);
    expect(result.score).toBeLessThan(85);
  });

  it('rejects a bare third-person conditional without usage context', () => {
    const description = 'Lint YAML pipelines. Applies fixes if the schema check passes.';
    const analysis = analyzeDescription(description);
    const result = computeStaticDescriptionQuality(description);
    expect(analysis.triggerClause.contentFound).toBe(false);
    expect(result.score).toBeLessThan(85);
  });

  it.each([
    'Format reports for the finance team. Use for PDF reports and monthly summaries.',
    'Format inspection reports. Triggers when the user mentions invoices.',
    'Review deployment manifests. Run this skill when reviewers ask for a check.',
  ])('keeps credit for genuine usage statements: %s', (description) => {
    expect(analyzeDescription(description).triggerClause.contentFound).toBe(true);
  });

  it('does not reject "for" followed by an artifact rather than a quantity', () => {
    expect(
      analyzeDescription('Format reports. Use for PDF exports and CSV summaries.').triggerClause
        .contentFound,
    ).toBe(true);
  });
});
