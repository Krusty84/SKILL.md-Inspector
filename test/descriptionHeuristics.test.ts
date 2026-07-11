import { describe, it, expect } from 'vitest';
import {
  analyzeDescription,
  hasActionVerb,
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
    expect(analyzeDescription('Does helpful things generally').concreteArtifact).toBe(false);
  });
});
