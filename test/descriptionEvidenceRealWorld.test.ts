/**
 * Regression suite for the description evidence-extraction overhaul
 * (docs/remediation/plan-2-description-evidence.md). Encodes the target behavior
 * for real-world description styles that the one-template extractor used to
 * misrank: gerund-led and noun-phrase openings, second-sentence verbs,
 * "whenever" and passive triggers, Anthropic-published description styles, and
 * the anti-gaming fixes (unfilled placeholders, non-usage "when the user").
 */
import { describe, expect, it } from 'vitest';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';
import { analyzeDescription } from '../src/quality/descriptionHeuristics';
import { REWRITE_TEMPLATE, buildImprovedDescription } from '../src/quality/improveDescription';

const GERUND_LED =
  'Formatting PDF invoices and expense reports into the standard accounting layout. Use when preparing month-end financial documents. Do not use for scanned images.';
const NOUN_PHRASE =
  'A skill that extracts tables from PDF reports and converts them to CSV. Use when the user needs tabular data out of PDF files. Do not use for scanned documents.';
const SECOND_SENTENCE_VERB =
  'For mechanical CAD teams. Converts STEP assemblies to lightweight JT previews. Use when reviewers need visual checks. Do not use for FEA meshes.';
const WHENEVER =
  'Convert DWG drawings to PDF. Use this skill whenever the user shares CAD drawings. Do not use for STEP models.';
const PASSIVE =
  'Extract structured data from CAN bus logs. This skill should be used when analyzing vehicle telemetry captures. It should not be used for simulated traces.';
const ANTHROPIC_PDF_STYLE =
  'Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form, or programmatically process, generate, or analyze PDF documents.';
const ANTHROPIC_DOCX_STYLE =
  'Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Triggers include any mention of Word doc, docx, or requests to produce professional documents with tables of contents and headings. Do not use for PDFs or spreadsheets.';
const UNFILLED_PLACEHOLDERS =
  'Extract tables from PDF reports. Use when <trigger context>. Do not use when <boundary>.';
const NON_USAGE_WHEN_THE_USER =
  'Parse DBC files into JSON. The tool crashes when the user provides malformed frames.';
const BOUNDARY_FIRST =
  'Do not use when handling invoices. Formats inspection reports using standard rules. Use when standardizing reports.';
const CANONICAL_POSITIVE =
  'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.';

function limitationCodes(description: string): string[] {
  return computeStaticDescriptionQuality(description).gradeLimitations.map((l) => l.code);
}

describe('capability detection beyond the first-token base verb', () => {
  it('accepts a gerund-led opening as the stated capability', () => {
    const analysis = analyzeDescription(GERUND_LED);
    const result = computeStaticDescriptionQuality(GERUND_LED);
    expect(analysis.actionVerb.found).toBe(true);
    expect(limitationCodes(GERUND_LED)).not.toContain('missing-action-capability');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('accepts an "A skill that <verbs> ..." noun-phrase opening', () => {
    const analysis = analyzeDescription(NOUN_PHRASE);
    const result = computeStaticDescriptionQuality(NOUN_PHRASE);
    expect(analysis.actionVerb.found).toBe(true);
    expect(limitationCodes(NOUN_PHRASE)).not.toContain('missing-action-capability');
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('finds a capability verb in the second sentence', () => {
    const result = computeStaticDescriptionQuality(SECOND_SENTENCE_VERB);
    expect(limitationCodes(SECOND_SENTENCE_VERB)).not.toContain('missing-action-capability');
    expect(result.score).toBeGreaterThanOrEqual(75);
  });

  it('does not read a verb buried past the second sentence as stated up front', () => {
    const buried =
      'For mechanical CAD teams. A collection of utilities. Made for reviewers. Converts STEP assemblies to JT previews.';
    expect(analyzeDescription(buried).actionVerb.found).toBe(false);
  });

  it('lifts the capability cap for boundary-first ordering with a verb in the first two sentences', () => {
    expect(limitationCodes(BOUNDARY_FIRST)).not.toContain('missing-action-capability');
  });

  it('credits a gerund-led opening as front-loaded capability (accepted guard case)', () => {
    // "Running this skill ..." names a capability lexically; the plan accepts
    // that a leading gerund now counts as capability-first.
    expect(analyzeDescription(GERUND_LED).frontLoadedIntent.found).toBe(true);
    expect(
      analyzeDescription('Running this skill on every commit validates the build.').actionVerb
        .found,
    ).toBe(true);
  });
});

describe('trigger and boundary marker grammar', () => {
  it('credits "whenever" as a usage trigger', () => {
    const analysis = analyzeDescription(WHENEVER);
    const result = computeStaticDescriptionQuality(WHENEVER);
    expect(analysis.triggerClause.contentFound).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(85);
  });

  it('credits passive "should be used when" / "should not be used for" clauses', () => {
    const analysis = analyzeDescription(PASSIVE);
    const result = computeStaticDescriptionQuality(PASSIVE);
    expect(analysis.triggerClause.contentFound).toBe(true);
    expect(analysis.boundaryClause.contentFound).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('never credits "should not be used when" as a positive trigger', () => {
    const analysis = analyzeDescription(
      'Format reports. This skill should not be used when drafting contracts.',
    );
    expect(analysis.triggerClause.markerFound).toBe(false);
    expect(analysis.boundaryClause.contentFound).toBe(true);
  });

  it('scores the Anthropic pdf-skill style acceptably with honest deductions', () => {
    const result = computeStaticDescriptionQuality(ANTHROPIC_PDF_STYLE);
    const codes = limitationCodes(ANTHROPIC_PDF_STYLE);
    expect(result.score).toBeGreaterThanOrEqual(60);
    expect(codes).not.toContain('missing-action-capability');
    expect(codes).not.toContain('missing-usage-trigger');
    expect(codes).not.toContain('vague-usage-trigger');
  });

  it('scores the Anthropic docx-skill style as good', () => {
    const result = computeStaticDescriptionQuality(ANTHROPIC_DOCX_STYLE);
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it('keeps canonical house-style positives at excellent', () => {
    const result = computeStaticDescriptionQuality(CANONICAL_POSITIVE);
    expect(result.score).toBeGreaterThanOrEqual(90);
  });
});

describe('anti-gaming: unfilled placeholders', () => {
  it('treats placeholder-only scope clauses as vague, capped low', () => {
    const analysis = analyzeDescription(UNFILLED_PLACEHOLDERS);
    const result = computeStaticDescriptionQuality(UNFILLED_PLACEHOLDERS);
    expect(analysis.triggerClause.markerFound).toBe(true);
    expect(analysis.triggerClause.contentFound).toBe(false);
    expect(['poor', 'weak']).toContain(result.label);
  });

  it('scores the rewrite template itself below 60', () => {
    const result = computeStaticDescriptionQuality(REWRITE_TEMPLATE);
    expect(result.score).toBeLessThan(60);
  });

  it('keeps the improver idempotent on its own output', () => {
    const improved = buildImprovedDescription('Format inspection reports using layout rules.');
    expect(buildImprovedDescription(improved)).toBe(improved);
  });

  it('does not cap real content that happens to sit next to a placeholder-free clause', () => {
    expect(limitationCodes(CANONICAL_POSITIVE)).not.toContain('unfilled-placeholder');
  });
});

describe('anti-gaming: non-usage "when the user"', () => {
  it('does not award trigger credit for an incidental "when the user" sentence', () => {
    const analysis = analyzeDescription(NON_USAGE_WHEN_THE_USER);
    const result = computeStaticDescriptionQuality(NON_USAGE_WHEN_THE_USER);
    expect(analysis.triggerClause.contentFound).toBe(false);
    expect(result.score).toBeLessThan(85);
    expect(
      limitationCodes(NON_USAGE_WHEN_THE_USER).some(
        (code) => code === 'missing-usage-trigger' || code === 'vague-usage-trigger',
      ),
    ).toBe(true);
  });

  it('keeps "Use this skill when the user asks ..." fully credited', () => {
    const analysis = analyzeDescription(
      'Format invoices. Use this skill when the user asks for billing summaries.',
    );
    expect(analysis.triggerClause.contentFound).toBe(true);
  });

  it('keeps a sentence-initial "When Claude needs ..." trigger credited', () => {
    const analysis = analyzeDescription(ANTHROPIC_PDF_STYLE);
    expect(analysis.triggerClause.contentFound).toBe(true);
  });
});
