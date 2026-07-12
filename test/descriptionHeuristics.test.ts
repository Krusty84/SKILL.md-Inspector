import { describe, it, expect } from 'vitest';
import {
  analyzeDescription,
  hasActionVerb,
  isFrontLoaded,
  tokenize,
  hasPositiveTriggerPhrase,
  hasNegativeBoundaryPhrase,
  hasExclusiveTriggerPhrase,
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

  it('detects positive trigger phrases', () => {
    expect(hasPositiveTriggerPhrase('Use when the user needs a report').found).toBe(true);
    expect(hasPositiveTriggerPhrase('Format the report').found).toBe(false);
  });

  it('does not credit a negative boundary as a positive trigger', () => {
    expect(hasPositiveTriggerPhrase('Do not use when the input is a contract').found).toBe(false);
    expect(hasNegativeBoundaryPhrase('Do not use when the input is a contract').found).toBe(true);
    expect(hasNegativeBoundaryPhrase('Format the report').found).toBe(false);
  });

  it('treats "only use when" as both a positive trigger and an exclusive boundary', () => {
    expect(hasPositiveTriggerPhrase('Only use when preparing a release').found).toBe(true);
    expect(hasExclusiveTriggerPhrase('Only use when preparing a release').found).toBe(true);
    expect(hasNegativeBoundaryPhrase('Only use when preparing a release').found).toBe(false);
    expect(hasExclusiveTriggerPhrase('Use when needed').found).toBe(false);
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

  it('does not consonant-double multisyllabic verbs', () => {
    expect(hasActionVerb('formatting the report').found).toBe(true);
    expect(hasActionVerb('debugged the script').found).toBe(true);
    expect(hasActionVerb('rendering the template').found).toBe(true); // correct form
    expect(hasActionVerb('renderring the template').found).toBe(false); // invalid doubled form
    expect(hasActionVerb('refactorring the code').found).toBe(false);
  });

  it('front-loads only when a verb starts the text and an object follows', () => {
    expect(isFrontLoaded('format technical reports using company rules')).toBe(true);
    expect(isFrontLoaded('generates release notes from commit history')).toBe(true);
    expect(isFrontLoaded('format reports')).toBe(true);
    expect(isFrontLoaded('analyze log files')).toBe(true);
    expect(isFrontLoaded('analyze when needed')).toBe(false); // verb, no object
    expect(isFrontLoaded('analyze and help when needed')).toBe(false);
    expect(isFrontLoaded('a general utility for teams that can analyze many things')).toBe(false);
  });
});
