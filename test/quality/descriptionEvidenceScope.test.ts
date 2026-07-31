import { describe, it, expect } from 'vitest';
import { computeStaticDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import { analyzeDescription, findVagueTerms } from '../../src/quality/descriptionHeuristics';
import { isProbablyNonEnglish } from '../../src/quality/language';

/**
 * Plan 15. Plans 2 and 9 fixed the score's *recall* — real shipped descriptions
 * moved from a median of 59 to 80. What is left is precision: the score is a
 * shape test, and several of its signals can be satisfied by text the skill
 * says it does **not** handle.
 *
 * These are synthetic probes, so they live here rather than in
 * `benchmarks/description-calibration/`, whose entries are verbatim frontmatter
 * from real shipped skills with provenance. That corpus's own gate
 * (`MEDIAN_SCORE_GATE`) is what holds criterion 7.
 */

function score(description: string): number {
  const result = computeStaticDescriptionQuality(description);
  expect(result.state).toBe('scored');
  return result.score ?? -1;
}

function ceilings(description: string): string[] {
  return computeStaticDescriptionQuality(description).gradeLimitations.map((l) => l.code);
}

describe('A — a negative boundary clause is not evidence of capability or artifact', () => {
  const base =
    'Purple widgets of the frobnicated kind, in the manner of a thing. ' +
    'Use when the user asks about widgets.';
  const withBoundary = `${base} Do not use for generating reports.`;

  it('does not pay for the capability the description disclaims', () => {
    const analysis = analyzeDescription(withBoundary);
    expect(analysis.capabilityEvidence.dictionary).toBe(false);
    expect(analysis.artifactEvidence.matchedTerms).not.toContain('report');
  });

  it('keeps the missing-artifact ceiling that the disclaimer used to lift', () => {
    expect(ceilings(withBoundary)).toContain('missing-concrete-artifact');
  });

  it('gains only the boundary criterion, not the capability and artifact it disclaims', () => {
    // The measured jump was +31 (59/weak → 90/excellent). The boundary criterion
    // is worth 15 and a boundary clause genuinely satisfies it, so that part of
    // the gain is the score working as designed; everything above it was the
    // scorer reading the disclaimer as evidence.
    const gain = score(withBoundary) - score(base);
    expect(gain).toBeGreaterThan(0);
    expect(gain).toBeLessThanOrEqual(15);
  });

  it('does not cross a label band on the strength of a disclaimer', () => {
    const before = computeStaticDescriptionQuality(base).label;
    const after = computeStaticDescriptionQuality(withBoundary).label;
    expect([before, after]).toEqual(['weak', 'weak']);
  });

  it('still credits the boundary criterion itself', () => {
    const analysis = analyzeDescription(withBoundary);
    expect(analysis.boundaryClause.contentFound).toBe(true);
  });
});

describe('B — the capability criterion reads the leading verb', () => {
  const ladder = (verb: string): string =>
    `${verb} line items from PDF invoices into a spreadsheet. Use when the user asks ` +
    'to pull structured data out of a scanned invoice. Do not use for generating new invoices.';

  it('separates a registered verb from a shaped one from a non-verb', () => {
    const registered = score(ladder('Extract'));
    const shaped = score(ladder('Frobnicate'));
    const notAVerb = score(ladder('Purple'));
    expect(registered).toBeGreaterThan(shaped);
    expect(shaped).toBeGreaterThan(notAVerb);
  });

  it('does not accept a past participle elsewhere in the sentence as the verb', () => {
    const analysis = analyzeDescription(ladder('Purple'));
    expect(analysis.actionVerb.matched).not.toBe('scanned');
  });
});

describe('C — structural artifact evidence needs more than a capitalized word', () => {
  it('does not read "Claude" as the artifact', () => {
    const description = 'Helps the user with tasks. Use this skill when Claude needs assistance.';
    const analysis = analyzeDescription(description);
    expect(analysis.artifactEvidence.structuralTerm).not.toBe('Claude');
    expect(ceilings(description)).toContain('missing-concrete-artifact');
  });

  it('still reads a genuine mid-sentence proper noun as an artifact', () => {
    const analysis = analyzeDescription(
      'Post release notes to a channel. Use when the user asks to notify Slack.',
    );
    expect(analysis.artifactEvidence.structural).toBe(true);
  });

  it('does not read "Purple" as a verb-shaped capability', () => {
    const analysis = analyzeDescription('Purple the quarterly invoices into a spreadsheet.');
    expect(analysis.capabilityEvidence.structural).toBe(false);
  });
});

describe('D — a narrower boundary clause never costs a band', () => {
  const trigger =
    'Extract line items from PDF invoices into a spreadsheet. Use when the user asks ' +
    'to pull structured data out of a scanned invoice.';

  it('is non-decreasing as the boundary gets more specific', () => {
    const bare = score(trigger);
    const wide = score(`${trigger} Do not use for generating new invoices.`);
    const narrow = score(`${trigger} Do not use for scanned invoices.`);
    expect(wide).toBeGreaterThanOrEqual(bare);
    expect(narrow).toBeGreaterThanOrEqual(bare);
  });

  it('still catches a genuine echo of the same scope', () => {
    const echoed =
      'Format PDF invoices. Use when the user asks about PDF invoices. ' +
      'Do not use when the user asks about PDF invoices.';
    expect(ceilings(echoed)).toContain('echoed-scope-content');
  });
});

describe('E — overlapping vague terms are counted once', () => {
  const description =
    'A general-purpose formatter for PDF invoices. Use when the user asks to format an invoice.';

  it('reports one term, not a substring and its compound', () => {
    const terms = findVagueTerms(description);
    expect(terms.filter((term) => term.includes('general'))).toHaveLength(1);
  });

  it('costs at most half the vagueness criterion for one adjective', () => {
    const clean = 'A precise formatter for PDF invoices. Use when the user asks to format an invoice.';
    const vagueFinding = computeStaticDescriptionQuality(description).findings.find((f) =>
      f.criterion.toLowerCase().includes('vague'),
    );
    const cleanFinding = computeStaticDescriptionQuality(clean).findings.find((f) =>
      f.criterion.toLowerCase().includes('vague'),
    );
    expect(vagueFinding?.pointsEarned ?? 0).toBeGreaterThanOrEqual(
      (cleanFinding?.pointsPossible ?? 10) / 2,
    );
  });

  it('keeps the penalty monotone past two distinct terms', () => {
    const two = 'A simple, flexible formatter for PDF invoices. Use when the user asks to format one.';
    const four =
      'A simple, flexible, powerful, comprehensive formatter for PDF invoices. ' +
      'Use when the user asks to format one.';
    const pointsFor = (text: string): number =>
      computeStaticDescriptionQuality(text).findings.find((f) =>
        f.criterion.toLowerCase().includes('vague'),
      )?.pointsEarned ?? 0;
    expect(pointsFor(four)).toBeLessThanOrEqual(pointsFor(two));
    expect(findVagueTerms(four).length).toBeGreaterThan(findVagueTerms(two).length);
  });
});

describe('F — a language-limited description keeps its English-only ceilings off', () => {
  const CASES: Record<string, string> = {
    chinese: '从 PDF 发票中提取行项目并生成电子表格。当用户需要从扫描的发票中提取结构化数据时使用。',
    russian:
      'Извлекает позиции из PDF-счетов в электронную таблицу. ' +
      'Используйте, когда пользователю нужны структурированные данные из счёта.',
    german:
      'Extrahiert Positionen aus PDF-Rechnungen in eine Tabelle. ' +
      'Verwenden Sie dies, wenn der Benutzer strukturierte Daten aus einer Rechnung benötigt.',
    french:
      'Extrait les postes des factures PDF vers un tableur. ' +
      'Utilisez ceci lorsque l’utilisateur a besoin de données structurées issues d’une facture.',
  };

  it.each(Object.keys(CASES))('detects %s as non-English', (language) => {
    expect(isProbablyNonEnglish(CASES[language])).toBe(true);
  });

  it.each(Object.keys(CASES))('scores %s at least 60 with low coverage retained', (language) => {
    const result = computeStaticDescriptionQuality(CASES[language]);
    expect(result.state).toBe('scored');
    expect(result.score ?? 0).toBeGreaterThanOrEqual(60);
    expect(result.coverage).toBe('low');
    expect(result.partial).toBe(true);
  });

  it.each(Object.keys(CASES))('applies no English-only ceiling to %s', (language) => {
    const applied = ceilings(CASES[language]);
    for (const code of [
      'missing-action-capability',
      'missing-usage-trigger',
      'missing-concrete-artifact',
    ]) {
      expect(applied).not.toContain(code);
    }
  });

  it('still applies the language-independent ceilings', () => {
    // Over-length is a specification error whatever the language.
    const long = `${CASES.russian} ${'дополнительный текст '.repeat(60)}`.trim();
    expect(ceilings(long)).toContain('over-maximum-length');
  });
});
