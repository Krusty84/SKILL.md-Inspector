# Plan 8 — Corpora that can fail (implements P5)

Source: [round-3 evaluation](../algorithm-quality-evaluation-round3.md) §1.1, §2.1, §7-P5.

**Run this before Plans 9 and 10.** The report lists this work last (as P5), but it is
renumbered ahead of P3/P4 deliberately: the two corpora built here **are the acceptance
gates** for those plans. Building them afterwards would mean tuning the scorers against
targets that do not exist yet.

## Context

`benchmarks/static-description-quality/cases.json` (66 cases) is a genuine asset — it
catches regressions and it enforces narrow bands. But it asserts *the behavior the
implementation already has*. Every finding in the round-3 evaluation passes it:

- 9 of 14 production skill descriptions scoring *weak*/*poor* — passes.
- `Extract` → `Pull` costing 41 points — passes.
- Semantically empty word-salad scoring 100 — passes.
- Collision detection catching 0 of 6 real collisions — not covered at all.

A benchmark that cannot fail when the metric measures the wrong thing is a regression
guard, not a quality gate. This plan adds the two corpora that can fail, and wires them
to the metrics module that already exists.

`src/evaluation/metrics.ts` already computes precision, recall, specificity, F1 and
stability correctly (reviewed; no defects found). It is currently reachable only from
runtime trigger decisions. Reuse it rather than writing new statistics.

## Part A — Production-corpus calibration test

### What to build

`benchmarks/description-calibration/production-skills.json` — verbatim `description`
frontmatter values from **real, shipped** skills, each with a provenance field.

Schema:

```json
{
  "notes": "Verbatim descriptions from shipped skills. These are the reference implementations of the format: a metric that grades them poorly is miscalibrated, not strict.",
  "skills": [
    { "id": "docx", "source": "Anthropic Agent Skills (public)", "description": "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files) or Word templates (.dotx files). Do NOT use for PDFs, spreadsheets, Google Docs, or general coding tasks unrelated to document generation." }
  ]
}
```

**Corpus requirements:**

- **≥ 30 entries.** Seed with the 14 measured in the round-3 report §1.1 (`docx`,
  `session-start-hook`, `pdf`, `xlsx`, `review`, `dataviz`, `loop`, `pptx`, `simplify`,
  `keybindings-help`, `security-review`, `init`, `artifact-design`, `statusline-setup`)
  — those exact strings are quoted in the report and in this repo's git history, so they
  are recoverable. Reach 30 by collecting more from public skill repositories.
- **Verbatim only.** Never edit a description to make it score better. If you cannot
  copy it exactly, leave it out. The corpus's entire value is that it was not written
  for this scorer.
- **Record provenance** for each entry so a future maintainer can re-verify.
- **No expected score per entry.** Individual real descriptions vary in quality; the
  claim is only about the *distribution*.

### The test

`test/benchmarks/descriptionCalibration.test.ts`:

```
median(score) >= 60        <- gate for this plan (documents today's reality)
```

Then in Plan 9 the same test's threshold is raised to `>= 75`. Write the threshold as a
single exported constant with a comment saying which plan owns its current value, so the
ratchet is obvious.

Also assert, and report on failure with the offending ids:

- No entry is `not-scored` (every real description must at least be scoreable).
- Print a full `id → score → gradeLimitations` table on failure. The table is the
  diagnostic; a bare "expected 59 to be ≥ 75" is useless to whoever picks this up.

**Expect this test to FAIL at the ≥ 60 gate on the current tree** (measured median is
59). That is correct and intended: land the corpus and the test together with the
threshold set to the *measured* value (59) plus a `TODO(plan-9)` comment, so the suite
stays green and the ratchet is explicit. Do not lower the eventual target.

## Part B — Labeled collision-pair corpus

### What to build

`benchmarks/collision-pairs/pairs.json`:

```json
{
  "labelingRule": "COLLIDE = an agent choosing between these two from descriptions alone would be genuinely unsure (same job, different words). DISTINCT = the choice is obvious, INCLUDING when the two are lexically similar but explicitly disjoint in scope.",
  "pairs": [
    {
      "id": "pdf-extract-vs-pdf-reader",
      "label": "COLLIDE",
      "a": { "name": "pdf-extract", "description": "Extract text and tables from PDF documents. Use when the user needs data out of a PDF." },
      "b": { "name": "pdf-reader", "description": "Read PDF files and pull out their text content. Use when the user needs PDF text." },
      "notes": "same job, different words"
    }
  ]
}
```

Seed with the 13 pairs from the round-3 report §2.1 (6 `COLLIDE`, 7 `DISTINCT`), then
grow to **≥ 24 pairs, ≥ 10 of each label**. The labeling rule is stated in the file
itself so it can be argued with; if a reviewer disagrees with a label, they change the
label deliberately and the metrics move — that is the corpus working as intended.

Coverage the corpus must include (these are the discriminations that matter):

- `COLLIDE`: paraphrase pairs that share **little** surface text (this is the class the
  current detector misses entirely).
- `DISTINCT`: pairs that share **a lot** of surface text but are explicitly disjoint
  (mutual `do not use`), and pairs sharing an artifact with different capabilities
  (read-PDF vs write-PDF).
- `DISTINCT`: unrelated skills written from the **same house template** (the boilerplate
  trap).
- At least one non-Latin pair, expected to be flagged low text coverage rather than
  scored (depends on Plan 6 Part C; if Plan 6 has not landed, assert only that
  `confidence === 'low'`).

### The test

`test/benchmarks/collisionPairs.test.ts` — feed each pair to `detectCollisions` with
`{ threshold: 0 }`, build `TriggerDecision`-shaped records (`triggered = sim >= 0.4`),
and reuse `calculateTriggerMetrics` from `src/evaluation/metrics.ts` so there is one
implementation of the statistics.

Mapping to the existing model: `TriggerQuery.id` ← pair id,
`expected: 'should-trigger'` ← `COLLIDE`, `runsPerQuery: 1` (detection is
deterministic, so `stability` is trivially 1 and can be ignored). If the shapes chafe,
extract the confusion-matrix core from `calculateTriggerMetrics` into a shared helper
rather than duplicating the arithmetic.

Assert, at the **default** threshold 0.4:

```
recall    >= 0.0    <- gate for this plan (documents today's 0%)
precision >= 0.0
AUC       >= 0.60
```

Plus a standalone AUC computation (`P[COLLIDE ranked above DISTINCT]`, ties at 0.5)
because it is threshold-independent and therefore the honest measure of whether the
metric discriminates at all.

Print the full sorted table (label, sim, risk, per-metric breakdown) on failure — same
reasoning as Part A.

**Same ratchet discipline:** land with thresholds at the measured values (recall 0.0,
AUC 0.60) and `TODO(plan-10)` comments. Plan 10 raises them to `recall >= 0.70`,
`precision >= 0.60`, `AUC >= 0.85`.

## Part C — Wire both into the scripts

`package.json`:

```json
"benchmark:calibration": "vitest run test/benchmarks/descriptionCalibration.test.ts",
"benchmark:collisions": "vitest run test/benchmarks/collisionPairs.test.ts",
"benchmark": "vitest run test/benchmarks"
```

Keep the existing `benchmark:static` script working unchanged. Both new tests live under
`test/benchmarks/` so `npm test` runs them too (the vitest `include` is
`test/**/*.test.ts`) — that is wanted: the ratchets must be part of the normal gate, not
an opt-in.

## Part D — Document the corpus contract

Add `benchmarks/README.md` (or extend
`benchmarks/static-description-quality/README.md`) explaining the three corpora and,
critically, **what each one is allowed to prove**:

| Corpus | Question | Allowed to change when |
|---|---|---|
| `static-description-quality` | did scoring behavior regress? | heuristic policy changes deliberately |
| `description-calibration` | does the metric agree with reality? | never edit descriptions; only add entries |
| `collision-pairs` | does the metric discriminate? | a label is deliberately re-argued |

State the rule that matters: **a failing calibration or collision-pair test means the
metric is wrong, not that the corpus needs adjusting.** The static corpus is the only one
whose expectations may be re-recorded, and only with a stated policy reason.

## Acceptance criteria

1. `benchmarks/description-calibration/production-skills.json` exists, ≥ 30 verbatim
   entries, each with provenance.
2. `benchmarks/collision-pairs/pairs.json` exists, ≥ 24 pairs, ≥ 10 per label, with the
   labeling rule stated in-file.
3. Both tests run under `npm test` and pass on the current tree with thresholds set to
   **measured** values plus `TODO(plan-9)` / `TODO(plan-10)` markers.
4. Both tests print a diagnostic table on failure — verify by temporarily raising a
   threshold and reading the output.
5. Confusion-matrix arithmetic is **not** duplicated; `src/evaluation/metrics.ts` is
   reused or its core extracted.
6. `npm run benchmark` runs all three corpora.
7. `benchmarks/README.md` documents the contract table above.
8. Full verification checklist passes.

## Non-goals

- **No production-code changes.** This plan adds corpora, tests, docs, and npm scripts
  only. If a test needs a source change to run, that change belongs to Plan 9 or 10.
- Do not modify `benchmarks/static-description-quality/cases.json` here.
- No new statistics library; the arithmetic needed is ~20 lines and already exists.
- Do not invent plausible-looking "real" skill descriptions. A fabricated corpus is worse
  than a small one, because it silently re-encodes this scorer's assumptions — the exact
  failure this plan exists to prevent.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run benchmark
npm run check:heuristic-dictionaries
```
