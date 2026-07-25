# Static Description Quality benchmark

This version-controlled corpus checks curated qualitative expectations for the deterministic, offline description heuristic. It is **not** a runtime skill-selection benchmark.

## How this benchmark differs from the other corpora

See [../README.md](../README.md) for the contract table covering all three
benchmark corpora and what each one is allowed to prove.

- **Synthetic description benchmark (this directory):** isolates description
  wording and scorer weights in `cases.json`. It does not parse a whole
  `SKILL.md`, discover resources, or inspect instruction structure. It asserts the
  behavior the implementation already has, so it catches regressions but cannot
  tell you the metric measures the wrong thing.
- **Production calibration corpus:** `benchmarks/description-calibration/`
  holds verbatim descriptions from shipped skills and gates the median score, which
  is the check this corpus cannot perform. Run it with
  `npm run benchmark:calibration`.
- **Labeled collision pairs:** `benchmarks/collision-pairs/` gates whether
  collision similarity separates genuine overlaps from lookalikes. Run it with
  `npm run benchmark:collisions`.
- **Whole-file fixture regression corpus:**
  `fixtures/skills/expectations.json` analyzes every fixture with the generic
  profile and local filesystem access. It protects parsing, diagnostics,
  separate description and instruction quality dimensions, resources, name
  conflicts, and workspace collisions. Run it as part of `npm test`.
- **Behavioral trigger evaluation:** `evaluation/` records provider selection
  decisions and calculates runtime precision, recall, specificity, F1, and
  stability. It is intentionally separate from deterministic static quality;
  `npm run test:eval` tests the evaluation model and metrics.

Each case records:

- `description` and `language` (`en`, `ru`, `ja`, ...) — non-English cases must be reported as language-limited, never silently scored with the English dictionaries;
- `expected.minScore` / `expected.maxScore` — a narrow band for the public adjusted score (25 points at most, enforced by the test) so weighting tweaks are tolerated but real scoring regressions fail;
- optional `expected.minRawScore` / `expected.maxRawScore` and `expected.gradeLimitations` — checks for the additive criterion total and every explicit essential-completeness ceiling;
- `expected.trigger` / `expected.boundary` — `full` (marker with meaningful scope), `partial` (marker with a vague tail), or `none`;
- `expected.frontLoaded` — whether the capability is stated up front;
- `notes` — why the case is in the corpus (several are regression cases for previously shipped bugs).

Review additions with a human author: include difficult phrasing, near-misses, negation interplay, and language limitations rather than formulaic variants of one template. Run `npm run benchmark:static`; update an expectation only when the intended heuristic policy changes, and say so in the commit message.

The additive `rawScore` is always the sum of the per-criterion findings. The public `score` and label use `adjustedScore`, which may be capped when an essential signal is absent: missing concrete usage-trigger content (69), a vague trigger tail (74), or missing capability/artifact evidence (59). Each cap appears in `gradeLimitations`; there are no hidden deductions. A missing boundary does not create an essential ceiling for the Generic profile, and body quality is outside this benchmark.

The two 59-point ceilings need both kinds of evidence to be absent. Since plan 9, a word
outside the configured dictionaries no longer proves the thing is missing: an opening
shaped like a capability statement, or a token shaped like a domain term, keeps the ceiling
off and earns half the criterion. `case-78` through `case-83` cover that boundary from both
sides — the synonym that used to cost two label bands, structural capability and artifact
evidence in isolation, and the gaming cases that must not benefit. `case-81` is pinned at
100 on purpose: verb stuffing is a **known limitation**, documented in
[../../docs/rules.md](../../docs/rules.md), not something the corpus claims is solved.
