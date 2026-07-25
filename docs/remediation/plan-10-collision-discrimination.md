# Plan 10 — Score collisions on scope, not on string overlap (implements P4)

Source: [round-3 evaluation](../algorithm-quality-evaluation-round3.md) §2, §7-P4.

**Depends on Plan 8** (its labeled pair corpus is this plan's only meaningful gate) and
**Plan 7 Part A** (the restrictive-boundary inversion must be fixed first, or it will
corrupt the feature sets this plan builds on). Run after both. Largest plan of the five —
budget accordingly and ship Part A before starting Part C.

## Context

Measured on a 13-pair labeled set at the default threshold 0.40:

```
TP=0  FN=6  FP=2  TN=5     recall 0%   precision 0%   AUC 0.64
```

The two **highest-scoring pairs in the entire set are both correctly-disambiguated
skills** — including the mutual `Python 2 only` / `Python 3 only` pattern that the
extension's own diagnostics tell authors to write. Every genuine paraphrase collision
falls below the threshold and is never reported.

```
label     sim   pair
DISTINCT  0.54  py2-migrate / py3-lint      (disjoint by explicit boundary)
DISTINCT  0.42  pdf-read / pdf-write        (same artifact, opposite capability)
COLLIDE   0.37  commit-msg / change-summary
COLLIDE   0.35  pdf-extract / pdf-reader
...
COLLIDE   0.15  csv-cleaner / tabular-fixer
```

**Root cause.** All four metrics — Jaccard, TF-IDF cosine, char n-gram, name Levenshtein
— measure lexical surface overlap. But genuine collisions are usually *paraphrases*
(little shared text), and non-collisions about a shared artifact share *a lot*. The
metric is systematically anti-correlated with the property of interest on exactly the
cases that matter, so **no threshold or weight choice fixes this.** Boundary damping is a
patch on the symptom.

Two secondary defects:

- **Bands are calibrated to an empty region.** Byte-identical descriptions score 0.80
  (barely `High`); changing one word (`files` → `documents`) drops to 0.48; a genuine
  paraphrase is 0.36. `High` (≥0.80) and `Medium` (≥0.60) are unreachable except by
  near-verbatim duplication, so in practice there is one band.
- **`nameSimilarity` injects up to 0.20 of noise unconditionally.** `report-builder` vs
  `report-breaker` — zero shared content tokens — scores `name=0.71`, contributing 0.14
  to a composite whose text metrics are all 0.00. Shared conventions (`pdf-*`,
  `*-writer`) inflate every pair in a tidy workspace.

The good news: `src/workspace/collisionFeatures.ts` **already extracts the right
features** — `capabilities`, `artifacts`, `positiveTriggers`, `negativeBoundaries`. They
are currently used only for boundary damping. This plan promotes them to the primary
signal.

## Reproduce first

Run `npm run benchmark:collisions` (Plan 8) and record recall / precision / AUC. Then
write the target assertions from the Acceptance criteria into that test and confirm they
fail.

## Part A — A scope-overlap metric built on the existing features

Add `scopeOverlap` to `src/workspace/collisionFeatures.ts`, computed from
`extractFeatures` output. The intuition to encode: **two skills collide when they do the
same kind of thing to the same kind of object, and nothing separates their triggers.**

```
artifactOverlap   = jaccard(artifacts(a),    artifacts(b))
capabilityOverlap = jaccard(capabilities(a), capabilities(b))
scopeOverlap      = sqrt(artifactOverlap * capabilityOverlap)      // geometric mean
```

The geometric mean is the load-bearing choice: it goes to **0 when either factor is 0**.
That is what separates `pdf-read` / `pdf-write` (artifacts overlap, capabilities do not
→ 0) from `pdf-extract` / `pdf-reader` (both overlap → high). An arithmetic mean would
keep `pdf-read`/`pdf-write` at ~0.5 and reproduce the current failure.

Handle the degenerate cases explicitly and test each:

- either feature set empty → `scopeOverlap = 0`, and mark the pair low-coverage (reuse
  the `textCoverage` field from Plan 6 Part C if present; otherwise add it here).
- both `capabilities` empty but artifacts identical → do **not** silently score 0; this is
  "no recognized verb in either description", an evidence gap, not evidence of
  distinctness. Fall back to `artifactOverlap * 0.5` and flag low coverage.

Extend `boundaryFeatures` to precompute the capability and artifact sets in the same
O(n) pre-pass, so the O(n²) loop stays a set intersection. Do not call `extractFeatures`
inside the pair loop — it runs regexes over the full description and would make a
600-skill scan quadratic in description length.

## Part B — Capability synonym folding

`extract` / `pull` / `read out`, `create` / `generate` / `produce` / `build`,
`fix` / `repair` / `correct`, `check` / `validate` / `verify` are the same capability for
scope purposes. Without folding, Part A's `capabilityOverlap` is 0 for most real
paraphrase collisions and the geometric mean kills them.

Add to `src/quality/defaultHeuristicDictionaries.json` (then
`npm run sync:heuristic-dictionaries`):

```json
"capabilitySynonymGroups": {
  "extract": ["extract", "pull", "retrieve", "scrape", "harvest"],
  "create":  ["create", "generate", "produce", "build", "make", "compose", "draft", "author"],
  "convert": ["convert", "transform", "translate", "migrate", "port"],
  "fix":     ["fix", "repair", "correct", "patch", "remediate"],
  "check":   ["check", "validate", "verify", "audit", "lint", "inspect", "review"],
  "read":    ["read", "parse", "load", "open", "ingest"],
  "write":   ["write", "save", "export", "emit", "render", "output"],
  "edit":    ["edit", "modify", "update", "change", "revise", "amend"],
  "summarize": ["summarize", "summarise", "condense", "abstract", "digest"],
  "explain": ["explain", "describe", "document", "annotate"]
}
```

Register the key in `src/quality/dictionaries.ts` (key array + interface). Add a
`capabilityGroupOf(base, dictionaries)` helper in `src/quality/wordForms.ts` next to
`normalizeContentToken`, memoized on the dictionary object like the existing
`VERB_FORMS_CACHE` / `SINGULAR_FORMS_CACHE`. Map each capability to its group id before
computing `capabilityOverlap`; unmapped verbs are their own group.

Two constraints:

- **Groups must be disjoint.** Add a startup-cheap validation (or a test) rejecting a
  verb appearing in two groups, otherwise `capabilityGroupOf` is order-dependent.
- `check` deliberately absorbs `review`, `lint`, `inspect`, `validate`, `audit`. Those
  are near-interchangeable in skill descriptions and they are exactly the verbs Plan 4
  excluded from Jaccard for being over-shared. Verify against the corpus that this does
  not manufacture false positives between genuinely different review skills — if it
  does, split `lint`/`review` into their own group and record why.

## Part C — Recompose the composite

Extend `CollisionMetrics` in `src/types/Workspace.ts` with `scopeOverlap` and add
`scopeOverlap` to `CollisionWeights` and the
`skillMdInspector.collision.weights` settings schema (with a `description`, following its
neighbours).

New default weights:

```json
{ "scopeOverlap": 0.45, "cosine": 0.25, "jaccard": 0.15, "charNgram": 0.10, "nameSimilarity": 0.05 }
```

Rationale, so the next maintainer does not re-tune blindly: scope overlap is the only
metric that models the actual question, so it leads. Cosine and Jaccard stay as
corroborating lexical evidence. `nameSimilarity` drops from 0.20 to 0.05 — it is a
tiebreaker, not evidence (§2.4). **These are a starting point; the corpus in Part E
decides the final values.**

Migration requirements — a user's existing `collision.weights` object must keep working:

- `normalizeWeights` must tolerate a weights object with **no** `scopeOverlap` key
  (existing user settings). Treat a missing key as the default 0.45 rather than 0,
  otherwise every user who ever customized weights silently keeps the broken metric.
  Document this in the setting description.
- Keep `additionalProperties: false` in the schema but add the new property, so a
  config written against the new schema validates.
- Keep the sum-normalization and the non-positive-sum fallback.

Boundary damping stays, unchanged in shape. With Part A it becomes a genuine refinement
rather than the only thing separating disjoint skills.

## Part D — Non-Latin coverage

`tokenizeContent` (`src/workspace/similarity.ts:15`) and `charNgrams` (line ~166) filter
to `[a-z0-9]`. Verified: two identical Cyrillic descriptions and two unrelated Cyrillic
descriptions both score **0.17**, entirely from name similarity.

Minimum bar for this plan — **signal, do not fabricate**:

- Widen both regexes to `\p{L}\p{N}` with the `u` flag so non-Latin text at least
  tokenizes. This alone makes identical Russian descriptions score ~1.0 instead of 0.17.
  Check the blast radius: `tokenizeContent`'s `length > 2` filter will now admit
  CJK tokens where 2 characters is a whole word — accept that, but verify the ASCII
  corpus is byte-identical afterwards.
- The stopword lists remain English, so a non-Latin pair's *content* filtering is
  weaker. Where fewer than 3 tokens survive on either side, keep the low text-coverage
  flag (Plan 6 Part C) rather than presenting a confident number.
- Do **not** attempt per-language stopwords here. `src/quality/language.ts` already
  detects script and several Latin-script profiles; wiring that into collision filtering
  is a follow-up, and the docstring should say so.

## Part E — Recalibrate the bands against the corpus

Only after A–D are in place:

1. Run `npm run benchmark:collisions` and print the sorted score table.
2. Choose `DEFAULT_COLLISION_THRESHOLD` and the `riskFor` band edges from the **observed
   score distribution** of the labeled corpus — the threshold at the best
   precision/recall balance, `Medium` at roughly the 60th percentile of `COLLIDE`
   scores, `High` where precision is ~1.0. Write the chosen numbers and the observed
   distribution into the `riskFor` docstring so the next person can see the derivation
   instead of guessing.
3. Update `skillMdInspector.collision.threshold`'s default in the settings schema if it
   changes, and say so in the CHANGELOG — it changes what existing users see.
4. Raise the Plan 8 test thresholds to the targets below and delete the `TODO(plan-10)`
   markers.

## Acceptance criteria

Against `benchmarks/collision-pairs/pairs.json` at the newly chosen default threshold:

1. **recall ≥ 0.70**, **precision ≥ 0.60**, **AUC ≥ 0.85**.
2. Specific pairs, each asserted by name:
   - `pdf-extract / pdf-reader` (COLLIDE) → reported, risk ≥ `Medium`.
   - `csv-cleaner / tabular-fixer` (COLLIDE, weakest lexical overlap in the set) →
     reported.
   - `pdf-read / pdf-write` (DISTINCT, same artifact) → **not** reported.
   - `py2-migrate / py3-lint` (DISTINCT, explicit mutual boundaries) → **not** reported,
     and strictly below every COLLIDE pair.
   - `k8s-deploy / recipe-scale` (DISTINCT, identical template prose) → not reported.
3. Two identical Cyrillic descriptions → similarity ≥ 0.80; two unrelated Cyrillic
   descriptions → below threshold. (Today both are 0.17.)
4. `report-builder / report-breaker` (unrelated, similar names) → ≤ 0.10.
5. A user `collision.weights` object written against the **old** schema (no
   `scopeOverlap`) still loads, and produces the new default behavior. Explicit test.
6. `similarity.property.test.ts` invariants still hold — symmetry, identity → 1, bounds
   in [0,1]. A property failure means the implementation is wrong, not the property.
7. `detectCollisions` at n=600 stays under ~2 s (measured 1.28 s today) — `extractFeatures`
   must not have entered the pair loop. Assert with a timing test or by inspection plus a
   note in the commit message.
8. Row-level cancellation still works.
9. `npm run check:heuristic-dictionaries` passes.
10. Full verification checklist passes.

## Non-goals

- **No embeddings, no model calls, no network.** `src/workspace/` stays deterministic and
  offline. The synonym table is the semantic layer.
- Do not remove `jaccard`, `cosine`, `charNgram`, or `nameSimilarity`. They are
  corroborating evidence and users have tuned their weights; they get re-weighted, not
  deleted.
- Do not change `detectNameConflicts` / `detectSimilarNames` semantics (Plan 7 Part C
  handles its cancellation).
- Do not touch the description scorer's criteria or ceilings (Plan 9).
- No per-pair IDF rework; TF-IDF's documented corpus dependence stays documented.

## If Part A + B do not reach the targets

Escalate in this order, stopping as soon as the gate passes, and record what you tried:

1. Weight `artifactOverlap` above `capabilityOverlap` in the geometric mean
   (`artifact^0.6 * capability^0.4`) — artifact agreement is the stronger collision
   signal in the corpus.
2. Add trigger-clause overlap as a fourth feature comparison (the `positiveTriggers`
   feature is already extracted and currently unused for scoring).
3. Fold artifacts through a synonym layer too (`spreadsheet ≈ xlsx ≈ workbook`,
   `document ≈ doc ≈ docx`).

If after all three the corpus still fails, **stop and report** rather than tuning weights
until the numbers pass. Weight-fitting a 24-pair corpus produces a metric that works on
24 pairs. Say so in the commit message and leave the gate red with an explanation — a
documented red gate is more useful than a green one that overfits.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run check:heuristic-dictionaries
npm run benchmark
```
