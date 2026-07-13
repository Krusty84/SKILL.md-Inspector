import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import {
  tokenizeContent,
  jaccard,
  tfidfVectors,
  cosine,
  charNgramSimilarity,
} from '../src/workspace/similarity';
import { detectCollisions } from '../src/workspace/detectSkillCollisions';

// Word-like text (including unicode) so the metrics see meaningful tokens.
const WORDS = [
  'format',
  'report',
  'pdf',
  'generate',
  'notes',
  'inspection',
  'invoice',
  'manual',
  'code',
  'table',
  'schema',
  'data',
  'release',
  'отчёт',
  'データ',
];
const text = fc.array(fc.constantFrom(...WORDS), { maxLength: 12 }).map((w) => w.join(' '));
const name = fc
  .array(fc.constantFrom(...'abcdefgh'.split('')), { minLength: 1, maxLength: 10 })
  .map((c) => c.join(''));

describe('similarity metric symmetry (Task 68)', () => {
  it('Jaccard is symmetric', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(jaccard(tokenizeContent(a), tokenizeContent(b))).toBe(
          jaccard(tokenizeContent(b), tokenizeContent(a)),
        );
      }),
    );
  });

  it('TF-IDF cosine is symmetric', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        const [va, vb] = tfidfVectors([tokenizeContent(a), tokenizeContent(b)]);
        expect(cosine(va, vb)).toBe(cosine(vb, va));
      }),
    );
  });

  it('character n-gram similarity is symmetric', () => {
    fc.assert(
      fc.property(text, text, (a, b) => {
        expect(charNgramSimilarity(a, b)).toBe(charNgramSimilarity(b, a));
      }),
    );
  });

  it('the composite collision score is symmetric in skill order', () => {
    fc.assert(
      fc.property(name, text, name, text, (na, da, nb, db) => {
        fc.pre(na !== nb); // distinct names so exactly one pair is produced
        const ab = detectCollisions(
          [
            { name: na, description: da },
            { name: nb, description: db },
          ],
          { threshold: 0 },
        );
        const ba = detectCollisions(
          [
            { name: nb, description: db },
            { name: na, description: da },
          ],
          { threshold: 0 },
        );
        expect(ab).toHaveLength(1);
        expect(ba).toHaveLength(1);
        expect(ab[0].similarity).toBe(ba[0].similarity);
      }),
    );
  });
});

describe('identical-description similarity is maximal (Task 69)', () => {
  it('a description with meaningful tokens is maximally self-similar', () => {
    fc.assert(
      fc.property(text, (raw) => {
        const tokens = tokenizeContent(raw);
        fc.pre(tokens.length > 0);
        expect(jaccard(tokens, tokens)).toBe(1);
        const [va, vb] = tfidfVectors([tokens, tokens]);
        expect(cosine(va, vb)).toBeCloseTo(1, 10);
        expect(charNgramSimilarity(raw, raw)).toBeCloseTo(1, 10);
      }),
    );
  });

  it('self-similarity is invariant to case and surrounding whitespace', () => {
    fc.assert(
      fc.property(text, (raw) => {
        fc.pre(tokenizeContent(raw).length > 0);
        const variant = `   ${raw.toUpperCase()}   `.replace(/ /g, '  ');
        expect(jaccard(tokenizeContent(raw), tokenizeContent(variant))).toBe(1);
        const [va, vb] = tfidfVectors([tokenizeContent(raw), tokenizeContent(variant)]);
        expect(cosine(va, vb)).toBeCloseTo(1, 10);
        expect(charNgramSimilarity(raw, variant)).toBeCloseTo(1, 10);
      }),
    );
  });

  it('covers unicode text without error (ASCII-normalized tokens still self-match)', () => {
    // The metrics normalize to ASCII, so a description with any ASCII tokens
    // self-matches even when unicode words are interleaved.
    const mixed = 'format отчёт report データ pdf';
    expect(jaccard(tokenizeContent(mixed), tokenizeContent(mixed))).toBe(1);
    expect(charNgramSimilarity(mixed, mixed)).toBeCloseTo(1, 10);
  });
});
