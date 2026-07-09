import { describe, it, expect } from 'vitest';
import {
  analyzeDescription,
  hasActionVerb,
  hasTriggerPhrase,
  hasBoundaryPhrase,
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
    expect(analyzeDescription('Does helpful things generally').concreteArtifact).toBe(false);
  });
});
