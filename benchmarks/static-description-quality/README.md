# Static Description Quality benchmark

This version-controlled corpus checks curated qualitative expectations for the deterministic, offline description heuristic. It is **not** a runtime skill-selection benchmark.

Each case records:

- `description` and `language` (`en`, `ru`, `ja`, ...) — non-English cases must be reported as language-limited, never silently scored with the English dictionaries;
- `expected.minScore` / `expected.maxScore` — a narrow band (25 points at most, enforced by the test) so weighting tweaks are tolerated but real scoring regressions fail;
- `expected.trigger` / `expected.boundary` — `full` (marker with meaningful scope), `partial` (marker with a vague tail), or `none`;
- `expected.frontLoaded` — whether the capability is stated up front;
- `notes` — why the case is in the corpus (several are regression cases for previously shipped bugs).

Review additions with a human author: include difficult phrasing, near-misses, negation interplay, and language limitations rather than formulaic variants of one template. Run `npm run benchmark:static`; update an expectation only when the intended heuristic policy changes, and say so in the commit message.
