/**
 * Reproduce-first suite for plan 9 Part B
 * (docs/remediation/plan-9-vocabulary-and-ceilings.md).
 *
 * The defect: "not in my word list" was treated as proof that a capability or an
 * artifact is *absent*, and that inference hard-capped the score at 59. No
 * amount of dictionary growth makes it valid, so the ceilings are gated on
 * structural evidence instead.
 *
 * Every assertion describes the target behavior. The B4 block is the other half
 * of the contract: making a ceiling escapable must not make keyword stuffing
 * pay.
 */
import { describe, expect, it } from 'vitest';
import { analyzeArtifactEvidence, analyzeDescription } from '../src/quality/descriptionHeuristics';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';

const ceilings = (description: string): string[] =>
  computeStaticDescriptionQuality(description).gradeLimitations.map(
    (limitation) => limitation.code,
  );

describe('structural capability evidence', () => {
  it('accepts an unknown word in a capability-shaped opening', () => {
    const analysis = analyzeDescription('Frobnicate the widgets for shipment.');
    expect(analysis.capabilityEvidence.dictionary).toBe(false);
    expect(analysis.capabilityEvidence.structural).toBe(true);
  });

  it('accepts an unknown verb before a known one is reachable', () => {
    const analysis = analyzeDescription('Pull tables from PDF invoices.');
    expect(analysis.capabilityEvidence.structural).toBe(true);
  });

  it('rejects an opening that starts with a function word', () => {
    const analysis = analyzeDescription('This skill helps with various tasks.');
    expect(analysis.capabilityEvidence.dictionary).toBe(false);
    expect(analysis.capabilityEvidence.structural).toBe(false);
  });

  it('rejects a bare noun phrase', () => {
    expect(analyzeDescription('A helpful skill.').capabilityEvidence.structural).toBe(false);
  });

  it('still reports dictionary evidence when the verb is known', () => {
    const analysis = analyzeDescription('Extract tables from PDF invoices.');
    expect(analysis.capabilityEvidence.dictionary).toBe(true);
  });
});

describe('structural artifact evidence', () => {
  it.each([
    ['OpenAPI definitions', 'PascalCase token'],
    ['Export PowerPoint decks', 'PascalCase token'],
    ['DBC signal maps', 'short all-caps token'],
    ['load-case tables', 'hyphenated compound'],
    ['Apply Terraform state', 'mid-sentence proper noun'],
  ])('accepts %s (%s)', (text) => {
    expect(analyzeArtifactEvidence(text).structural).toBe(true);
  });

  it('does not treat a sentence-initial capital as a proper noun', () => {
    // Otherwise the check fires on nearly every description and means nothing.
    // "Dockerfile" is a plain capitalized word, not PascalCase — it is covered by
    // the dictionary instead, which is the right place for a known name.
    expect(analyzeArtifactEvidence('Widgets for shipment').structural).toBe(false);
    expect(analyzeArtifactEvidence('Dockerfile stages').found).toBe(true);
  });

  it('does not invent evidence out of ordinary prose', () => {
    const evidence = analyzeArtifactEvidence('various things for everyone');
    expect(evidence.found).toBe(false);
    expect(evidence.structural).toBe(false);
  });

  it('no longer treats any dotted word pair as a filename', () => {
    // Acceptance criterion 5: the old /\.[a-z0-9]{2,4}\b/i escape hatch made
    // "foo.bar" artifact evidence, which is how vacuous prose cleared the
    // concrete-artifact ceiling.
    expect(analyzeArtifactEvidence('Process foo.bar items').found).toBe(false);
  });

  it('still recognizes real filenames and standalone extensions', () => {
    for (const text of ['keybindings.json', 'CLAUDE.md', 'a .pdf upload', 'report.xlsx']) {
      expect(analyzeArtifactEvidence(text).found, text).toBe(true);
    }
  });
});

describe('a dictionary miss is not proof of absence', () => {
  const frobnicate =
    'Frobnicate the widgets for shipment. Use when the user needs widgets frobnicated. Do not use for gadgets.';

  it('does not cap an unrecognized capability verb at 59', () => {
    expect(ceilings(frobnicate)).not.toContain('missing-action-capability');
  });

  it('names the unrecognized word and the setting that fixes it', () => {
    const result = computeStaticDescriptionQuality(frobnicate);
    const finding = result.findings.find((entry) => entry.criterion === 'Action verb / capability');
    expect(finding?.message).toContain('frobnicate');
    expect(finding?.message).toContain('skillMdInspector.heuristics.dictionaryValues.actionVerbs');
  });

  it('awards partial credit, not full credit, for structural-only evidence', () => {
    const result = computeStaticDescriptionQuality(frobnicate);
    const finding = result.findings.find((entry) => entry.criterion === 'Action verb / capability');
    expect(finding?.pointsEarned).toBe(10);
    expect(finding?.pointsPossible).toBe(20);
  });

  it('still caps a description with no capability evidence at all', () => {
    expect(ceilings('This skill helps with various tasks.')).toContain('missing-action-capability');
  });
});

describe('a synonym must not cost two label bands', () => {
  const dictionaryVerb =
    'Extract tables from PDF invoices. Use when the user needs invoice line items. Do not use for images.';
  const synonym =
    'Pull tables from PDF invoices. Use when the user needs invoice line items. Do not use for images.';

  it('scores the synonym within one criterion of the recognized verb', () => {
    // Acceptance criterion 3, and the plan's headline defect: 41 points and two
    // label bands for a synonym. "Pull" states a capability whatever the
    // dictionary says.
    expect(computeStaticDescriptionQuality(dictionaryVerb).score).toBeGreaterThanOrEqual(90);
    expect(computeStaticDescriptionQuality(synonym).score).toBeGreaterThanOrEqual(90);
  });
});

/**
 * Part B4. Part B makes the ceilings easier to escape, so the gaming cases are
 * pinned: none of them may improve.
 */
describe('B4 — the anti-gaming property holds', () => {
  it('keeps vacuous prose in "poor"', () => {
    const result = computeStaticDescriptionQuality(
      'This skill helps with various tasks and improves things.',
    );
    expect(result.label).toBe('poor');
  });

  it('keeps a bare noun phrase in "poor"', () => {
    expect(computeStaticDescriptionQuality('A helpful skill.').label).toBe('poor');
  });

  it('leaves verb stuffing exactly where it was — the recorded gap', () => {
    // The plan's own words: this scores 100 today and Part B does not address it,
    // because it has genuine dictionary evidence rather than a dictionary miss.
    // Closing it needs an evidence model that can tell a stated capability from a
    // listed one. Pinned at 100 so the gap stays visible and a future change has
    // to notice it deliberately; the requirement is "must not improve", and it
    // cannot improve past 100.
    const result = computeStaticDescriptionQuality(
      'Analyze validate generate format convert review data reports files. Use when analyzing reports for users. Do not use for spreadsheets.',
    );
    expect(result.score).toBe(100);
  });
});
