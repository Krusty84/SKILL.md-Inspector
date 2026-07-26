---
name: code-formatter
description: Apply the team style guide to source files - naming conventions, comment style, and file organization. Use when the user asks to align code with the style guide or clean up naming.
---

# Style Formatter

Align source files with the team style guide.

## Workflow

1. Locate the style guide (`STYLE.md`, `CONTRIBUTING.md`, or a wiki link the
   user provides). If there is none, ask instead of inventing rules.
2. Apply only the rules the guide actually states: naming, comment format,
   file layout, import grouping.
3. Make the changes in small, reviewable commits, one rule per commit.
4. List every rule applied and every place a rule was ambiguous.

## Rules

- Renaming public API symbols needs the user's explicit approval first.
- Do not reformat whitespace here — that is the formatter tool's job.
