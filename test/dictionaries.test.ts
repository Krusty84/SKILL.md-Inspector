import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
  resolveHeuristicDictionariesWithWarnings,
  type HeuristicDictionaryValues,
} from '../src/quality/dictionaries';
import { buildVerbForms } from '../src/quality/wordForms';

describe('resolveHeuristicDictionaries', () => {
  it('returns the defaults (frozen) when no values are given', () => {
    const resolved = resolveHeuristicDictionaries();
    expect(resolved).toEqual(DEFAULT_HEURISTIC_DICTIONARIES);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.actionVerbs)).toBe(true);
  });

  it('normalizes complete list values with trimming, lowercasing, and deduplication', () => {
    const resolved = resolveHeuristicDictionaries({
      vagueTerms: ['  Sparkly ', 'sparkly'],
    });
    expect(resolved.vagueTerms).toEqual(['sparkly']);
  });

  it('drops non-string entries', () => {
    const resolved = resolveHeuristicDictionaries({
      vagueTerms: [42, null, 'zz-term'],
    });
    expect(resolved.vagueTerms).toEqual(['zz-term']);
  });

  it('uses a supplied dictionary as its complete value', () => {
    const resolved = resolveHeuristicDictionaries({ actionVerbs: ['triage'] });
    expect(resolved.actionVerbs).toEqual(['triage']);
    expect(resolved.actionVerbs).not.toContain('format');
  });

  it('warns on unknown dictionary keys and malformed values, sorted', () => {
    const values = {
      frobnicators: ['x'],
      vagueTerms: 'not-an-array',
    } as HeuristicDictionaryValues;
    const { warnings, dictionaries } = resolveHeuristicDictionariesWithWarnings(values);
    expect(warnings).toEqual([
      {
        path: 'heuristics.dictionaryValues.frobnicators',
        message: 'Unknown heuristic dictionary "frobnicators".',
      },
      {
        path: 'heuristics.dictionaryValues.vagueTerms',
        message: 'Expected an array of strings; the fallback value was used.',
      },
    ]);
    expect(dictionaries.vagueTerms).toEqual([...DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms]);
  });

  it('returns the same dictionaries with or without warnings', () => {
    const values: HeuristicDictionaryValues = { vagueTerms: ['zzz-term'] };
    expect(resolveHeuristicDictionaries(values)).toEqual(
      resolveHeuristicDictionariesWithWarnings(values).dictionaries,
    );
  });

  it('feeds custom action verbs into verb-form expansion without irregular bleed', () => {
    const resolved = resolveHeuristicDictionaries({ actionVerbs: ['triage'] });
    const { forms } = buildVerbForms(resolved.actionVerbs);
    expect(forms.has('triaged')).toBe(true);
    expect(forms.has('written')).toBe(false);
    expect(forms.has('built')).toBe(false);
  });

  it('uses canonical defaults for omitted dictionaries', () => {
    const resolved = resolveHeuristicDictionaries({ vagueTerms: ['custom'] });
    expect(resolved.vagueTerms).toEqual(['custom']);
    expect(resolved.actionVerbs).toEqual(DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs);
  });

  it('normalizes lists and mappings while retaining valid entries', () => {
    const { dictionaries, warnings } = resolveHeuristicDictionariesWithWarnings({
      actionVerbs: [' Teach ', 42, '', 'teach'],
      actionVerbForms: {
        ' Teach ': [' Teach ', 'teaches', null, 'teaches'],
        broken: 'not-an-array',
      },
    });
    expect(dictionaries.actionVerbs).toEqual(['teach']);
    expect(dictionaries.actionVerbForms).toEqual({ teach: ['teach', 'teaches'] });
    expect(warnings.map((warning) => warning.path)).toEqual([
      'heuristics.dictionaryValues.actionVerbForms.broken',
      'heuristics.dictionaryValues.actionVerbForms.teach',
      'heuristics.dictionaryValues.actionVerbs',
    ]);
  });

  it('falls back to the built-in value when a whole dictionary is malformed', () => {
    const { dictionaries, warnings } = resolveHeuristicDictionariesWithWarnings({
      artifactHints: 'invalid',
    });
    expect(dictionaries.artifactHints).toEqual(DEFAULT_HEURISTIC_DICTIONARIES.artifactHints);
    expect(warnings).toEqual([
      {
        path: 'heuristics.dictionaryValues.artifactHints',
        message: 'Expected an array of strings; the fallback value was used.',
      },
    ]);
  });
});
