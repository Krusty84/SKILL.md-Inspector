# SKILL.md Inspector — Diagnostic Rules

Every diagnostic the extension can emit is listed here with its **code**, **default
severity**, its **rationale**, a **bad** and **good** example, and whether an
**auto-fix** (quick fix) exists.

Rules are grouped by **kind** so you can tell a hard requirement from a
recommendation at a glance:

- **Specification** — the file is invalid or a reference is broken. These are errors.
- **Compatibility** — the file is valid, but less portable across machines and
  platforms (link casing, absolute paths, unavailable remote links).
- **Security** — the file points at something risky to follow or download.
- **Quality** — recommendations that make a skill easier for an agent to discover and
  trigger. Never fatal.
- **Internal** — the linter itself failed to complete a check. Not a problem with your
  skill; shown so a crashed check never silently reduces coverage.

Severities: **error** (blocks a passing status), **warning**, **information**.

---

## Specification (the file is invalid)

### `skill.frontmatter.missing`

**error** · auto-fix: yes (insert a frontmatter block)

A `SKILL.md` must start with a YAML frontmatter block delimited by `---`.

- Bad: a file that begins with `# My Skill` and no `---` block.
- Good: a file that begins with `---\nname: my-skill\ndescription: …\n---`.

### `skill.frontmatter.invalid`

**error** · auto-fix: no

The frontmatter block is present but is not valid YAML.

- Bad: `description: "unterminated`
- Good: `description: "Format inspection reports."`

### `skill.frontmatter.notAtTop`

**error** · auto-fix: no

The frontmatter must be the very first thing in the file (no prose or blank lines above it).

- Bad: a paragraph of text, then the `---` block.
- Good: the `---` block on line 1.

### `skill.frontmatter.duplicateKey`

**error** · auto-fix: no

A top-level key appears more than once; YAML keeps only the last value, which is ambiguous.

- Bad: `name: a` on one line and `name: b` on another.
- Good: a single `name:` key.

### `skill.name.missing`

**error** · auto-fix: yes (insert `name`)

`name` is required — it identifies the skill.

- Bad: frontmatter with only `description:`.
- Good: `name: pdf-report-formatter`.

### `skill.name.type`

**error** · auto-fix: no

`name` must be a string.

- Bad: `name: 123`
- Good: `name: report-formatter`

### `skill.name.tooLong`

**error** · auto-fix: no

`name` exceeds the configured maximum length (default 64).

- Bad: a 90-character name.
- Good: a concise `name` under the limit.

### `skill.name.format`

**error** · auto-fix: yes (convert to kebab-case)

`name` must be lowercase letters, digits, and single hyphens, with no leading/trailing hyphen.

- Bad: `name: My Skill`
- Good: `name: my-skill`

### `skill.description.missing`

**error** · auto-fix: yes (insert `description`)

`description` is required — it is what an agent matches against.

- Bad: frontmatter with only `name:`.
- Good: `description: Format inspection reports. Use when standardizing reports.`

### `skill.description.type`

**error** · auto-fix: no

`description` must be a string. (No quality diagnostics are emitted for a wrongly-typed field.)

- Bad: `description: [a, b]`
- Good: `description: Format inspection reports.`

### `skill.description.tooLong`

**error** · auto-fix: no

`description` exceeds the configured maximum (1024 characters by default).

- Bad: a 2000-character description.
- Good: a focused description under the limit.

### `skill.description.tooVerbose`

**warning** · auto-fix: no

`description` exceeds the recommended 500-character length but remains within
the configured maximum. Keep capability and trigger scope in
frontmatter and move detailed procedure to the Markdown body.

### `skill.description.overbroadTrigger`

**warning** · auto-fix: no

The description uses a conservative overbroad phrase in skill-selection
context. Operational rules such as “Always verify the output” are not treated
as overbroad triggers. This finding limits Static Description Quality to 69.

### `skill.description.instructionHeavy`

**warning** · auto-fix: no

The description embeds a detailed workflow instead of summarizing capability
and trigger scope. Detailed procedure belongs in the Markdown body. This
finding limits Static Description Quality to 74.

### `skill.link.missing`

**error** · auto-fix: yes (create the missing file)

A relative Markdown link points at a file that does not exist in the package.

- Bad: `[guide](./references/missing.md)` with no such file.
- Good: link a file that exists under the skill directory.

---

## Compatibility (portability)

### `skill.link.caseMismatch`

**warning** · auto-fix: no

A relative link matches a bundled file except for letter case. It resolves on
case-insensitive filesystems (macOS, Windows) but breaks on case-sensitive ones
(Linux), so the skill is not portable as written.

- Bad: `[guide](./References/Style-Guide.md)` when the file is `references/style-guide.md`.
- Good: write the link with exactly the on-disk casing.

### `skill.link.absolute`

**warning** · auto-fix: no

An absolute local path is not portable to another machine.

- Bad: `[x](/Users/me/notes.md)`
- Good: `[x](./references/notes.md)`

### `skill.link.remoteUnavailable`

**warning** · auto-fix: no · online check only

An enabled online check reached a terminal HTTP response that indicates the link is
unavailable. Terminal `4xx` responses other than `403`, and all terminal `5xx`
responses, produce this diagnostic. The message includes the terminal status.

- Unavailable: `404`, `410`, or `500`.
- Accepted without this diagnostic: any `2xx`, direct `403`, or a safe redirect
  chain ending in `2xx` or `403`.

### `skill.link.remoteCheckFailed`

**information** · auto-fix: no · online check only

The checker could not determine availability because of a timeout, DNS, connection,
or TLS failure; an invalid redirect; a redirect loop; or more than five redirects.
This diagnostic does not claim that the link is broken.

---

## Security

### `skill.link.escapesRoot`

**error** (lexical escape) / **warning** (symlink escape) · auto-fix: no (no create-file fix is offered)

A link resolves outside the skill package — a directory-traversal risk.

- Bad: `[x](../../.env)`
- Good: keep linked files inside the skill directory.

### `skill.link.remoteSuspicious`

**warning** (suspicious) / **information** (ordinary remote) · auto-fix: no

A remote link an agent might follow; insecure transport, credentials, raw IPs, shorteners, or
executable/archive extensions are flagged as suspicious.

- Bad: `[run](http://example.com/run.exe)`
- Good: `[doc](https://example.com/guide)` — or bundle the material in the package.

This static diagnostic is unchanged by online checking and is emitted even when
online checking is disabled.

### `skill.link.remoteCheckBlocked`

**warning** · auto-fix: no · online check only

The URL was not requested because it failed SSRF safety validation. Examples include
embedded credentials, malformed or local-only hosts, direct non-public addresses,
mixed public/private DNS answers, redirects to prohibited destinations, and
HTTPS-to-HTTP redirects. Initial targets and every redirect are validated before a
connection is attempted.

---

## Quality (recommendations)

### `skill.name.folderMismatch`

**warning** · auto-fix: yes (rename the parent folder)

A skill folder's name should match its `name` so it is easy to locate.

- Bad: folder `pdf/` containing `name: pdf-report-formatter`.
- Good: folder `pdf-report-formatter/`.

### `skill.description.tooShort`

**warning** · auto-fix: no

`description` is shorter than the recommended minimum (default 40), so an agent has little to match.

- Bad: `description: Formats.`
- Good: `description: Format inspection reports. Use when standardizing reports.`

### `skill.description.vague`

**warning** · auto-fix: no

`description` uses vague wording ("powerful", "smart", "helps with …") instead of concrete detail.

- Bad: `description: A powerful helper for documents.`
- Good: `description: Convert Markdown documents to formatted PDF reports.`

### `skill.description.noVerb`

**warning** · auto-fix: no

`description` has no clear action verb stating the capability in its first two
sentences (any inflection counts, including gerund and noun-phrase openings such
as "Formatting invoices…" or "A skill that extracts…").

- Bad: `description: A helper for reports.`
- Good: `description: Format inspection reports.`

### `skill.description.noTrigger`

**warning** · auto-fix: yes (insert a "Use when…" clause)

`description` does not say _when_ to use the skill.

- Bad: `description: Format inspection reports.`
- Good: `description: Format inspection reports. Use when standardizing an inspection report.`

### `skill.description.noBoundary`

**information** · auto-fix: yes (insert a "Do not use when…" clause)

`description` does not say when _not_ to use the skill; a boundary sharpens triggering.

- Bad: `description: Format reports. Use when standardizing reports.`
- Good: `… Use when standardizing reports. Do not use when handling invoices.`

### `skill.description.notFrontLoaded`

**information** · auto-fix: no

The main capability is not stated in the first words, where it matches most reliably.

- Bad: `description: When preparing a release, generate release notes.`
- Good: `description: Generate release notes when preparing a tagged release.`

### `skill.resource.unreferenced`

**warning** · auto-fix: yes (add a Markdown link)

A file under `references/`, `scripts/`, `assets/`, or `templates/` is never referenced from `SKILL.md`.

- Bad: `references/style-guide.md` exists but nothing links or names it.
- Good: `See [the style guide](./references/style-guide.md).` (or name the path in prose).

### Token-budget diagnostics

Token budgets use exact, offline `o200k_base` tokenization. Every threshold uses a
strict greater-than comparison: a value equal to a limit does not exceed it. When a
metric has warning and error limits, only the highest applicable diagnostic is
emitted. Resource diagnostics are attached to the top of `SKILL.md` and name the
affected file or aggregate group because VS Code cannot attach them to every bundled
resource.

These diagnostics affect validation status and warning/error counts. They do not
change instruction or resource authoring-quality scores.

### `skill.token.body.limit`

**warning** · auto-fix: no

The Markdown body after YAML frontmatter exceeds 5,000 `o200k_base` tokens. YAML
frontmatter is not counted. Large instruction bodies consume excessive agent context;
move detailed supporting material into focused reference files.

- Warning: `SKILL.md` body has 5,001 tokens.
- No finding: `SKILL.md` body has exactly 5,000 tokens.

### `skill.token.body.lines`

**warning** · auto-fix: no

The Markdown body after YAML frontmatter exceeds 500 lines. This diagnostic uses the
same body line count as the existing instruction-authoring length finding.

- Warning: `SKILL.md` body has 501 lines.
- No finding: `SKILL.md` body has exactly 500 lines.

### `skill.token.referenceFile.limit`

**warning** above 10,000 / **error** above 25,000 · auto-fix: no

One readable text file recursively under the exact top-level `references/` directory
exceeds its per-file budget. Referenced and unreferenced files are both measured.

- Warning: `references/api.md` has 25,000 tokens.
- Error: `references/api.md` has 25,001 tokens; the error replaces the warning.
- Good: split a large guide into focused reference files and link the relevant ones.

### `skill.token.references.limit`

**warning** above 25,000 / **error** above 50,000 · auto-fix: no

All counted reference files together exceed the aggregate reference budget. This
guards against a package whose individual references are acceptable but whose total
context is excessive.

- Warning: reference files total 25,001 tokens.
- Error: reference files total 50,001 tokens; the error replaces the warning.
- No finding: reference files total exactly 25,000 tokens.

### `skill.token.otherFiles.limit`

**warning** above 25,000 / **error** above 100,000 · auto-fix: no

Readable non-standard text files outside `SKILL.md`, `references/`, `scripts/`, and
`assets/` exceed their aggregate budget. For this rule, `templates/` and unknown
top-level directories are non-standard content. There are no script or asset token
limits.

- Warning: non-standard files total 25,001 tokens.
- Error: non-standard files total 100,001 tokens; the error replaces the warning.
- Good: keep auxiliary text focused or place true reference content under
  `references/`.

### `skill.body.missing`

**warning** · auto-fix: yes (insert a body template)

There is no Markdown body after the frontmatter to document the workflow.

- Bad: a file that ends right after the closing `---`.
- Good: a body with the workflow, inputs, and outputs.

### `skill.body.noExamples`

**information** (or **warning** under strict body checks) · auto-fix: no

No "Examples" section. Governed by `skillMdInspector.body.strictness`.

- Bad: a body with no examples.
- Good: an `## Examples` section.

### `skill.body.noWhenToUse`

**information** (or **warning** under strict body checks) · auto-fix: no

No "When to use" section.

- Bad: a body that never states when to use the skill.
- Good: a `## When to use` section.

### `skill.body.suggestBoundary`

**information** (or **warning** under strict body checks) · not emitted by the generic policy, whose recommended sections are examples and when-to-use · auto-fix: no

No boundary section, and no "Do not use when…" prose either.

- Bad: a body with no scope boundaries.
- Good: a `## Boundaries` section or a "Do not use when…" clause.

### `skill.body.suggestIO`

**information** (or **warning** under strict body checks) · not emitted by the generic policy, whose recommended sections are examples and when-to-use · auto-fix: no

No inputs/outputs section when the recommended sections include documenting I/O.

- Bad: a body that never describes inputs or outputs.
- Good: an `## Inputs and outputs` section.

---

## Internal (the linter itself failed)

### `skill.internal.ruleError`

**information** · auto-fix: no

A validation rule threw an exception and did not finish. The other rules still ran
and their results are unaffected; only that one rule's checks are skipped for this
file. This indicates a bug in the extension (or an unusual input that exposed one),
not a problem with your skill — please report the message if it persists.

- Cause: an unexpected error inside a single validation rule.
- Effect: that rule's diagnostics are missing for this file; every other check is normal.
