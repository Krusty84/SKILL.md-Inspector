# Plan 13 — Bound every unbounded input path

Source: round-4 algorithm evaluation. Self-contained; no external report required.

**Independent of Plans 12 and 14–17.** Touches `src/analysis/`, `src/parser/globMatch.ts`,
`src/parser/valueRanges.ts`, `src/opencode/`, and `src/config.ts`.

Four hot paths are superlinear in input size with no guard, and three of them run on the
**250 ms debounced while-typing path**. Every number was measured under node against the
shipped modules.

## Context

**A. The tokenizer is O(n²) in the length of one unbroken character run.**
`countO200kTokens` (`o200kTokenizer.ts:21`) encodes whatever it is handed. BPE merging
inside a single pre-token is quadratic, and the o200k pre-tokenizer does not bound runs of
letters, ideographs, or punctuation — only digits.

`analyzeSkill` in **`text-only` mode** (the keystroke path), single-line body:

| body | time |
|---|---|
| 10,000 chars | 7,480 ms |
| 20,000 chars | 30,486 ms |
| 40,000 chars | 120,569 ms |
| 200,000 chars | **2,924,179 ms (48.7 minutes)** |

`countO200kTokens` at 16,000 characters, by class:

| class | time | | class | time |
|---|---|---|---|---|
| lowercase letters | 19,908 ms | | CJK ideographs | **175,148 ms** |
| uppercase letters | 18,627 ms | | digits | 6 ms |
| `#` × 50,000 | 192,711 ms | | `[`×20k + `]`×20k | 91,276 ms |

Control: 500 KB of ordinary prose → **488 ms**. Punctuation every 80 characters restores
linearity (32 KB → 219 ms). So realistic prose is safe; a long unbroken run is not — and
NBSP/zero-width padding, exactly what `scanInvisible` exists to detect, is a long
unbroken run.

**B. Token counting is the only file-reading path with no byte cap.**
`countResourceTokens` (`tokenUsage.ts:83`) calls `readUtf8Text(absolutePath)` **without**
`maxBytes`. The option exists (`textFile.ts:130`) and the security scanner uses it
(`maxScannedFileSizeBytes`, 256 KB default). A 300 MB text resource is read whole and
BPE-encoded.

**C. The glob compiler is exponentially backtrackable.** `globToRegExp`
(`globMatch.ts:20-64`) emits unbounded `(?:.*/)?` and alternation nesting with no
complexity guard, and the compiled regex is tested against every discovered file.

```
"**/**/**/**/**/**/**/x"          vs a 121-char path → 14,774 ms
"{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}X" (41 chars) vs a 24-char name → 26,743 ms
```

Source is the user's own `skillMdInspector.resources.exclude`, so it is self-inflicted —
but it freezes the extension host and there is no error to explain why.

**D. `offsetRange` rescans from the value start for every match** (`valueRanges.ts:57`),
making the invisible-Unicode scan quadratic: a 224 KB body with 8,000 zero-width spaces
spends 1.93 s in `offsetRange` alone.

**E. OpenCode: two hard crashes and a quadratic loop, all far under the 25 MB limit.**

```
parts in one message:
   20,000 / 313 KB → ok (100,016 diagnostics, 2,105 ms)
   30,000 / 469 KB → RangeError: Maximum call stack size exceeded
```

`parseSessionExport.ts:47` spreads an array into `Array.push`. Separately a value nested
20,000 deep throws `RangeError` out of `JSON.stringify` in `util.ts:33`. And
`normalizeSession` is superlinear (4k parts 60 ms → 8k 356 ms → 16k 2,113 ms) via the
per-node lookup in `deriveParentTime` (`buildTrajectory.ts:386`). Note also that events
are capped at 200 while **diagnostics are uncapped** — 20,000 parts produce 100,016 of
them, structured-cloned across `postMessage` on every `initialize`.

## Reproduce first

`test/analysis/inputBounds.test.ts` and `test/opencode/inputBounds.test.ts`: assert a
wall-clock ceiling (e.g. 2 s) for each case above and assert no throw for the two
`RangeError` inputs. Use modest sizes so the suite stays fast — 16,000 characters and
30,000 parts are already past the cliff.

## Scope

- **`src/analysis/o200kTokenizer.ts`** — add `MAX_ENCODABLE_RUN`. Before encoding, split
  the input on a bounded run length (e.g. every 1,024 characters that contain no
  whitespace) and sum the per-chunk counts. Chunking changes the count slightly at the
  seams; that is acceptable and must be stated in `docs/rules.md` — an approximate count
  in bounded time beats an exact count in 49 minutes. Alternatively, refuse past a
  `MAX_TOKENIZED_CHARACTERS` ceiling and return `undefined`, which the callers already
  model for resources.
- **`src/analysis/tokenUsage.ts:83`** — pass `{ maxBytes }`, threaded from the same
  setting family as `maxScannedFileSizeBytes` (a new
  `skillMdInspector.tokens.maxCountedFileSizeBytes`, default 1 MB). `undefined` already
  means "skipped".
- **`src/parser/globMatch.ts`** — reject patterns whose compiled source exceeds a
  complexity budget (count of `.*`/`(?:` groups, e.g. > 8) and surface a configuration
  warning through the existing output channel instead of compiling them.
- **`src/parser/valueRanges.ts:57`** — track a running offset across matches instead of
  rescanning from the value start.
- **`src/opencode/parseSessionExport.ts:47`** — replace the spread-push with a loop or
  `Array.prototype.push.apply` in bounded chunks; cap the diagnostic list (e.g. 5,000)
  with a single "N further problems suppressed" entry.
- **`src/opencode/util.ts:33`** — depth-guard or try/catch the `JSON.stringify`.
- **`src/opencode/buildTrajectory.ts:386`** — index nodes by id in a `Map` once instead of
  scanning per node.

**Non-goals.** No change to which files are counted, to the thresholds themselves, or to
the OpenCode data model.

## Acceptance criteria

1. `analyzeSkill` on a 200,000-character single-line body completes in **< 2 s**.
2. `countO200kTokens` on 16,000 CJK ideographs completes in **< 500 ms**.
3. A resource file above the cap is skipped, not encoded, and the report says so.
4. Both glob patterns in Part C are rejected with a configuration warning in **< 10 ms**.
5. A 224 KB body with 8,000 zero-width characters scans in **< 200 ms**.
6. 30,000-part and 20,000-deep OpenCode exports parse and normalize without throwing;
   64,000 parts normalize in **< 5 s**.
7. Ordinary prose token counts are unchanged: the 500 KB control still reports 200,001
   tokens (or the chunked value, recorded in the test as the new expected constant).

## Verification checklist

```
npm run check-types && npm run lint && npm test && npm run check:heuristic-dictionaries
```
