# Plan 4 — Collision boilerplate damping + morphology fixes

Run after Plan 1. Independent of Plans 2–3 in code; shares
`src/quality/defaultHeuristicDictionaries.json` with Plan 2, so run sequentially with
it (or resolve the trivial JSON merge).

## Context

`detectCollisions` (`src/workspace/detectSkillCollisions.ts`) blends four metrics
(token Jaccard, TF-IDF cosine, character n-gram, name similarity) minus a
boundary-separation damping. The architecture is good. The measured problem: **shared
description boilerplate reads as scope overlap.** Verified against the shipped code
with the default weights/threshold:

Fixture 1 — *template pair* (clearly distinct skills, same house phrasing):

```
terraform-review: "Use this skill when the user asks to review, validate, or lint
  infrastructure code. This skill helps the user work with Terraform plans and
  modules. Do not use when the user asks about application code."
sql-review:       "Use this skill when the user asks to review, validate, or lint
  database queries. This skill helps the user work with SQL statements and
  migrations. Do not use when the user asks about application code."
```

→ composite **0.56** (reported as a collision; char n-gram alone is **0.88** because it
runs over the raw text where the template prose dominates; Jaccard 0.50 from generic
words like *asks, helps, work, about* plus shared capability verbs).

Fixture 2 — *true near-duplicate pair* (should be reported):

```
a-skill: "Format PDF invoices for the accounting team using standard layout rules."
b-skill: "Format PDF invoices for the legal team using contract layout rules."
```

→ composite **0.68** today.

Also verified: adding 20 unrelated skills to the workspace moved fixture 2 from 0.68 to
0.71 (TF-IDF document frequencies are corpus-wide — inherent to TF-IDF, needs
documenting, not fixing).

Separate morphology defect in `src/quality/wordForms.ts`: the `/(is|us|ss)$/` guard in
`singularize` (protecting *analysis*, *basis*) also blocks the very common plural
**"apis"**, so `normalizeContentToken('apis') === 'apis'` and "API" vs "APIs" never
merge in collision tokens or the scope-echo check. Similarly `singularize('axes') ===
'ax'` and `singularize('vertices') === 'vertice'`.

## Reproduce first

Add `test/collisionBoilerplate.test.ts` with both fixtures asserting the **target**
behavior (below), and extend `test/wordForms.test.ts` with the plural cases. Confirm
the new assertions fail before implementing.

## Part A — Stop the char n-gram metric from measuring boilerplate

In `detectCollisions`, build the n-gram vectors from the **normalized, stopword-
filtered content tokens** (i.e. `tokens[i].join(' ')` from the existing pre-pass)
instead of the raw description. This keeps the metric's purpose — catching spelling and
morphological variation between *content* words — and removes template prose from it.
Keep the exported `charNgrams` / `charNgramSimilarity` helper signatures; only the
call site's input changes. Update affected expectations in
`test/detectSkillCollisions.test.ts` / `test/similarity.test.ts` deliberately (the
numbers will shift — verify each changed expectation against the fixtures' intent, do
not just re-record).

## Part B — Separate template filler and capability verbs from scope signal

Two coordinated levers; calibrate against the fixtures:

1. Extend `collisionStopwords` in `src/quality/defaultHeuristicDictionaries.json` with
   template filler that says nothing about scope: `ask, asks, asked, help, helps,
   want, wants, need, needs, work, works, about` (audit for collateral damage: these
   also feed `tokenizeContent`, which is used by boundary/domain token sets). Then run
   `npm run sync:heuristic-dictionaries`.
2. **Down-weight capability verbs in the Jaccard metric.** Many skills legitimately
   share verbs (*review, validate, lint*); what distinguishes scope is what they
   operate **on**. Exclude tokens whose base form is in `dictionaries.actionVerbs`
   from the Jaccard token sets (keep them in the TF-IDF cosine, where corpus-wide
   frequency already tempers them, and in `sharedTerms` reporting). Guard the
   degenerate case where a description consists only of verbs (Jaccard sets empty →
   metric 0), and cover it with a test.

Do **not** simply stuff capability verbs into `collisionStopwords` — that would erase
them from cosine and boundary analysis too.

## Part C — Morphology

Add to `irregularSingularForms` in `defaultHeuristicDictionaries.json` (then sync):

```json
"api": ["apis"],
"axis": ["axes"],
"vertex": ["vertices"]
```

Audit the rest of the guard's blast radius with a quick test enumeration (e.g.
`status`, `corpus`, `basis`, `iris` must stay unchanged; `indexes` already folds to
`index`). Add assertions for the three new mappings **and** the protected words.

## Part D — Documentation

- `similarity.ts` (`tfidfVectors` JSDoc) and the collision section of the README: one
  short note that pair similarities are computed against the whole scanned corpus, so
  adding/removing unrelated skills can shift a pair's score by a few hundredths.
- Note in `detectSkillCollisions.ts` docs which metrics see verbs and which do not
  (result of Part B), so the next maintainer doesn't "fix" the asymmetry.

## Acceptance criteria

With default weights, threshold 0.4, default dictionaries:

1. **Template pair** (fixture 1): composite **< 0.40** — no longer reported.
2. **True near-duplicate pair** (fixture 2): still reported, composite **≥ 0.60**
   (risk at least Medium), and strictly greater than fixture 1's composite.
3. The genuinely-separated pair used in existing tests (skills with mutual "do not use
   for" boundaries covering each other's domain) keeps its current behavior:
   boundary separation still damps it below threshold.
4. `normalizeContentToken('apis') === 'api'`; `'axes'` → `'axis'`; `'vertices'` →
   `'vertex'`; `'analysis'`, `'status'`, `'iris'` unchanged.
5. `npm run check:heuristic-dictionaries` passes (package.json regenerated, not
   hand-edited).
6. `similarity.property.test.ts` invariants still hold (symmetry, identity → 1,
   bounds) — if a property fails, the implementation is wrong, not the property.
7. Full verification checklist passes.

## Non-goals

- No change to `detectNameConflicts` / `detectSimilarNames` / `nameSimilarity`.
- No change to the composite formula shape, the weights schema
  (`skillMdInspector.collision.weights`), thresholds, or risk bands — existing user
  configuration must keep its meaning.
- No per-pair IDF rework (the corpus dependence is documented, not eliminated).
- No embedding/semantic similarity.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run check:heuristic-dictionaries
```
