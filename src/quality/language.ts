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

/**
 * Each foreign profile splits into **unique** markers (diacritic-bearing or
 * genuinely English-rare words) and **homograph** markers (words that also occur
 * in English technical prose: "die casting", "von Bosch", "para-virtualized",
 * "No GUI", "per file", the EST/MIT tokens…). At least one unique marker must
 * hit before a profile can flag; homographs then only add supporting weight
 * (plan 5 Part C). Dutch has no profile — its function words (de/het/een) are
 * homograph-heavy and need their own precision work, so Dutch is scored as
 * English (documented gap).
 */
interface ForeignProfile {
  unique: ReadonlySet<string>;
  homograph: ReadonlySet<string>;
}

function profile(unique: string, homograph: string): ForeignProfile {
  return { unique: new Set(unique.split(' ')), homograph: new Set(homograph.split(' ')) };
}

const FOREIGN_PROFILES: readonly ForeignProfile[] = [
  profile('für nicht werden wird verwenden ist und eine einen', 'der die das mit von bei'), // de
  profile('pour pas avec dans ne aux utiliser sont', 'le la les des une est du au'), // fr
  profile('cuando usar desde según imágenes', 'el la los las una para con no se por es son'), // es
  profile('usare gli perché è sono quando', 'il lo la le una per con non di da'), // it
  profile('usar quando não são é', 'o os as um uma para com de da do'), // pt
];

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
  for (const { unique, homograph } of FOREIGN_PROFILES) {
    let uniqueHits = 0;
    let hits = 0;
    const distinct = new Set<string>();
    for (const token of tokens) {
      if (unique.has(token)) {
        uniqueHits += 1;
        hits += 1;
        distinct.add(token);
      } else if (homograph.has(token)) {
        hits += 1;
        distinct.add(token);
      }
    }
    // Clear-margin rule: at least one unique marker, enough hits, enough
    // distinct markers, and a strictly better hit count than English over the
    // same tokens. When in doubt, false.
    if (
      uniqueHits >= 1 &&
      hits >= MIN_FOREIGN_HITS &&
      distinct.size >= MIN_DISTINCT_FOREIGN_MARKERS &&
      hits > englishHits
    ) {
      return true;
    }
  }
  return false;
}
