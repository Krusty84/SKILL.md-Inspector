---
name: git-commit-helper
description: Write clear, conventional git commit messages from staged changes. Use when the user asks to commit work, write a commit message, or clean up a commit history.
---

# Git Commit Helper

Produce a well-formed commit message from the currently staged diff.

## Workflow

1. Run `git diff --staged` to see what is actually being committed. If nothing
   is staged, tell the user and stop — do not stage files yourself.
2. Run `git log --oneline -10` to match the repository's existing message style
   (conventional commits vs. plain sentences).
3. Draft the message:
   - Subject line: imperative mood, under 72 characters, no trailing period.
   - Body: explain *why* the change was made, not a list of what files changed.
   - If the repo uses conventional commits, pick the correct type
     (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`).
4. Show the draft to the user before committing.

## Rules

- One logical change per commit. If the staged diff mixes unrelated changes,
  point that out and suggest splitting instead of committing anyway.
- Never use `--amend` or force-push unless the user explicitly asks.
- Do not invent ticket numbers or issue references.
