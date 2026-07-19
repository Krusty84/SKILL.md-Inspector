# Static Description Quality benchmark

This version-controlled corpus checks curated qualitative expectations for the deterministic, offline description heuristic. It is **not** a runtime skill-selection benchmark.

Each case records:

- `profile` — the scorer profile (`generic` when omitted for legacy corpus cases); the benchmark resolves that profile's length limits, language mode, and criterion weights rather than using the default scorer weights;
- `description` and `language` (`en`, `ru`, `ja`, ...) — non-English cases must be reported as language-limited, never silently scored with the English dictionaries;
- `expected.minScore` / `expected.maxScore` — a narrow band for the public adjusted score (25 points at most, enforced by the test) so weighting tweaks are tolerated but real scoring regressions fail;
- optional `expected.minRawScore` / `expected.maxRawScore` and `expected.gradeLimitations` — checks for the additive criterion total and every explicit essential-completeness ceiling;
- `expected.trigger` / `expected.boundary` — `full` (marker with meaningful scope), `partial` (marker with a vague tail), or `none`;
- `expected.frontLoaded` — whether the capability is stated up front;
- `notes` — why the case is in the corpus (several are regression cases for previously shipped bugs).

Review additions with a human author: include difficult phrasing, near-misses, negation interplay, and language limitations rather than formulaic variants of one template. Run `npm run benchmark:static`; update an expectation only when the intended heuristic policy changes, and say so in the commit message.

The additive `rawScore` is always the sum of the per-criterion findings. The public `score` and label use `adjustedScore`, which may be capped when an essential signal is absent: missing concrete usage-trigger content (69), a vague trigger tail (74), or missing capability/artifact evidence (59). Each cap appears in `gradeLimitations`; there are no hidden deductions. A missing boundary does not create an essential ceiling for the Generic profile, and body quality is outside this benchmark.
