import { describe, it, expect } from 'vitest';
import {
  extractCapabilities,
  extractArtifacts,
  boundaryFeatures,
  scopeOverlapOf,
} from '../../src/workspace/collisionFeatures';
import { detectCollisions } from '../../src/workspace/detectSkillCollisions';
import { detectNameConflicts } from '../../src/workspace/detectNameConflicts';
import { tokenizeContent } from '../../src/workspace/similarity';
import { tokenize, analyzeArtifactEvidence } from '../../src/quality/descriptionHeuristics';
import { singularize } from '../../src/quality/wordForms';
import { computeStaticDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import { isProbablyNonEnglish } from '../../src/quality/language';

/**
 * Plan 16 Parts B–F. Plan 10 widened `similarity.tokenizeContent` to Unicode but
 * left `collisionFeatures.contentWords` on `/[a-z0-9]+/g` — and scope overlap
 * carries weight 0.70, the leading term in the composite. It was blind to every
 * non-English description, and shredded accented Latin into fragments.
 */

const DESCRIPTIONS: Record<string, string> = {
  english: 'Extract line items from PDF invoices into a spreadsheet.',
  german: 'Extrahiert Positionen aus PDF-Rechnungen in eine Tabelle.',
  french: 'Extrait les postes des factures PDF vers un tableur.',
  spanish: 'Extrae partidas de facturas PDF y realiza el cálculo hacia una hoja.',
  russian: 'Извлекает позиции из PDF-счетов в таблицу.',
  chinese: '从 PDF 发票中提取行项目并生成表格。',
};

describe('C — scope tokenization is Unicode-aware', () => {
  it('does not shred accented Latin into fragments', () => {
    expect(tokenizeContent('cálculo')).toEqual(['cálculo']);
    expect(boundaryFeatures(DESCRIPTIONS.spanish).domain.has('cálculo')).toBe(true);
  });

  it.each(['german', 'french', 'spanish', 'russian', 'chinese'])(
    'sees %s content in the scope features',
    (language) => {
      const features = boundaryFeatures(DESCRIPTIONS[language]);
      expect(features.domain.size, `${language} domain was empty`).toBeGreaterThan(0);
    },
  );

  it('scores two paraphrases of the same Russian skill as overlapping', () => {
    const a = boundaryFeatures('Извлекает позиции из PDF-счетов в таблицу.');
    const b = boundaryFeatures('Извлекает строки из PDF-счетов в таблицу.');
    expect(scopeOverlapOf(a, b).value).toBeGreaterThan(0);
  });
});

describe('B — a noun that is also a verb does not become a capability', () => {
  it('reads "tests" as the artifact, not the verb', () => {
    const capabilities = extractCapabilities(
      'Create unit tests for a source file. Use when the user asks for tests.',
    );
    expect(capabilities).toContain('create');
    expect(capabilities).not.toContain('test');
  });

  it('still reads "test" as a capability when it is the verb', () => {
    expect(extractCapabilities('Test a module against its contract.')).toContain('test');
  });

  it('groups a spec generator with a test writer', () => {
    const skills = [
      {
        name: 'test-writer',
        description: 'Create unit tests for a source file. Use when the user asks for tests.',
      },
      {
        name: 'spec-generator',
        description:
          "Generate spec files covering a module's behaviour. Use when the user wants specs written.",
      },
    ];
    const collisions = detectCollisions(skills);
    expect(collisions).toHaveLength(1);
    expect(collisions[0].similarity).toBeGreaterThan(0.3);
  });

  it('keeps `spec` grouped with tests, not with API interfaces', () => {
    expect(extractArtifacts('Generate spec files for a module.')).toContain('spec');
  });
});

describe('D — plural acronyms match their singular', () => {
  it.each([
    ['Validate JWT payloads.', 'jwt'],
    ['Validate JWTs.', 'jwt'],
    ['Check URL redirects.', 'url'],
    ['Check URLs.', 'url'],
    ['Track KPIs.', 'kpi'],
  ])('%s matches %s', (text, acronym) => {
    expect(analyzeArtifactEvidence(text).matchedTerms).toContain(acronym);
  });

  it('does not report a plural acronym as a missing artifact', () => {
    const quality = computeStaticDescriptionQuality(
      'Validate JWTs issued by the gateway. Use when the user asks to check a token.',
    );
    expect(quality.gradeLimitations.map((limitation) => limitation.code)).not.toContain(
      'missing-concrete-artifact',
    );
  });
});

describe('E — Unicode normalization is applied at every tokenizer entry point', () => {
  const nfc = 'Konvertiert PDF-Dateien für Berichte, nicht für Tabellen.';
  const nfd = nfc.normalize('NFD');

  it('produces identical tokens for NFC and NFD', () => {
    expect(tokenize(nfd)).toEqual(tokenize(nfc));
    expect(tokenizeContent(nfd)).toEqual(tokenizeContent(nfc));
  });

  it('detects the same language for NFC and NFD', () => {
    expect(isProbablyNonEnglish(nfd)).toBe(isProbablyNonEnglish(nfc));
  });

  it('scores NFC and NFD spellings identically', () => {
    expect(computeStaticDescriptionQuality(nfd).score).toBe(
      computeStaticDescriptionQuality(nfc).score,
    );
  });

  it('treats NFC and NFD name twins as a hard conflict', () => {
    const conflicts = detectNameConflicts([
      { name: 'café-tool', path: '/w/a/SKILL.md' },
      { name: 'café-tool'.normalize('NFD'), path: '/w/b/SKILL.md' },
    ]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].entries).toHaveLength(2);
  });
});

describe('F — singularize handles the remaining irregular plurals', () => {
  it.each([
    ['cookies', 'cookie'],
    ['species', 'species'],
    ['statuses', 'status'],
    ['news', 'news'],
  ])('%s → %s', (plural, singular) => {
    expect(singularize(plural)).toBe(singular);
  });

  it('keeps the regular cases working', () => {
    expect(singularize('invoices')).toBe('invoice');
    expect(singularize('reports')).toBe('report');
    expect(singularize('analyses')).toBe('analysis');
    expect(singularize('indices')).toBe('index');
  });
});
