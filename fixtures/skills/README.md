# SKILL.md quality fixtures

Hand-written SKILL.md files for testing skill inspection. Two batches: a
**quality ladder** ranking whole skills from unusable to excellent, and a
**defect zoo** of mostly single-defect and edge-case fixtures so individual
checks have targeted test data. Other skill directories alongside these are
separate fixtures not part of either batch.

## Batch 1 — quality ladder (worst → best)

| # | Fixture | Tier | Intended defects / strengths |
|---|---------|------|------------------------------|
| 1 | `stuff/` | Broken | No YAML frontmatter at all; no name or description; vague three-line body with a TODO. |
| 2 | `helper/` | Broken | Frontmatter present but the YAML is invalid (missing colon, unclosed bracket); name has spaces, uppercase, punctuation; one-word description. |
| 3 | `data-thing/` | Poor | Valid YAML but useless three-word description with no triggers; body is a single unstructured run-on wall of text with contradictory step ordering. |
| 4 | `email-drafter/` | Mediocre | First-person description with no "when to use"; sections exist but are empty or `TODO`; instructions contradict each other (never ask vs. ask first; short vs. detailed). |
| 5 | `report-generator/` | Mediocre | Description is keyword-stuffed, overclaiming ("always use this"), and exceeds the 1024-character limit (1173 chars); body is padded and circular, restating itself instead of instructing. |
| 6 | `git-commit-helper/` | Decent | Correct frontmatter, clear trigger phrases, concrete ordered workflow and guardrails — but no examples and thin edge-case coverage. |
| 7 | `changelog-writer/` | Good | Specific description with triggers *and* an anti-trigger; step-by-step workflow; a worked input→output example; explicit rules. |
| 8 | `csv-cleaner/` | Very good | Everything in "Good" plus a stated core principle, diagnosis table, mandatory verification checklist with pass criteria, and edge cases. |
| 9 | `api-error-triage/` | Excellent | Layered decision procedure, honest failure-mode table, minimal-reproduction methodology with a paired failing/passing example, safety rules. Fully self-contained. |
| 10 | `pdf-form-filler/` | Excellent | Excellent SKILL.md plus progressive disclosure: bundled `references/field-types.md` and a runnable `scripts/fill_form.py`, with a table saying when to read each. Mandatory verification step and unsupported-case handling (XFA, signatures). |

## Batch 2 — defect zoo (edge cases and single defects)

| Fixture | Tier | Focus |
|---------|------|-------|
| `json-formatter/` | Broken | Frontmatter has `name` but no `description`. |
| `sql-optimizer/` | Broken frontmatter, decent body | Frontmatter has `description` but no `name`. |
| `Docker-Deploy-Helper/` | Poor | Uppercase directory; `name` with underscores and capitals; circular description ("deploy... when they want to deploy"); "retry with sudo" advice. |
| `legacy-migration/` | Poor | UTF-8 BOM before the `---`, CRLF line endings throughout, unclosed ```` ```sql ```` fence that swallows later steps, circular description. Byte-level parser robustness case. |
| `webhook-debugger/` | Mediocre | Anti-pattern: the entire instruction set (895 chars of numbered steps) stuffed into the description; body is one line pointing back at it. Ends with an overclaiming trigger. |
| `k8s-log-analyzer/` | Mediocre | `name` is 68 characters (over the 64 limit) and doesn't match the directory; body itself is decent. |
| `style-formatter/` | Mediocre | Copy-paste error: `name: code-formatter` duplicates another skill's name and mismatches the directory; body is decent. |
| `code-formatter/` | Decent | Clean and correct; exists partly as the collision partner for `style-formatter/`. |
| `meeting-notes/` | Decent | Single defect in an otherwise good skill: `name: meeting-summarizer` doesn't match the directory name. |
| `markdown-slides/` | Good text, broken links | Well-written skill whose `references/theme-guide.md` and `scripts/build.py` links point at files that don't exist. Dead progressive disclosure. |
| `release-automation/` | Mediocre | Valid frontmatter but a 666-line body of fifty near-identical stages — far over the ~500-line guidance; content that should have been a reference file or a loop. |
| `tech-translator/` | Good | English frontmatter with a fully Russian body (Cyrillic, tables, typographic quotes) — Unicode and non-English content handling. |
| `bug-repro-minimizer/` | Excellent | Description written as a YAML folded block scalar (`>-`) — a valid style parsers must handle; content is top-tier (oracle prerequisite, reduction loop, verification, example). |

## Notes

- Only `pdf-form-filler/` has files beyond SKILL.md; every other fixture in
  both batches is a single `SKILL.md` in its directory (`markdown-slides/`
  *references* extra files, deliberately without shipping them).
- The defects are deliberate. Do not "fix" them — they are the test data.
