# Remediation plans — evaluation follow-up

These plans package the findings of empirical evaluations of the extension's core
algorithms (description quality scoring, collision detection, language detection,
morphology, glob matching) and of the static security scanner. Each plan is written to be
**fully self-contained**: an isolated Claude (or human) session with no prior context can
pick up one plan file and implement it end to end, including reproducing the problem
before fixing it.

There are four waves. **Plans 1–5 are complete and merged** — they fixed defects found
in the first two evaluation rounds. **Plans 6–10 are open** and come from the
[round-3 evaluation](../algorithm-quality-evaluation-round3.md), which asked a different
question: assuming the code is correct, do the reported numbers mean what their labels
claim? See [Wave 2](#wave-2--measurement-validity-plans-610-open) below. **Plan 11 is
open** and comes from a separate evaluation of the security scanner — see
[Wave 3](#wave-3--security-scanner-plan-11-open). **Plans 12–17 are complete** —
see [Wave 4](#wave-4--round-4-follow-up-plans-1217-complete).

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

## Wave 3 — security scanner (plan 11, open)

Waves 1 and 2 cover the quality and collision algorithms. Wave 3 covers
`src/validation/security/` and the two adjacent surfaces that share the `security`
diagnostic kind. Measured answers: the sentence "Reboot the machine to finish the
installation." is reported as an **error** and fails the skill;
`api_key: os.environ["API_KEY"]` is reported as a hardcoded credential — the
remediation the diagnostic itself recommends; one catalog pattern takes 11.7 s on a
100 KB line; and a payload moved from `scripts/` to `bin/` produces zero findings.

| # | Plan | Primary files | Depends on |
|---|------|---------------|------------|
| 11 | [Security scanner hardening](plan-11-security-hardening.md) | `src/validation/security/**`, `src/validation/validateLinks.ts`, `src/ui/render*.ts`, `src/config.ts`, `test/security/**` | — |

**Independent of Plans 1–10** — no shared files, so it may run in parallel with any of
them. Plan 11 is large and explicitly partitioned: Parts A–E are the first tranche and
carry most of the value; Parts F–J are follow-ups. Part D1 (per-rule severity keys)
should land before the Part C de-noising, because it is what lets an author keep a rule
class enabled while silencing one pattern.

## Wave 4 — round-4 follow-up (plans 12–17, complete)

Wave 4 comes from a fourth evaluation that re-measured wave 2's and wave 3's claims on the
post-remediation tree and then looked for what the remediation itself left behind. The
headline numbers moved a long way: the 16 real shipped skill descriptions now score a
**median of 80** (was 59), and collision detection reaches **AUC 0.929, precision 1.00,
recall 0.71** at the default threshold (was AUC 0.64, precision 0, recall 0). Six of the
eight substantive round-3 findings are closed, verified by execution.

What is left is a different shape of problem: things the scanner **misses**, paths with no
size bound, and a quick fix that corrupts the file it is editing.

| # | Plan | Primary files | Depends on |
|---|------|---------------|------------|
| 12 | [Security scanner coverage](plan-12-security-scanner-coverage.md) | `src/validation/security/**` | 11 |
| 13 | [Input-size guards](plan-13-input-size-guards.md) | `src/analysis/`, `src/parser/globMatch.ts`, `src/parser/valueRanges.ts`, `src/opencode/` | — |
| 14 | [File integrity + config validation](plan-14-file-integrity-and-config-validation.md) | `src/parser/parseFrontmatter.ts`, `src/validation/`, `src/config.ts` | — |
| 15 | [Description evidence scope](plan-15-description-evidence-scope.md) | `src/quality/descriptionHeuristics.ts`, `src/quality/staticDescriptionQuality.ts` | 8, 9, 14 |
| 16 | [Vocabulary coherence](plan-16-vocabulary-coherence.md) | `src/quality/defaultHeuristicDictionaries.json`, `src/quality/wordForms.ts`, `src/workspace/collisionFeatures.ts` | 10 |
| 17 | [Workspace pipeline + async](plan-17-workspace-pipeline-and-async.md) | `src/workspace/`, `src/parser/resourceCache.ts`, `src/online/`, `src/extension.ts` | — |

**Why this order.** Plans 14 (Part A) and 12 are the two that matter most and are cheapest
relative to their value: Part A of 14 is a **data-loss bug** — the `InsertUseWhenClause`
quick fix makes the frontmatter unparseable whenever the `description` is a block scalar
with another key after it, losing every key — and Plan 12 closes two gaps that make the
security scanner decorative (the frontmatter `description`, the field an agent loads at
discovery time for every session, is never scanned for injection; and one pair of
asterisks defeats all 14 injection rules). Ship 14-A first, then 12.

Plan 13 is next: the measured worst case is **48.7 minutes** of frozen extension host for a
200,000-character single-line body, on the debounced while-typing path, and the trigger —
any long unbroken run of letters, ideographs or punctuation — includes the zero-width and
NBSP padding the scanner itself hunts for.

Plans 15, 16 and 17 are improvement rather than damage control and can follow in any order.

**Shared-file conflicts within wave 4:** 12 and 11 both edit
`src/validation/security/**` (run 11 first); 14 and 15 both edit
`staticDescriptionQuality.ts`; 15 and 16 both edit
`defaultHeuristicDictionaries.json` and `descriptionHeuristics.ts`; 13 and 17 both edit
`src/opencode/` and `src/online/`. Run each of those pairs sequentially.

**Part C of Plan 16 moves collision numbers.** Widening `contentWords` to Unicode changes
what the 0.70-weight scope metric sees, so `npm run benchmark:collisions` must be re-run
and the shift recorded in the commit message rather than tuned away.

### What shipped, and what did not

All six plans are implemented, each with its "Reproduce first" tests written and
observed failing before any implementation change. Four prescriptions were
deliberately not followed, and each commit says so in its own words:

- **Plan 15 Part B** — demoting the whole-description verb scan to structural
  half-credit was implemented, measured, and reverted: it cost 30 of the 37 real
  shipped descriptions ten points each and dropped the calibration median from 79
  to 69, because real skills state the capability across two sentences. Removing
  the *trigger clause* from the text the capability criterion reads is the
  precise fix and holds the corpus.
- **Plan 15 Part E** — the vagueness penalty was not made monotone past two
  terms. Every formula that keeps growing prevents a fully vague description
  from reaching 0, which an existing invariant pins. Span de-duplication is what
  the measured harm (`general` *and* `general-purpose` for one span) required.
- **Plan 15 criterion 1** — "adding a `Do not use for …` clause never increases
  the score" is not met and should not be: the boundary criterion is worth 15 and
  a boundary clause satisfies it. The +31 the round-4 evaluation measured was the
  16 points above that, and those are gone.
- **Plan 16 criterion 3** — a non-empty `capabilities` list for German, French,
  Spanish, Russian and Chinese is unreachable without non-English capability
  verbs, which the plan's own non-goals forbid. What Part C delivers is that the
  scope *token* sets see those languages at all, which is what the 0.70-weight
  metric compares.
- **Plan 17 Part C** — the watcher glob was not widened to `**/*`; that would
  refresh the Skills view on every file change anywhere in the workspace. The
  directory-signature validation added to `ResourceCache` closes the staleness
  gap on its own, which is the plan's own first option.
- **Plan 17 Part F** — the socket leak is fixed but verified by inspection, not
  by a test: reaching the success path from a test needs either a public IP or a
  weakening of the connected-peer revalidation.

Two measured shifts were recorded rather than tuned away:

- `benchmarks/collision-pairs` AUC rose 0.7381 → 0.8304 with recall (0.333) and
  precision (1.000) unchanged; the zero-scope COLLIDE set halved from four pairs
  to two, and `AUC_GATE` ratcheted 0.72 → 0.83.
- `benchmarks/static-description-quality` cases 41, 42 and 67 were re-recorded
  with the policy reason inline, as `benchmarks/README.md` requires. The
  calibration corpus was not touched; its median holds at 78 (gate 75).

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
- **Security-catalog messages need an l10n re-export.** The `message` strings in
  `src/validation/security/defaultSecurityCatalog.json` are JSON data passed through
  `l10n.t()` at runtime (`scanText.ts:111`), so the static extractor cannot see them —
  `scripts/merge-l10n-data.js` merges them in. After editing any catalog message, run
  `npm run l10n:export` and commit the regenerated `l10n/bundle.l10n.json`. Relevant to
  Plan 11 only.
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

Wave 3 follows it too, and the security evaluation makes the point concrete: changing
`sensitivePaths.keychain` from `Library/Keychains` to `Library/Keychain` leaves the entire
suite green, because 44 of the 106 catalog entries have no test that matches them. Plan 11
Part I closes that by making an untested pattern impossible to add.
