/**
 * Deterministic text-similarity helpers for skill collision detection
 * (brief §13.2). Content tokens drop very common/skill-generic stopwords so the
 * signal comes from the domain-specific words.
 */

import { DEFAULT_HEURISTIC_DICTIONARIES } from '../quality/dictionaries';

/**
 * Lower-cases and keeps meaningful tokens (length > 2, non-stopword).
 *
 * Matches any Unicode letter or number, not just `[a-z0-9]` (plan 10 Part D).
 * Under the old ASCII-only class a Cyrillic or CJK description tokenized to
 * nothing, so all three text metrics returned 0 and the composite was
 * `nameSimilarity` alone: two *identical* Russian descriptions and two unrelated
 * ones both scored 0.17. ASCII input is unaffected — `\p{L}\p{N}` is a superset of
 * `a-z0-9` for lower-cased text, verified byte-for-byte against the benchmark
 * corpus.
 *
 * The `length > 2` filter is kept as-is, which is a known compromise: in CJK two
 * characters can be a whole word, so some real tokens are dropped. Widening the
 * class is still a strict improvement over discarding the text entirely, and the
 * stopword lists remain English, so a non-Latin pair's content filtering is
 * weaker — which is why `detectCollisions` keeps flagging such pairs as low text
 * coverage instead of presenting a confident number. Per-language stopwords are a
 * follow-up: `src/quality/language.ts` already detects script and several
 * Latin-script profiles, and wiring that in here is deliberately out of scope.
 */
export function tokenizeContent(
  text: string,
  stopwords: readonly string[] = DEFAULT_HEURISTIC_DICTIONARIES.collisionStopwords,
): string[] {
  const ignored = new Set(stopwords);
  // NFC first, so a composed and a decomposed spelling of the same word produce
  // the same token (and therefore the same similarity).
  return (text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter(
    (token) => token.length > 2 && !ignored.has(token),
  );
}

/** Jaccard similarity of two token sets (0..1). */
export function jaccard(a: string[], b: string[]): number {
  const sa = new Set(a);
  const sb = new Set(b);
  if (sa.size === 0 || sb.size === 0) {
    return 0;
  }
  let intersection = 0;
  for (const token of sa) {
    if (sb.has(token)) {
      intersection += 1;
    }
  }
  const union = sa.size + sb.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

export type TfidfVector = Map<string, number>;

/**
 * Builds smoothed TF-IDF vectors for a corpus. Smoothing
 * (idf = ln((1+N)/(1+df)) + 1) keeps shared terms non-zero even in tiny
 * corpora, so two identical descriptions score a cosine of 1.
 *
 * Corpus dependence (inherent to TF-IDF, documented rather than "fixed"): the
 * document frequencies span the whole scanned corpus, so adding or removing
 * unrelated skills shifts every idf slightly and can move a given pair's
 * cosine — and therefore its composite collision score — by a few hundredths.
 */
export function tfidfVectors(corpusTokens: string[][]): TfidfVector[] {
  const n = corpusTokens.length;
  const documentFrequency = new Map<string, number>();
  for (const tokens of corpusTokens) {
    for (const term of new Set(tokens)) {
      documentFrequency.set(term, (documentFrequency.get(term) ?? 0) + 1);
    }
  }

  return corpusTokens.map((tokens) => {
    const termFrequency = new Map<string, number>();
    for (const term of tokens) {
      termFrequency.set(term, (termFrequency.get(term) ?? 0) + 1);
    }
    const vector: TfidfVector = new Map();
    for (const [term, tf] of termFrequency) {
      const df = documentFrequency.get(term) ?? 0;
      const idf = Math.log((1 + n) / (1 + df)) + 1;
      vector.set(term, tf * idf);
    }
    return vector;
  });
}

/** Dot product of two sparse vectors, iterating the smaller one. */
function dotProduct(a: TfidfVector, b: TfidfVector): number {
  let sum = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) {
      sum += weight * other;
    }
  }
  return sum;
}

/** Cosine similarity between two sparse vectors (0..1 for non-negative TF-IDF). */
export function cosine(a: TfidfVector, b: TfidfVector): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  return dotProduct(a, b) / (norm(a) * norm(b));
}

/** A sparse vector paired with its precomputed L2 norm, so repeated cosine calls avoid re-norming. */
export interface NormedVector {
  counts: TfidfVector;
  norm: number;
}

/** Pairs a sparse vector with its L2 norm for repeated comparisons (P3 O(n) pre-pass). */
export function normedVector(counts: TfidfVector): NormedVector {
  return { counts, norm: norm(counts) };
}

/**
 * Cosine over vectors whose norms were precomputed. Bit-for-bit identical to
 * `cosine(a.counts, b.counts)`; it just skips recomputing the norms every call.
 */
export function cosineNormed(a: NormedVector, b: NormedVector): number {
  if (a.counts.size === 0 || b.counts.size === 0) {
    return 0;
  }
  return dotProduct(a.counts, b.counts) / (a.norm * b.norm);
}

/** Precomputed character n-gram frequency vector (with its norm) for one text. */
export function charNgramVector(text: string, n = 3): NormedVector {
  return normedVector(frequency(charNgrams(text, n)));
}

/** Terms shared by two token lists, most frequent first. */
export function sharedTerms(a: string[], b: string[], limit = 8): string[] {
  const countA = frequency(a);
  const setB = new Set(b);
  return [...countA.entries()]
    .filter(([term]) => setB.has(term))
    .sort((x, y) => y[1] - x[1])
    .slice(0, limit)
    .map(([term]) => term);
}

/** Levenshtein edit distance between two strings (two-row dynamic programming). */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  let prev = Array.from({ length: n + 1 }, (_, i) => i);
  let curr = new Array<number>(n + 1);
  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
    }
    [prev, curr] = [curr, prev];
  }
  return prev[n];
}

/** Normalized name similarity in 0..1 (1 = identical), trimmed and case-insensitive. */
export function nameSimilarity(a: string, b: string): number {
  const x = a.trim().toLowerCase();
  const y = b.trim().toLowerCase();
  if (x === y) return 1;
  const maxLen = Math.max(x.length, y.length);
  return maxLen === 0 ? 1 : 1 - levenshtein(x, y) / maxLen;
}

/**
 * Character n-grams of normalized text: lower-cased, reduced to letters, numbers
 * and single spaces. Strings shorter than `n` yield a single gram of the whole
 * string.
 *
 * Keeps any Unicode letter or number rather than `[a-z0-9]` (plan 10 Part D), for
 * the same reason as `tokenizeContent`: the ASCII-only class erased non-Latin text
 * entirely instead of comparing it.
 */
export function charNgrams(text: string, n = 3): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} ]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (normalized.length === 0) return [];
  if (normalized.length <= n) return [normalized];
  const grams: string[] = [];
  for (let i = 0; i + n <= normalized.length; i++) {
    grams.push(normalized.slice(i, i + n));
  }
  return grams;
}

/**
 * Cosine similarity over character n-gram frequency vectors (0..1). A separate,
 * corpus-independent metric that catches small spelling/morphological variation
 * token metrics miss (e.g. "formatter" vs "formatting").
 */
export function charNgramSimilarity(a: string, b: string, n = 3): number {
  return cosineNormed(charNgramVector(a, n), charNgramVector(b, n));
}

function norm(vector: TfidfVector): number {
  let sum = 0;
  for (const weight of vector.values()) {
    sum += weight * weight;
  }
  return Math.sqrt(sum) || 1;
}

function frequency(tokens: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const token of tokens) {
    counts.set(token, (counts.get(token) ?? 0) + 1);
  }
  return counts;
}
