# Changelog

## 0.2.0 — MVP2 (Description Quality Analyzer)

### Added

- **Trigger Quality Score (0–100)** for every `description`, computed across
  seven weighted criteria (action verb 20, usage trigger 20, concrete artifact
  15, boundary 15, front-loaded intent 10, low vagueness 10, good length 10),
  with `excellent`/`good`/`acceptable`/`weak`/`poor` labels.
- Score and a per-criterion breakdown (points earned/possible) in the Skill
  Report webview.
- Information diagnostics for a missing boundary (`skill.description.noBoundary`)
  and non-front-loaded intent (`skill.description.notFrontLoaded`) that explain
  lost points.
- **Improve Description Locally** command — deterministic, no-LLM rewrite that
  preserves existing wording and appends missing trigger/boundary clauses (or
  offers the full template for poor descriptions).
- Unit tests for scoring behavior and the local rewrite/suggestions.

## 0.1.0 — MVP1

Initial release: a deterministic linter for `SKILL.md` files.

### Added

- YAML frontmatter parsing with missing / not-at-top / malformed detection.
- `name` validation (required, ≤ 64 chars, kebab-case, folder-name match).
- `description` validation (required, ≤ 1024 chars, min length, vagueness,
  action-verb, and usage-trigger checks).
- Markdown link validation (missing relative links, absolute local paths,
  remote and suspicious URLs).
- Unreferenced resource detection for `references/`, `scripts/`, `assets/`,
  and `templates/`.
- Body/section checks (missing body, examples, and "When to use").
- Quick fixes: kebab-case name, rename parent folder, insert frontmatter /
  name / description, insert body template, add "Use when…" / "Do not use
  when…" clauses, create missing linked file, add resource link.
- Commands: Validate Current Skill, Validate Workspace Skills, Insert SKILL.md
  Template, Show Skill Report.
- Read-only Skill Report webview.
- Settings for enabling validation, run-on-save, profile selection, and the
  name/description length limits.
- Inert `experimental.llmReview.enabled` setting and `llm/` provider interface
  reserved for future work.
