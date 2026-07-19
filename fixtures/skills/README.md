# SKILL.md quality fixtures

Hand-written SKILL.md files spanning the quality spectrum, from unusable to
excellent. Ordered worst → best. The table covers only the ten fixtures listed
below; other skill directories alongside them are separate fixtures not part
of this ladder.

| # | Fixture | Tier | Intended defects / strengths |
|---|---------|------|------------------------------|
| 1 | `stuff/` | Broken | No YAML frontmatter at all; no name or description; vague three-line body with a TODO. |
| 2 | `helper/` | Broken | Frontmatter present but the YAML is invalid (missing colon, unclosed bracket); name has spaces, uppercase, punctuation; one-word description. |
| 3 | `data-thing/` | Poor | Valid YAML but useless three-word description with no triggers; body is a single unstructured run-on wall of text with contradictory step ordering. |
| 4 | `email-drafter/` | Mediocre | First-person description with no "when to use"; sections exist but are empty or `TODO`; instructions contradict each other (never ask vs. ask first; short vs. detailed). |
| 5 | `report-generator/` | Mediocre | Description is keyword-stuffed, overclaiming ("always use this"), and exceeds the 1024-character limit; body is padded and circular, restating itself instead of instructing. |
| 6 | `git-commit-helper/` | Decent | Correct frontmatter, clear trigger phrases, concrete ordered workflow and guardrails — but no examples and thin edge-case coverage. |
| 7 | `changelog-writer/` | Good | Specific description with triggers *and* an anti-trigger; step-by-step workflow; a worked input→output example; explicit rules. |
| 8 | `csv-cleaner/` | Very good | Everything in "Good" plus a stated core principle, diagnosis table, mandatory verification checklist with pass criteria, and edge cases. |
| 9 | `api-error-triage/` | Excellent | Layered decision procedure, honest failure-mode table, minimal-reproduction methodology with a paired failing/passing example, safety rules. Fully self-contained. |
| 10 | `pdf-form-filler/` | Excellent | Excellent SKILL.md plus progressive disclosure: bundled `references/field-types.md` and a runnable `scripts/fill_form.py`, with a table saying when to read each. Mandatory verification step and unsupported-case handling (XFA, signatures). |

Notes:

- Of the ten, only `pdf-form-filler/` has files beyond SKILL.md; the other
  nine are a single `SKILL.md` in their directory.
- The defects in tiers 1–5 are deliberate. Do not "fix" them — they are the
  test data.
