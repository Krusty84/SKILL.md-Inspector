# Changelog

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
