---
name: changelog-writer
description: Generate or update a CHANGELOG.md from merged commits and pull requests, grouped by change type and written for end users. Use when the user asks to write release notes, update the changelog, or summarize what changed between two versions or tags. Do not use for writing individual commit messages or for API-reference documentation.
---

# Changelog Writer

Turn raw commit history into a changelog entry that a *user* of the project can
read — not a mirror of the git log.

## Workflow

1. **Find the range.** Determine the span to describe: usually
   `git log <last-tag>..HEAD`. If no tag exists, ask the user for the starting
   point rather than guessing.
2. **Collect changes.** Read the commit subjects and, where a commit is vague,
   the diff itself. Ignore merge commits, version bumps, and CI-only changes.
3. **Group and translate.** Sort changes into these sections, omitting empty
   ones:
   - `Added` — new features
   - `Changed` — changes to existing behavior
   - `Fixed` — bug fixes
   - `Deprecated` / `Removed` — retired functionality
   - `Security` — vulnerability fixes
   Rewrite each item from the user's perspective: "Exports now include UTF-8
   BOM so Excel opens them correctly", not "fix encoding in export.py".
4. **Write the entry.** Follow the existing file's format if CHANGELOG.md
   already exists. Otherwise use Keep a Changelog style with a version heading
   and ISO date, e.g. `## [1.4.0] - 2026-07-19`.
5. **Review.** Re-read the entry and drop any item that a user of the project
   would not notice or care about.

## Example

Input commits:

```
fix: handle nil pointer in csv export (#212)
chore: bump deps
feat: add --dry-run flag to sync command (#209)
```

Output entry:

```markdown
## [1.4.0] - 2026-07-19

### Added
- `sync` now supports `--dry-run` to preview changes without writing (#209).

### Fixed
- CSV export no longer crashes on rows with empty optional fields (#212).
```

## Rules

- Never fabricate a change that is not in the history.
- Keep PR/issue numbers when the project's existing changelog includes them.
- New entries go at the top, above previous releases.
