# Benchmark corpora

Three corpora live here, and they answer three different questions. Mixing them up is
how a benchmark stops being a quality gate and becomes a rubber stamp, so the contract
is written down.

| Corpus                                                      | Question it answers                 | Allowed to change when                                                                              |
| ----------------------------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------- |
| [`static-description-quality`](static-description-quality/) | did scoring behavior regress?       | heuristic policy changes deliberately — re-record the expectation and say why in the commit message |
| [`description-calibration`](description-calibration/)       | does the metric agree with reality? | never edit a description; only add verbatim entries                                                 |
| [`collision-pairs`](collision-pairs/)                       | does the metric discriminate?       | a label is deliberately re-argued, with the reasoning stated                                        |

**The rule that matters: a failing calibration or collision-pair test means the metric is
wrong, not that the corpus needs adjusting.** `static-description-quality` is the only
corpus whose expectations may be re-recorded, and only with a stated policy reason.

Run them with `npm run benchmark` (all three), or `npm run benchmark:static`,
`npm run benchmark:calibration`, `npm run benchmark:collisions` individually. All three
also run under `npm test`, deliberately: the ratchets are part of the normal gate, not an
opt-in.

## `static-description-quality` — regression guard

Curated synthetic descriptions with narrow expected score bands. It catches unintended
scoring drift, and it is honest about what it cannot do: every case asserts the behavior
the implementation already has, so it cannot tell you the metric is measuring the wrong
thing. See [its README](static-description-quality/README.md).

## `description-calibration` — calibration gate

Verbatim `description` frontmatter from real, shipped skills, each with provenance and a
re-verification path. The premise: these are the reference implementations of the format,
so a metric that grades them poorly is miscalibrated, not strict.

The test asserts a **median** score, not a per-entry expectation — individual real
descriptions vary in quality, and the claim is only about the distribution. The gate is a
single exported constant (`MEDIAN_SCORE_GATE`) carrying a comment that says which plan
owns its current value, so raising it is a deliberate, visible act.

It has been raised once. Plan 8 set it to the 60 it measured; plan 9 widened the
dictionaries and stopped a dictionary miss from capping the score, moving the median to 79
and the mean to 76.7, and the gate to **75** — the "good" label boundary, so the assertion
states something meaningful (half of these grade as good or better) instead of restating
one sample, and the corpus can keep growing without fighting its own gate.

Two rules for contributors:

- **Verbatim only.** If you cannot copy a description exactly, leave it out. The corpus's
  entire value is that it was not written for this scorer.
- **Never remove a low-scoring entry.** Dropping the entries a metric dislikes is the
  precise failure this corpus exists to prevent. Add, don't curate.

## `collision-pairs` — discrimination gate

Labeled skill pairs, `COLLIDE` or `DISTINCT`, with the labeling rule stated in the file so
it can be argued with. Half the pairs use verbatim shipped descriptions; the rest are
synthetic and each isolates one discrimination — paraphrases with little shared text,
mutually exclusive scopes with heavy shared text, same artifact with opposite capability,
unrelated skills sharing house boilerplate, and non-Latin text.

The test reports recall and precision at the default threshold plus a
threshold-independent AUC (`P[COLLIDE ranked above DISTINCT]`), and reuses
`calculateTriggerMetrics` from `src/evaluation/metrics.ts` so the confusion-matrix
arithmetic has one implementation.

### What this corpus has measured so far

| | plan 8 (baseline) | plan 10 |
| --- | --- | --- |
| recall | 0.00 | 0.33 |
| precision | 0.00 | 1.00 |
| specificity | 0.79 | 1.00 |
| AUC | 0.533 | 0.726 |
| top-ranked pairs | 3 DISTINCT | 4 COLLIDE |

Plan 10's targets were recall 0.70, precision 0.60, AUC 0.85. **Precision is met;
recall and AUC are not**, and the shortfall is asserted rather than described — see
`plan 10 targets not yet met` in the test. Four labeled collisions score exactly 0
on scope overlap because neither description names an artifact or capability the
dictionaries recognize as shared; they tie with the eleven DISTINCT pairs that also
score 0, which caps AUC at 0.798 no matter how the metrics are blended. Closing
that needs new evidence, not new weights, so the gates hold the measured values and
the targets stay recorded as unmet. That is the corpus doing its job: it is meant to
be able to fail.

If you disagree with a label, change it deliberately and let the metrics move — that is
the corpus working as intended. What you must not do is retune a label so a scorer passes.

## Both gates print a table on failure

A bare `expected 0.53 to be greater than or equal to 0.85` is useless to whoever picks the
work up. The calibration test prints every skill with its score and the ceilings that
applied; the collision test prints the full ranking with the per-metric breakdown and which
pairs crossed the threshold. Keep that property when editing either test.
