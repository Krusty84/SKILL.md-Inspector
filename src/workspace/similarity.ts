/**
 * Deterministic text-similarity helpers for skill collision detection
 * (brief §13.2). Content tokens drop very common/skill-generic stopwords so the
 * signal comes from the domain-specific words.
 */

const STOPWORDS = new Set([
  'the',
  'a',
  'an',
  'and',
  'or',
  'to',
  'of',
  'in',
  'on',
  'for',
  'with',
  'from',
  'by',
  'as',
  'at',
  'is',
  'are',
  'be',
  'this',
  'that',
  'these',
  'those',
  'it',
  'use',
  'used',
  'using',
  'when',
  'skill',
  'agent',
  'user',
  'users',
  'do',
  'not',
  'you',
  'your',
  'can',
  'will',
  'should',
  'if',
  'into',
  'out',
  'up',
  'via',
  'per',
]);

/** Lower-cases and keeps meaningful tokens (length > 2, non-stopword). */
export function tokenizeContent(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) ?? []).filter(
    (token) => token.length > 2 && !STOPWORDS.has(token),
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

/** Cosine similarity between two sparse vectors (0..1 for non-negative TF-IDF). */
export function cosine(a: TfidfVector, b: TfidfVector): number {
  if (a.size === 0 || b.size === 0) {
    return 0;
  }
  let dot = 0;
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [term, weight] of small) {
    const other = large.get(term);
    if (other !== undefined) {
      dot += weight * other;
    }
  }
  return dot / (norm(a) * norm(b));
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
 * Character n-grams of normalized text: lower-cased, reduced to alphanumerics and
 * single spaces. Strings shorter than `n` yield a single gram of the whole string.
 */
export function charNgrams(text: string, n = 3): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, ' ')
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
  return cosine(frequency(charNgrams(a, n)), frequency(charNgrams(b, n)));
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
