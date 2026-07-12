import { describe, it, expect } from 'vitest';
import {
  tokenizeContent,
  jaccard,
  tfidfVectors,
  cosine,
  sharedTerms,
  levenshtein,
  nameSimilarity,
  charNgramSimilarity,
} from '../src/workspace/similarity';

describe('tokenizeContent', () => {
  it('drops stopwords and short tokens', () => {
    const tokens = tokenizeContent('Use this skill to format the PDF reports');
    expect(tokens).toContain('format');
    expect(tokens).toContain('pdf');
    expect(tokens).toContain('reports');
    expect(tokens).not.toContain('use');
    expect(tokens).not.toContain('the');
  });
});

describe('jaccard', () => {
  it('is 1 for identical sets and 0 for disjoint sets', () => {
    expect(jaccard(['a', 'b', 'c'], ['a', 'b', 'c'])).toBe(1);
    expect(jaccard(['a', 'b'], ['c', 'd'])).toBe(0);
  });

  it('is between 0 and 1 for partial overlap', () => {
    const value = jaccard(['report', 'format', 'pdf'], ['report', 'format', 'html']);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe('tfidf cosine', () => {
  it('scores identical descriptions at ~1 even in a tiny corpus', () => {
    const docs = [
      tokenizeContent('format inspection reports'),
      tokenizeContent('format inspection reports'),
    ];
    const vectors = tfidfVectors(docs);
    expect(cosine(vectors[0], vectors[1])).toBeCloseTo(1, 5);
  });

  it('scores disjoint descriptions at 0', () => {
    const docs = [
      tokenizeContent('format inspection reports'),
      tokenizeContent('generate release notes'),
    ];
    const vectors = tfidfVectors(docs);
    expect(cosine(vectors[0], vectors[1])).toBe(0);
  });

  it('scores partial overlap between 0 and 1', () => {
    const docs = [
      tokenizeContent('format technical inspection reports'),
      tokenizeContent('format technical engineering reports'),
    ];
    const vectors = tfidfVectors(docs);
    const value = cosine(vectors[0], vectors[1]);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });
});

describe('sharedTerms', () => {
  it('returns the overlapping terms', () => {
    const terms = sharedTerms(
      tokenizeContent('format technical inspection reports'),
      tokenizeContent('format engineering inspection reports'),
    );
    expect(terms).toEqual(expect.arrayContaining(['format', 'inspection', 'reports']));
  });
});

describe('levenshtein / nameSimilarity', () => {
  it('computes edit distance', () => {
    expect(levenshtein('kitten', 'sitting')).toBe(3);
    expect(levenshtein('abc', 'abc')).toBe(0);
    expect(levenshtein('', 'abc')).toBe(3);
  });

  it('normalizes name similarity case-insensitively', () => {
    expect(nameSimilarity('pdf-helper', 'PDF-Helper')).toBe(1);
    expect(nameSimilarity('pdf-report-formatter', 'pdf-reports-formatter')).toBeGreaterThan(0.9);
    expect(nameSimilarity('alpha', 'omega-generator')).toBeLessThan(0.5);
  });
});

describe('charNgramSimilarity', () => {
  it('gives morphological variants partial similarity', () => {
    const value = charNgramSimilarity('formatter', 'formatting');
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(1);
  });

  it('scores identical text at ~1 and unrelated text near 0', () => {
    expect(
      charNgramSimilarity('format inspection reports', 'format inspection reports'),
    ).toBeCloseTo(1, 5);
    expect(charNgramSimilarity('format inspection reports', 'zxq wvk')).toBeLessThan(0.2);
  });

  it('is symmetric', () => {
    expect(charNgramSimilarity('formatter', 'formatting')).toBe(
      charNgramSimilarity('formatting', 'formatter'),
    );
  });
});
