import { describe, it, expect } from 'vitest';
import {
  buildVerbForms,
  singularize,
  normalizeVerbForm,
  normalizeContentToken,
} from '../src/quality/wordForms';
import { resolveHeuristicDictionaries } from '../src/quality/dictionaries';

describe('singularize (Task 31)', () => {
  it('reduces regular plurals to a shared singular form', () => {
    expect(singularize('reports')).toBe('report');
    expect(singularize('report')).toBe('report');
    expect(singularize('files')).toBe('file');
    expect(singularize('documents')).toBe('document');
    expect(singularize('sizes')).toBe('size');
  });

  it('handles exceptional -es endings', () => {
    expect(singularize('boxes')).toBe('box');
    expect(singularize('batches')).toBe('batch');
    expect(singularize('dishes')).toBe('dish');
    expect(singularize('classes')).toBe('class');
    expect(singularize('cases')).toBe('case');
    expect(singularize('databases')).toBe('database');
    expect(singularize('companies')).toBe('company');
  });

  it('does not mangle non-plural -s words', () => {
    expect(singularize('analysis')).toBe('analysis'); // not "analysi"
    expect(singularize('status')).toBe('status');
    expect(singularize('basis')).toBe('basis');
    expect(singularize('class')).toBe('class');
  });

  it('maps irregular plurals to their real singulars', () => {
    expect(singularize('analyses')).toBe('analysis'); // unifies with singularize('analysis')
    expect(singularize('crises')).toBe('crisis');
    expect(singularize('theses')).toBe('thesis');
    expect(singularize('indices')).toBe('index');
    expect(singularize('matrices')).toBe('matrix');
    expect(singularize('series')).toBe('series'); // not "sery"
    expect(singularize('movies')).toBe('movie'); // not "movy"
    expect(singularize('buses')).toBe('bus');
  });

  it('folds apis/axes/vertices despite the -is/-us/-ss and -xes guards (plan 4)', () => {
    expect(normalizeContentToken('apis')).toBe('api'); // "API" vs "APIs" must merge
    expect(normalizeContentToken('axes')).toBe('axis'); // not "ax"
    expect(normalizeContentToken('vertices')).toBe('vertex'); // not "vertice"
    expect(singularize('apis')).toBe('api');
    expect(singularize('axes')).toBe('axis');
    expect(singularize('vertices')).toBe('vertex');
  });

  it('keeps the -is/-us/-ss guard protecting genuine singulars (plan 4 blast-radius audit)', () => {
    for (const word of ['analysis', 'status', 'corpus', 'basis', 'iris', 'class', 'apis']) {
      // every protected word except the new irregulars must stay unchanged
      if (word === 'apis') continue;
      expect(singularize(word), word).toBe(word);
    }
    expect(singularize('indexes')).toBe('index'); // regular -xes still folds
  });
});

describe('buildVerbForms', () => {
  it('expands only the verbs in the given registry, irregulars included', () => {
    expect(buildVerbForms(['convert']).forms.has('written')).toBe(false);
    expect(buildVerbForms(['convert']).forms.has('built')).toBe(false);
    expect(buildVerbForms(['write']).forms.has('wrote')).toBe(true);
    expect(buildVerbForms(['write']).toBase.get('written')).toBe('write');
  });

  it('emits only the doubled -ing/-ed forms for CVC verbs', () => {
    const { forms } = buildVerbForms(['format', 'debug']);
    expect(forms.has('formatting')).toBe(true);
    expect(forms.has('formatted')).toBe(true);
    expect(forms.has('formating')).toBe(false);
    expect(forms.has('formated')).toBe(false);
    expect(forms.has('debugged')).toBe(true);
    expect(forms.has('debuged')).toBe(false);
  });

  it('memoizes per registry array reference', () => {
    const verbs = ['analyze', 'format'];
    expect(buildVerbForms(verbs)).toBe(buildVerbForms(verbs));
  });

  it('uses explicit custom forms before generated regular morphology', () => {
    const verbs = ['teach'];
    const forms = { teach: ['teach', 'teaches', 'teaching', 'taught'] };
    const result = buildVerbForms(verbs, forms);
    expect(result.forms).toEqual(new Set(['teach', 'teaches', 'teaching', 'taught']));
    expect(result.forms.has('teached')).toBe(false);
  });

  it('includes the form mapping identity in the cache key', () => {
    const verbs = ['teach'];
    const first = buildVerbForms(verbs, { teach: ['taught'] });
    const second = buildVerbForms(verbs, { teach: ['teaching'] });
    expect(first).not.toBe(second);
    expect(first.forms.has('taught')).toBe(true);
    expect(second.forms.has('taught')).toBe(false);
  });
});

describe('normalizeVerbForm (Task 32)', () => {
  it('maps every registered form of an action verb to its base', () => {
    for (const form of ['format', 'formats', 'formatting', 'formatted']) {
      expect(normalizeVerbForm(form)).toBe('format');
    }
  });

  it('leaves unknown words and non-verbs unchanged', () => {
    expect(normalizeVerbForm('banana')).toBe('banana');
    expect(normalizeVerbForm('report')).toBe('report');
  });
});

describe('normalizeContentToken', () => {
  it('folds a verb form to base first, then singularizes nouns', () => {
    expect(normalizeContentToken('formatting')).toBe('format');
    expect(normalizeContentToken('reports')).toBe('report');
    // 3rd-person "analyzes" would be mangled to "analy" if singularized first.
    expect(normalizeContentToken('analyzes')).toBe('analyze');
  });

  it('uses configurable irregular singular forms', () => {
    const dictionaries = resolveHeuristicDictionaries({
      irregularSingularForms: { criterion: ['criteria'] },
    });
    expect(normalizeContentToken('criteria', dictionaries)).toBe('criterion');
  });
});
