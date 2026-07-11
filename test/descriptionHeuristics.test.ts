import { describe, it, expect } from 'vitest';
import {
  analyzeDescription,
  hasActionVerb,
  hasTriggerPhrase,
  hasBoundaryPhrase,
  tokenize,
} from '../src/quality/descriptionHeuristics';

describe('descriptionHeuristics', () => {
  it('detects action verbs across common inflections', () => {
    expect(hasActionVerb('Format the report').found).toBe(true);
    expect(hasActionVerb('Formats the report').found).toBe(true);
    expect(hasActionVerb('Formatting the report').found).toBe(true);
    expect(hasActionVerb('Generates release notes').found).toBe(true);
    expect(hasActionVerb('Classified the input').found).toBe(true);
    expect(hasActionVerb('A helper for documents').found).toBe(false);
  });

  it('detects trigger and boundary phrases', () => {
    expect(hasTriggerPhrase('Use when the user needs a report').found).toBe(true);
    expect(hasBoundaryPhrase('Do not use when the input is a contract').found).toBe(true);
    expect(hasBoundaryPhrase('Format the report').found).toBe(false);
  });

  it('detects vague wording including simple plurals', () => {
    expect(analyzeDescription('Helps with documents.').vagueTerms).toContain('help');
    expect(analyzeDescription('A powerful and smart tool').vagueTerms).toEqual(
      expect.arrayContaining(['powerful', 'smart']),
    );
  });

  it('recognizes concrete artifacts and acronyms', () => {
    expect(analyzeDescription('Format inspection reports').concreteArtifact).toBe(true);
    expect(analyzeDescription('Convert to PDF').concreteArtifact).toBe(true);
    expect(analyzeDescription('Generate SQL').concreteArtifact).toBe(true); // registry-only acronym
    expect(analyzeDescription('Does helpful things generally').concreteArtifact).toBe(false);
  });

  it('does not treat ordinary uppercase words as artifacts', () => {
    expect(analyzeDescription('Format IMPORTANT THINGS.').concreteArtifact).toBe(false);
    expect(analyzeDescription('Make it GOOD.').concreteArtifact).toBe(false);
  });

  it('tokenizes Latin, Cyrillic, accented, and CJK text', () => {
    expect(tokenize('Format reports')).toEqual(['format', 'reports']);
    expect(tokenize('Форматировать отчёт').length).toBe(2);
    expect(tokenize('café résumé').length).toBe(2);
    expect(tokenize('日本語 テキスト').length).toBeGreaterThan(0);
  });

  it('detects irregular action-verb forms', () => {
    expect(hasActionVerb('wrote the report').found).toBe(true);
    expect(hasActionVerb('written documentation').found).toBe(true);
    expect(hasActionVerb('reads files').found).toBe(true);
    expect(hasActionVerb('built the pipeline').found).toBe(true);
  });
});
