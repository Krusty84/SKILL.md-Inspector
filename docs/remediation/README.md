# Remediation plans — algorithm evaluation follow-up

These plans package the findings of an empirical evaluation of the extension's core
algorithms (description quality scoring, collision detection, language detection,
morphology, glob matching). Each plan is written to be **fully self-contained**: an
isolated Claude (or human) session with no prior context can pick up one plan file and
implement it end to end, including reproducing the problem before fixing it.

## Plans and recommended order

| # | Plan | Primary files | Depends on |
|---|------|---------------|------------|
| 1 | [Test suite green + glob braces + doc caveats](plan-1-housekeeping.md) | `test/*.test.ts` (manifest tests), `src/parser/globMatch.ts`, `README.md` | — |
| 2 | [Description evidence extraction overhaul](plan-2-description-evidence.md) | `src/quality/descriptionHeuristics.ts`, `src/validation/validateDescription.ts`, `benchmarks/` | 1 |
| 3 | [Language detection for Latin-script languages](plan-3-language-detection.md) | `src/quality/language.ts`, `package.json` (setting text), `benchmarks/` | 1 (2 recommended) |
| 4 | [Collision boilerplate damping + morphology fixes](plan-4-collision-and-morphology.md) | `src/workspace/*`, `src/quality/wordForms.ts`, `src/quality/defaultHeuristicDictionaries.json` | 1 |

**Why this order.** Plan 1 makes the test suite green; every later plan uses "full suite
passes" as an acceptance gate, which is meaningless while pre-existing failures remain.
Plans 2, 3, and 4 are independent in *code*, but 2 and 3 both append cases to
`benchmarks/static-description-quality/cases.json`, and 2 and 4 both edit
`src/quality/defaultHeuristicDictionaries.json` — run them **sequentially** (each new
session starts from the merged result of the previous one) to avoid pointless merge
conflicts. If you must parallelize, pair 3 with 4, never 2 with 3.

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
