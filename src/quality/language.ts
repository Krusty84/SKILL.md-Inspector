/**
 * Lightweight, dependency-free language check for the description analyzer. The
 * verb/vague/artifact dictionaries are English, so a non-English description can
 * only be analyzed structurally; this flags that case so the quality result can
 * be marked language-limited.
 *
 * Two stages, both deterministic:
 *  1. Script: text dominated by a non-Latin script (Cyrillic, CJK, …).
 *  2. Stopword profile: Latin-script text whose function words match a German,
 *     French, Spanish, Italian, or Portuguese profile clearly better than the
 *     English one.
 *
 * Precision beats recall throughout — a false "non-English" on an English
 * description would wrongly suppress real findings, so the profile stage
 * requires several hits across at least two distinct marker words, and short
 * texts stay undecided (`false`). Languages without a profile are still scored
 * as English.
 */

/** High-precision function-word profiles, matched as whole lowercase tokens. */
const ENGLISH_PROFILE = new Set(
  'the a an and for with when to use not of in on is are do'.split(' '),
);

const FOREIGN_PROFILES: ReadonlyMap<string, ReadonlySet<string>> = new Map([
  ['de', new Set('der die das und für nicht mit von bei werden wird verwenden eine einen ist'.split(' '))],
  ['fr', new Set('le la les des une pour pas avec dans est sont utiliser ne du au aux'.split(' '))],
  ['es', new Set('el la los las una para con cuando desde usar no se por es son'.split(' '))],
  ['it', new Set('il lo la gli le una per con quando usare non di da è sono'.split(' '))],
  ['pt', new Set('o os as um uma para com quando usar não de da do é são'.split(' '))],
]);

/** Below this many word tokens the profile stage is undecidable. */
const MIN_DECIDABLE_TOKENS = 5;
/** A foreign profile needs this many total hits … */
const MIN_FOREIGN_HITS = 3;
/** … spread across at least this many distinct marker words ("No X. No Y." is not Spanish). */
const MIN_DISTINCT_FOREIGN_MARKERS = 2;

export function isProbablyNonEnglish(text: string): boolean {
  const letters = text.match(/\p{L}/gu);
  if (!letters || letters.length === 0) {
    return false; // no letters (digits/punctuation only) — nothing to warn about
  }
  const latin = (text.match(/\p{Script=Latin}/gu) ?? []).length;
  if (latin / letters.length < 0.5) {
    return true; // dominated by a non-Latin script
  }
  return hasDominantForeignProfile(text);
}

function hasDominantForeignProfile(text: string): boolean {
  const tokens = (text.toLowerCase().match(/\p{L}+/gu) ?? []).filter(Boolean);
  if (tokens.length < MIN_DECIDABLE_TOKENS) {
    return false;
  }
  let englishHits = 0;
  for (const token of tokens) {
    if (ENGLISH_PROFILE.has(token)) {
      englishHits += 1;
    }
  }
  for (const profile of FOREIGN_PROFILES.values()) {
    let hits = 0;
    const distinct = new Set<string>();
    for (const token of tokens) {
      if (profile.has(token)) {
        hits += 1;
        distinct.add(token);
      }
    }
    // Clear-margin rule: enough hits, enough distinct markers, and a strictly
    // better hit count than English over the same tokens. When in doubt, false.
    if (hits >= MIN_FOREIGN_HITS && distinct.size >= MIN_DISTINCT_FOREIGN_MARKERS && hits > englishHits) {
      return true;
    }
  }
  return false;
}
