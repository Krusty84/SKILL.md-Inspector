import { describe, it, expect } from 'vitest';
import { singularize, normalizeVerbForm, normalizeContentToken } from '../src/quality/wordForms';

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
});
