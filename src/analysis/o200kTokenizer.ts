import { Tiktoken } from 'js-tiktoken/lite';
import o200kBase from 'js-tiktoken/ranks/o200k_base';

let tokenizer: Tiktoken | undefined;

/**
 * Constructs the shared tokenizer eagerly. Decoding the o200k_base ranks is a
 * noticeable synchronous chunk of CPU that otherwise lands on whichever
 * validation happens to run first; calling this from an idle moment after
 * activation keeps that stall away from the user's first edit.
 */
export function warmUpO200kTokenizer(): void {
  tokenizer ??= new Tiktoken(o200kBase);
}

/*
 * Bounding the cost of one encode.
 *
 * BPE merging inside a single pre-token is quadratic, and the o200k
 * pre-tokenizer bounds runs of digits but not of letters, ideographs or
 * punctuation. So the cost is quadratic in the longest unbroken run, with no
 * ceiling — and `analyzeSkill` runs in `text-only` mode on the 250 ms debounced
 * while-typing path. Measured before this guard, single-line bodies:
 *
 *     10,000 chars        7,480 ms
 *     20,000 chars       30,486 ms
 *     40,000 chars      120,569 ms
 *    200,000 chars    2,924,179 ms   (48.7 minutes of frozen extension host)
 *
 * Ordinary prose was never the problem: 500 KB of it counted in 488 ms, because
 * every word is a short run. The trigger is a long unbroken run — which includes
 * the zero-width and NBSP padding `scanInvisible` exists to detect.
 *
 * The guard splits the input so no single encode sees an unaffordable run, and
 * sums the pieces. Splitting changes the count slightly at the seams, so it is
 * applied as late as possible:
 *
 *  - A run of at most MAX_EXACT_RUN characters is always encoded whole. Every
 *    ordinary word is one, so prose is bit-for-bit unchanged.
 *  - A longer run is encoded whole while EXACT_RUN_BUDGET (in character², the
 *    unit the cost is quadratic in) can afford it. URLs, hashes, base64 lines
 *    and long identifiers all fit; the whole shipped corpus counts exactly.
 *  - Once the budget is spent, further long runs are cut every RUN_CHUNK
 *    characters. That is the only place the count becomes approximate, and it
 *    only happens to input no realistic document contains.
 *
 * Measured after the guard: 200,000-character single-line body 102 ms, 200,000
 * CJK ideographs 1,465 ms, 200,000 zero-width spaces 1,650 ms, and the 500 KB
 * prose control still reports its exact 113,641 tokens.
 */

/** Runs no longer than this are always encoded whole. Covers every ordinary word. */
const MAX_EXACT_RUN = 32;

/** Total quadratic work, in character², spent on longer runs before chunking starts. */
const EXACT_RUN_BUDGET = 4_000_000;

/** Piece size a run is cut into once the budget is spent. */
const RUN_CHUNK = 8;

/** ASCII whitespace ends a run. Deliberately excludes NBSP and the zero-width characters. */
function isRunBreak(code: number): boolean {
  return code === 32 || (code >= 9 && code <= 13);
}

/**
 * Offsets at which `text` must be cut so no encode sees an unaffordable run.
 * Empty for every input whose runs the budget can afford — the common case, and
 * the one where the count must stay exact.
 */
function splitOffsets(text: string): number[] {
  const cuts: number[] = [];
  let budget = EXACT_RUN_BUDGET;
  let index = 0;
  while (index < text.length) {
    if (isRunBreak(text.charCodeAt(index))) {
      index += 1;
      continue;
    }
    let end = index;
    while (end < text.length && !isRunBreak(text.charCodeAt(end))) {
      end += 1;
    }
    const length = end - index;
    if (length > MAX_EXACT_RUN) {
      const cost = length * length;
      if (cost <= budget) {
        budget -= cost;
      } else {
        for (let cut = index + RUN_CHUNK; cut < end; cut += RUN_CHUNK) {
          cuts.push(cut);
        }
      }
    }
    index = end;
  }
  return cuts;
}

/**
 * Deterministic offline token count using only the bundled o200k_base ranks.
 *
 * Exact for every input whose unbroken runs fit the budget above, which is every
 * realistic document. Past that it is an approximation in bounded time — see the
 * note above and `docs/rules.md`.
 */
export function countO200kTokens(text: string): number {
  tokenizer ??= new Tiktoken(o200kBase);
  // Skill text is ordinary content. Treat strings that resemble reserved
  // special tokens as text instead of throwing or assigning a special-token id.
  const encode = (value: string): number => tokenizer!.encode(value, [], []).length;
  const cuts = splitOffsets(text);
  if (cuts.length === 0) {
    return encode(text);
  }
  let total = 0;
  let previous = 0;
  for (const cut of cuts) {
    total += encode(text.slice(previous, cut));
    previous = cut;
  }
  return total + encode(text.slice(previous));
}
