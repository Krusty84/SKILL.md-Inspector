# Remediation plans — algorithm evaluation follow-up

These plans package the findings of an empirical evaluation of the extension's core
algorithms (description quality scoring, collision detection, language detection,
morphology, glob matching). Each plan is written to be **fully self-contained**: an
isolated Claude (or human) session with no prior context can pick up one plan file and
implement it end to end, including reproducing the problem before fixing it.

There are two waves. **Plans 1–5 are complete and merged** — they fixed defects found in
the first two evaluation rounds. **Plans 6–10 are open** and come from the
[round-3 evaluation](../algorithm-quality-evaluation-round3.md), which asked a different
question: assuming the code is correct, do the reported numbers mean what their labels
claim? See [Wave 2](#wave-2--measurement-validity-plans-610-open) below.

## Wave 1 — defect remediation (plans 1–5, merged)

| # | Plan | Primary files | Depends on |
|---|------|---------------|------------|
| 1 | [Test suite green + glob braces + doc caveats](plan-1-housekeeping.md) | `test/*.test.ts` (manifest tests), `src/parser/globMatch.ts`, `README.md` | — |
| 2 | [Description evidence extraction overhaul](plan-2-description-evidence.md) | `src/quality/descriptionHeuristics.ts`, `src/validation/validateDescription.ts`, `benchmarks/` | 1 |
| 3 | [Language detection for Latin-script languages](plan-3-language-detection.md) | `src/quality/language.ts`, `package.json` (setting text), `benchmarks/` | 1 (2 recommended) |
| 4 | [Collision boilerplate damping + morphology fixes](plan-4-collision-and-morphology.md) | `src/workspace/*`, `src/quality/wordForms.ts`, `src/quality/defaultHeuristicDictionaries.json` | 1 |
| 5 | [Scope-grammar negation symmetry + trigger/language precision](plan-5-grammar-negation-and-language-precision.md) | `src/quality/descriptionHeuristics.ts`, `src/quality/language.ts`, `benchmarks/` | 1–4 merged |

**Why this order.** Plan 1 makes the test suite green; every later plan uses "full suite
passes" as an acceptance gate, which is meaningless while pre-existing failures remain.
Plans 2, 3, and 4 are independent in *code*, but 2 and 3 both append cases to
`benchmarks/static-description-quality/cases.json`, and 2 and 4 both edit
`src/quality/defaultHeuristicDictionaries.json` — run them **sequentially** (each new
session starts from the merged result of the previous one) to avoid pointless merge
conflicts. If you must parallelize, pair 3 with 4, never 2 with 3.

Plan 5 was added after an adversarial re-evaluation of the merged Plans 1–4: the new
trigger grammar and language profiles fixed all the original false negatives but
introduced three precision holes (negated usage verbs read as positive triggers,
duration/conditional statements read as triggers, and English text flagged non-English
via cross-language homographs). It touches the same files as Plans 2–3, so it must run
alone, on top of their merged result.

## Wave 2 — measurement validity (plans 6–10, open)

Wave 1 asked "is the code defective?". Wave 2 assumes it is not, and asks whether the
three headline numbers the UI shows — Static Description Quality, collision similarity,
Instruction Quality — measure what their labels claim. Measured answers: 9 of 14 shipped
production skill descriptions score *weak* or *poor*; collision detection catches 0 of 6
genuine collisions at the default threshold; lorem ipsum scores 90/"excellent" for
instruction quality.

| # | Plan | Implements | Primary files | Depends on |
|---|------|-----------|---------------|------------|
| 6 | [Honest labels](plan-6-honest-labels.md) | P1 | `src/authoring/authoringQuality.ts`, `src/ui/render*.ts` | — |
| 7 | [Four concrete defects](plan-7-concrete-defects.md) | P2 | `src/workspace/collisionFeatures.ts`, `src/quality/staticDescriptionQuality.ts`, `src/quality/descriptionHeuristics.ts`, `src/workspace/detectNameConflicts.ts` | — |
| 8 | [Falsifiable corpora](plan-8-falsifiable-corpora.md) | P5 | `benchmarks/`, `test/benchmarks/`, `package.json` | — |
| 9 | [Vocabulary + ceilings](plan-9-vocabulary-and-ceilings.md) | P3 | `src/quality/defaultHeuristicDictionaries.json`, `src/quality/descriptionHeuristics.ts`, `src/codeActions/skillCodeActions.ts` | 8, 7-D |
| 10 | [Collision discrimination](plan-10-collision-discrimination.md) | P4 | `src/workspace/collisionFeatures.ts`, `src/workspace/detectSkillCollisions.ts`, `src/workspace/similarity.ts` | 8, 7-A |

**Why this order.** Plans 6, 7 and 8 are mutually independent and each ships on its own —
start with 6 (cheapest, largest trust gain, zero scoring change), then 7 (four unrelated
small defects), then 8.

**Plan 8 is deliberately renumbered ahead of the work it supports.** The round-3 report
lists it last as P5, but the two corpora it builds are the *acceptance gates* for Plans 9
and 10. Building them afterwards would mean tuning the scorers against targets that do
not exist yet, which is how the current benchmark ended up asserting the behavior the
implementation already had. Plan 8 lands the corpora with thresholds set to today's
**measured** values plus `TODO(plan-9)` / `TODO(plan-10)` markers; Plans 9 and 10 each
ratchet their own threshold up as their acceptance criterion.

Plans 9 and 10 are independent of each other in code and may run in parallel, with one
caveat: Plan 9 expands `actionVerbs`, which feeds the Jaccard exclusion set in
`detectSkillCollisions.ts`, so whichever lands second should re-run
`npm run benchmark:collisions` and record the shift.

**Shared-file conflicts within wave 2:** Plans 7 and 9 both edit
`defaultHeuristicDictionaries.json` and `descriptionHeuristics.ts`; Plans 7 and 10 both
edit `collisionFeatures.ts`. Run 7 to completion first — both later plans list it as a
dependency for exactly this reason.

## How to run a plan in an isolated session

Suggested kickoff prompt for each session:

> Read `docs/remediation/plan-N-<name>.md` in this repository and implement it
> completely. Follow its "Reproduce first" section before changing code, satisfy every
> acceptance criterion, and run the full verification checklist before committing.

Each plan contains:

- **Context** — what is wrong, with concrete reproduction inputs and the currently
  observed (verified) outputs.
- **Reproduce first** — write failing tests before touching implementation code.
- **Scope / non-goals** — exact files and functions; what must not change.
- **Acceptance criteria** — concrete input → required output.
- **Verification checklist** — the commands that must pass.

## Repo mechanics every session must know

- **Dictionary defaults are generated.** `src/quality/defaultHeuristicDictionaries.json`
  is the source of truth. After editing it, run
  `npm run sync:heuristic-dictionaries` to regenerate the `package.json` configuration
  defaults, and `npm run check:heuristic-dictionaries` must pass. Never hand-edit the
  dictionary defaults inside `package.json`.
- **Benchmark corpus rules.** `benchmarks/static-description-quality/cases.json` is
  executed by `npm run benchmark:static`
  (`test/benchmarks/staticDescriptionQuality.test.ts`). The harness enforces: corpus
  size ≥ 45, and every case's `maxScore - minScore ≤ 25`. Cases assert score band,
  clause states (`trigger`/`boundary`: `full|partial|none`), and `frontLoaded`.
  Plan 8 adds two further corpora with a different contract — `description-calibration`
  (verbatim real descriptions; never edited to score better) and `collision-pairs`
  (labeled pairs scored by recall/precision/AUC). A failure in either means the *metric*
  is wrong; only the static corpus's expectations may be re-recorded, and only with a
  stated policy reason. See `benchmarks/README.md` once Plan 8 has landed.
- **Purity constraints.** Everything under `src/quality/`, `src/workspace/`,
  `src/analysis/`, `src/validation/` is deliberately `vscode`-free and deterministic
  (no LLM calls, no network, no randomness). Keep it that way.
- **Verification loop** (run before every commit):
  `npm run check-types && npm run lint && npm test && npm run check:heuristic-dictionaries`.

## Evidence source

The reproduction numbers quoted in the plans come from directly executing the shipped
modules (bundled with esbuild, run under node) against realistic and adversarial
inputs — not from the existing unit tests. Where a plan says "currently scores 59",
that was measured, not estimated.

For wave 2 this is not incidental. The round-3 evaluation deliberately **ignored the test
suite and the benchmark corpus** while forming findings, because both encode the same
assumptions as the implementation — agreement with them proves nothing about whether the
metric is right. Every wave-2 plan follows the same discipline: reproduce by execution
first, and treat a passing test as evidence of stability, not of correctness.
