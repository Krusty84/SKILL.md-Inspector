---
name: code-formatter
description: Run the project's configured formatter (prettier, black, gofmt, rustfmt) on changed files and fix formatting-only CI failures. Use when the user asks to format code, fix a lint/format CI step, or normalize whitespace and import order. Do not use for logic changes or refactoring.
---

# Code Formatter

Apply the project's own formatter — never impose a different style.

## Workflow

1. Detect the formatter from config files (`.prettierrc`, `pyproject.toml`
   `[tool.black]`, `.editorconfig`, `rustfmt.toml`) or the CI step that failed.
   If none exists, ask before introducing one.
2. Run it on the changed files only (`git diff --name-only`), not the whole
   repository, unless the user asks for a full pass.
3. Re-run the exact failing CI command locally to confirm it now passes.
4. Show the user a summary: which files changed and which tool/version ran.

## Rules

- Formatting commits must contain no semantic changes; if the formatter's
  output alters behavior (rare, but possible with aggressive import sorting),
  stop and report it.
- Respect ignore files (`.prettierignore`, `# fmt: off` markers).
