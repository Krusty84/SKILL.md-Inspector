import { describe, it, expect } from 'vitest';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
  resolveHeuristicDictionariesWithWarnings,
  type HeuristicDictionaryOverrides,
} from '../src/quality/dictionaries';
import { buildVerbForms } from '../src/quality/wordForms';

describe('resolveHeuristicDictionaries', () => {
  it('returns the defaults (frozen) when no overrides are given', () => {
    const resolved = resolveHeuristicDictionaries();
    expect(resolved).toEqual(DEFAULT_HEURISTIC_DICTIONARIES);
    expect(Object.isFrozen(resolved)).toBe(true);
    expect(Object.isFrozen(resolved.actionVerbs)).toBe(true);
  });

  it('adds entries with trimming, lowercasing, and deduplication', () => {
    const resolved = resolveHeuristicDictionaries({
      vagueTerms: { add: ['  Sparkly ', 'sparkly'] },
    });
    expect(resolved.vagueTerms.filter((term) => term === 'sparkly')).toEqual(['sparkly']);
    expect(resolved.vagueTerms).toHaveLength(DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms.length + 1);
  });

  it('drops non-string add entries', () => {
    const resolved = resolveHeuristicDictionaries({
      vagueTerms: { add: [42, null, 'zz-term'] },
    });
    expect(resolved.vagueTerms).toContain('zz-term');
    expect(resolved.vagueTerms).toHaveLength(DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms.length + 1);
  });

  it('removes entries case-insensitively via normalization', () => {
    const resolved = resolveHeuristicDictionaries({ actionVerbs: { remove: [' FORMAT '] } });
    expect(resolved.actionVerbs).not.toContain('format');
    expect(resolved.actionVerbs).toContain('analyze');
  });

  it('treats removing a non-member as a no-op', () => {
    const resolved = resolveHeuristicDictionaries({ actionVerbs: { remove: ['frobnicate'] } });
    expect(resolved.actionVerbs).toEqual([...DEFAULT_HEURISTIC_DICTIONARIES.actionVerbs]);
  });

  it('replace substitutes the base, then remove and add apply on top', () => {
    const resolved = resolveHeuristicDictionaries({
      actionVerbs: { replace: ['Alpha', 'beta'], remove: ['alpha'], add: ['gamma'] },
    });
    expect(resolved.actionVerbs).toEqual(['beta', 'gamma']);
  });

  it('warns on unknown dictionary keys and malformed override values, sorted', () => {
    const overrides = {
      frobnicators: { add: ['x'] },
      vagueTerms: { add: 'not-an-array' },
    } as HeuristicDictionaryOverrides;
    const { warnings, dictionaries } = resolveHeuristicDictionariesWithWarnings(overrides);
    expect(warnings).toEqual([
      'Dictionary "vagueTerms" has a malformed override value.',
      'Unknown heuristic dictionary "frobnicators".',
    ]);
    // The malformed override changes nothing.
    expect(dictionaries.vagueTerms).toEqual([...DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms]);
  });

  it('returns the same dictionaries with or without warnings', () => {
    const overrides: HeuristicDictionaryOverrides = { vagueTerms: { add: ['zzz-term'] } };
    expect(resolveHeuristicDictionaries(overrides)).toEqual(
      resolveHeuristicDictionariesWithWarnings(overrides).dictionaries,
    );
  });

  it('feeds custom action verbs into verb-form expansion without irregular bleed', () => {
    const resolved = resolveHeuristicDictionaries({ actionVerbs: { replace: ['triage'] } });
    const { forms } = buildVerbForms(resolved.actionVerbs);
    expect(forms.has('triaged')).toBe(true);
    expect(forms.has('written')).toBe(false);
    expect(forms.has('built')).toBe(false);
  });
});
