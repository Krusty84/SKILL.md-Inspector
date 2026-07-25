# Plan 7 — Four concrete defects (implements P2)

Source: [round-3 evaluation](../algorithm-quality-evaluation-round3.md) §2.5, §4, §5, §1.2c.

Independent of Plans 6 and 8–10. Four unrelated defects, each small, each independently
shippable. Do them in one session but **one commit per part** so any single one can be
reverted.

---

## Part A — `only for X` / `limited to X` are treated as exclusions (collision side)

### Context

`src/workspace/collisionFeatures.ts` pools `restrictiveBoundaryPhrases`
(`limited to, only for, exclude, excluding, except when, except for`) with
`negativeBoundaryPhrases` (`do not use for, never use when, …`) in four places
(lines ~107, ~122, ~183, ~196). The restrictive phrases then land in the **exclusion**
token set. Verified:

```
"Format PDF invoices. Only for PDF files."   ->  boundaryClauses = ["PDF files"]
```

`Only for PDF files` means *PDF is my scope*. Treating it as *PDF is excluded* inverts
the meaning, so two skills that both declare `Only for PDF files` — i.e. maximally
colliding — get their composite **damped**:

```
two PDF skills, both "Only for PDF files":
  composite with boundary damping     0.66
  composite with damping disabled     0.79     <- damping cost -0.13 on a TRUE positive
```

`exclude` / `excluding` / `except for` / `except when` genuinely *are* exclusions and
must stay in the boundary set. `limited to` and `only for` are the inverted pair.

### Task

1. Split the dictionary. In `src/quality/defaultHeuristicDictionaries.json`, keep
   `restrictiveBoundaryPhrases` as-is (it is a published user setting — do not remove or
   repurpose it) and add a new list:

   ```json
   "scopeRestrictionPhrases": ["limited to", "only for"]
   ```

   Remove those two entries from `restrictiveBoundaryPhrases`, leaving
   `["exclude", "excluding", "except when", "except for"]`. Register the new key in
   `src/quality/dictionaries.ts` (both the key array at line ~15 and the
   `HeuristicDictionaries` interface at line ~46), then run
   `npm run sync:heuristic-dictionaries`. Add a `description` for the new setting in the
   generated `package.json` block via the JSON source, following the style of its
   neighbours.

2. In `collisionFeatures.ts`:
   - `boundaryTokens` / `extractNegativeBoundaries`: use
     `negativeBoundaryPhrases + restrictiveBoundaryPhrases` (i.e. no longer the
     scope-restriction phrases).
   - `domainTokens`: strip only `negativeBoundaryPhrases + restrictiveBoundaryPhrases`
     clauses, so a `only for X` clause's tokens **remain in the domain set** — which is
     what makes two `Only for PDF` skills read as overlapping.
   - `extractPositiveTriggers`: `scopeRestrictionPhrases` should now be treated as
     positive-trigger markers, not stripped as boundaries. A skill that says
     `Only for PDF files` has told you its trigger scope.

3. **Do not change `assessScopeClause` in `src/quality/descriptionHeuristics.ts`.**
   There, `restrictiveBoundaryPhrases` are used as *boundary-criterion markers* for the
   description score, and that is defensible: `only for X` does bound the skill's scope,
   so crediting the "Boundary phrase" criterion is correct behavior. Only the collision
   layer's exclusion semantics are wrong. A future maintainer will be tempted to
   "fix both" — add a comment at both sites explaining why they legitimately differ.

### Acceptance criteria

- `extractNegativeBoundaries('Format PDF invoices. Only for PDF files.')` → `[]`.
- `extractNegativeBoundaries('Format PDF invoices. Do not use for spreadsheets.')` →
  `['spreadsheets']` (unchanged).
- `boundarySeparation(a, b)` for two skills both saying `Only for PDF files` → `0`.
- Composite for that pair ≥ **0.75** (was 0.66) and reported as a collision.
- The `Python 2 only / Python 3 only` mutual-`do not use` pair keeps its current
  damping — this part must not weaken genuine negative boundaries.
- `assessScopeClause('… Only for PDF files.', 'boundary').contentFound` is still `true`.
- `npm run check:heuristic-dictionaries` passes.

---

## Part B — A description that fails validation scores 90 / "excellent"

### Context

Verified:

```
description length 1100, profile maxLength 1024
validation: error: skill.description.tooLong
quality:    score 90, label "excellent"
```

`scoreLength` in `src/quality/staticDescriptionQuality.ts` returns 0 for
`length > maxLength`, but `assessGradeLimitations` creates **no ceiling**. So a hard
specification error costs 10 of 100 points and leaves the skill in the top band. Every
other essential failure (missing capability, missing artifact, missing trigger) correctly
imposes a ceiling. This is an omission, not a policy.

### Task

Add to `assessGradeLimitations` (it needs the length and `maxLength`, which
`scoreAnalysis` already has — pass them in, or move the check into `scoreAnalysis`
alongside the other limitation pushes):

```ts
{
  code: 'over-maximum-length',
  ceiling: 59,
  reason: 'The description exceeds the configured maximum length, which is a specification error, so the adjusted score cannot exceed 59.',
}
```

Add `'over-maximum-length'` to `StaticDescriptionQualityGradeLimitationCode` in
`src/types/StaticDescriptionQuality.ts`.

Ceiling 59 matches the other essential failures and puts the skill in `weak`, which is
correct: a description the spec rejects is not an acceptable description.

### Acceptance criteria

- A 1100-character description with `maxLength: 1024` → `score ≤ 59`,
  `gradeLimitations` contains `over-maximum-length`.
- A 1024-character description (exactly at the limit) → **no** `over-maximum-length`
  limitation. Test the boundary explicitly.
- `rawScore` is unchanged by this part (it is a ceiling, not a deduction) — assert it.
- Add a benchmark case in `benchmarks/static-description-quality/cases.json` covering
  an over-length description, with `gradeLimitations: ["over-maximum-length"]`.
  Remember the harness caps band width at 25 points and requires ≥ 45 cases.

---

## Part C — `detectSimilarNames` is an uninterruptible O(n²) tail

### Context

`src/workspace/analyzeWorkspace.ts:75` calls `detectSimilarNames(named, threshold)`
immediately after the now-cancellable `detectCollisions`. It takes no cancellation
token. Measured on this checkout:

```
n= 200  ->   96ms
n= 500  ->  554ms
n=1000  -> 2100ms   (500k pairwise Levenshtein calls)
```

So a cancelled workspace scan still blocks ~2 s at n=1000 after the user asked it to stop.

### Task

Mirror the signature `detectCollisions` already uses:

```ts
export function detectSimilarNames(
  skills: NamedSkill[],
  threshold = 0.8,
  cancel?: { isCancellationRequested: boolean },
): SimilarNames[]
```

Check `cancel?.isCancellationRequested` in the **outer** loop only (per row), matching
`detectCollisions`' granularity, and `break`. Pass `options.cancel` from
`analyzeWorkspace`. If the token trips during `detectSimilarNames`, set
`cancelled = true` in the returned analysis — the existing post-`detectCollisions` check
already does this for the collision phase; extend it rather than duplicating the pattern.

A cheap and worthwhile extra: skip the Levenshtein entirely when
`Math.abs(a.length - b.length) / Math.max(a.length, b.length) > 1 - threshold`, since
normalized edit distance cannot reach the threshold when the lengths differ that much.
Assert this is behavior-preserving (identical output on a fixture of ≥50 names).

### Acceptance criteria

- Signature accepts an optional cancel token; existing 2-argument calls still compile.
- With a token already cancelled, `detectSimilarNames` over 1000 names returns in
  < 50 ms.
- Output with no token is **identical** to today's on a ≥ 50-name fixture (including
  order), with and without the length-gap short circuit.
- `analyzeWorkspace` reports `cancelled: true` when the token trips during the
  similar-names phase.

---

## Part D — The trigger grammar misses the most common real phrasings

### Context

Measured — all of these state a trigger unmistakably; only the first two are recognized:

```
FULL  Use this skill when the user edits a spreadsheet.
FULL  Use this skill whenever the user edits a spreadsheet.
NONE  Use this skill any time a spreadsheet is the input.        <- verbatim `xlsx` shape
NONE  Use this skill in cases where the user edits a spreadsheet.
NONE  Use this skill wherever a spreadsheet is involved.
NONE  Reach for this skill when the user edits a spreadsheet.
NONE  Trigger on spreadsheet editing requests.
```

Two distinct causes:

1. `POSITIVE_USAGE_GRAMMAR` (`descriptionHeuristics.ts:356`) ends in
   `\b(?:whenever|when|for|if)\b`. `any time`, `anytime`, `in cases where`, `wherever`,
   `on any` are absent. This is why the shipped `xlsx` skill — one of the most explicit
   triggers in the whole production corpus — is capped at 69 for
   `missing-usage-trigger`.
2. `USAGE_CONTEXT_PATTERN` (line ~96) hardcodes the verb family
   `use|using|invoke|activate|select|choose` before `this|the skill`. Any other lead-in
   (*Reach for*, *Consult*, *Load*, *Refer to*, *Apply this guidance*) fails the usage
   check, so `agentWhenAllowed` rejects the `when the user` marker. This is Plan 5's
   precision hardening over-firing; Plan 5 measured its precision gain but not its
   recall cost.

### Task

1. Extend the scope conjunction alternation in `POSITIVE_USAGE_GRAMMAR` to
   `(?:whenever|when|wherever|for|if|any\s?time|in\s+cases?\s+where|on\s+any)`.
   Keep the existing `DURATION_AFTER_FOR` and `THIRD_PERSON_USAGE` guards intact — they
   are the reason precision holds — and verify they still fire (regression-test
   `Runs for 10 minutes` → still no trigger).
2. Extend the usage-verb family in `USAGE_CONTEXT_PATTERN` with
   `reach\s+for|consult|refer\s+to|load|read`. Be careful: this pattern is also used by
   `analyzeOverbroadTrigger`, so widening it widens overbroad detection too. That is
   directionally correct (an overbroad claim is overbroad however it is introduced) but
   must be covered by a test either way.
3. `Trigger on spreadsheet editing requests.` — the `NEGATIVE_USAGE_GRAMMAR` already
   accepts `on` as a conjunction but the positive one does not. Adding `on\s+any` above
   is deliberately narrower than bare `on`, because bare `on` would fire on
   *"Operates on large files"*. Leave the bare-`on` case unrecognized and record that in
   a comment; do not chase it here.

### Acceptance criteria

- All of these yield `contentFound === true` for `assessScopeClause(…, 'trigger')`:
  - `Use this skill any time a spreadsheet is the input.`
  - `Use this skill in cases where the user edits a spreadsheet.`
  - `Use this skill wherever a spreadsheet is involved.`
  - `Reach for this skill when the user edits a spreadsheet.`
- These must still yield **no** trigger (precision regression guards):
  - `Runs for 10 minutes on large files.`
  - `Applies fixes if the linter reports an error.`
  - `The tool crashes when the user provides malformed frames.`
  - `Should not be used when the input is encrypted.`
- The verbatim `xlsx` production description gains its trigger and loses the
  `missing-usage-trigger` limitation. Add it to the benchmark corpus as a named
  regression case.
- Add benchmark cases for each new recognized form **and** each precision guard.

---

## Non-goals (whole plan)

- No dictionary expansion (Plan 9) and no collision rescoring (Plan 10).
- No change to the composite formula, weights schema, thresholds, or risk bands.
- No change to `nameSimilarity` itself in Part C — only its call loop.
- Do not "unify" the boundary-phrase handling between the quality and collision layers;
  Part A depends on them differing.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run check:heuristic-dictionaries
npm run benchmark:static
```
