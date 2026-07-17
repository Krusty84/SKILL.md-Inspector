# SKILL.md Inspector — Diagnostic Rules

Every diagnostic the extension can emit is listed here with its **code**, **default
severity**, the **profiles** it applies to, its **rationale**, a **bad** and **good**
example, and whether an **auto-fix** (quick fix) exists.

Rules are grouped by **kind** so you can tell a hard requirement from a
recommendation at a glance:

- **Specification** — the file is invalid or a reference is broken. These are errors.
- **Compatibility** — the file is valid, but a target agent/profile has stricter
  metadata or portability rules.
- **Security** — the file points at something risky to follow or download.
- **Quality** — recommendations that make a skill easier for an agent to discover and
  trigger. Never fatal.

Severities: **error** (blocks a passing status), **warning**, **information**.
Profiles are `generic`, `vscode`, `claude`, `codex`; "all" means every profile.

---

## Specification (the file is invalid)

### `skill.frontmatter.missing`

**error** · all profiles · auto-fix: yes (insert a frontmatter block)

A `SKILL.md` must start with a YAML frontmatter block delimited by `---`.

- Bad: a file that begins with `# My Skill` and no `---` block.
- Good: a file that begins with `---\nname: my-skill\ndescription: …\n---`.

### `skill.frontmatter.invalid`

**error** · all profiles · auto-fix: no

The frontmatter block is present but is not valid YAML.

- Bad: `description: "unterminated`
- Good: `description: "Format inspection reports."`

### `skill.frontmatter.notAtTop`

**error** · all profiles · auto-fix: no

The frontmatter must be the very first thing in the file (no prose or blank lines above it).

- Bad: a paragraph of text, then the `---` block.
- Good: the `---` block on line 1.

### `skill.frontmatter.duplicateKey`

**error** · all profiles · auto-fix: no

A top-level key appears more than once; YAML keeps only the last value, which is ambiguous.

- Bad: `name: a` on one line and `name: b` on another.
- Good: a single `name:` key.

### `skill.name.missing`

**error** · all profiles · auto-fix: yes (insert `name`)

`name` is required — it identifies the skill.

- Bad: frontmatter with only `description:`.
- Good: `name: pdf-report-formatter`.

### `skill.name.type`

**error** · all profiles · auto-fix: no

`name` must be a string.

- Bad: `name: 123`
- Good: `name: report-formatter`

### `skill.name.tooLong`

**error** · all profiles · auto-fix: no

`name` exceeds the profile's maximum length (default 64).

- Bad: a 90-character name.
- Good: a concise `name` under the limit.

### `skill.name.format`

**error** · all profiles · auto-fix: yes (convert to kebab-case)

`name` must be lowercase letters, digits, and single hyphens, with no leading/trailing hyphen.

- Bad: `name: My Skill`
- Good: `name: my-skill`

### `skill.description.missing`

**error** · all profiles · auto-fix: yes (insert `description`)

`description` is required — it is what an agent matches against.

- Bad: frontmatter with only `name:`.
- Good: `description: Format inspection reports. Use when standardizing reports.`

### `skill.description.type`

**error** · all profiles · auto-fix: no

`description` must be a string. (No quality diagnostics are emitted for a wrongly-typed field.)

- Bad: `description: [a, b]`
- Good: `description: Format inspection reports.`

### `skill.description.tooLong`

**error** · all profiles · auto-fix: no

`description` exceeds the profile maximum (default 1024).

- Bad: a 2000-character description.
- Good: a focused description under the limit.

### `skill.link.missing`

**error** · all profiles · auto-fix: yes (create the missing file)

A relative Markdown link points at a file that does not exist in the package.

- Bad: `[guide](./references/missing.md)` with no such file.
- Good: link a file that exists under the skill directory.

---

## Compatibility (portability across agent profiles)

### `skill.link.caseMismatch`

**warning** · all profiles · auto-fix: no

A relative link matches a bundled file except for letter case. It resolves on
case-insensitive filesystems (macOS, Windows) but breaks on case-sensitive ones
(Linux), so the skill is not portable as written.

- Bad: `[guide](./References/Style-Guide.md)` when the file is `references/style-guide.md`.
- Good: write the link with exactly the on-disk casing.

### `skill.link.absolute`

**warning** · all profiles · auto-fix: no

An absolute local path is not portable to another machine.

- Bad: `[x](/Users/me/notes.md)`
- Good: `[x](./references/notes.md)`

### `skill.metadata.reservedWord`

**warning** · claude · auto-fix: no

`name`/`description` uses a word reserved by the target platform's metadata rules.

- Bad: `description: Uses Anthropic models to …` (under the `claude` profile).
- Good: describe the capability without the reserved word.

### `skill.metadata.xmlTag`

**warning** · claude · auto-fix: no

`name`/`description` contains an XML-like tag, which some platforms reject in metadata.

- Bad: `description: Wrap output in <tag> markers.`
- Good: `description: Wrap output in "tag" markers.`

### `skill.metadata.fieldType`

**warning** · vscode, codex · auto-fix: no

A profile-specific frontmatter field has the wrong type.

- Bad: `user-invocable: "yes"` (expects a boolean, under the `vscode` profile).
- Good: `user-invocable: true`

### `skill.metadata.unknownKey`

**warning** (or **error** where the profile's policy is stricter) · claude, codex · auto-fix: no

A top-level frontmatter key is not recognized by the target profile.

- Bad: `made-up-key: 1` under a profile whose unknown-key policy is not `allow`.
- Good: remove the key or use a recognized one.

---

## Security

### `skill.link.escapesRoot`

**error** (lexical escape) / **warning** (symlink escape) · all profiles · auto-fix: no (no create-file fix is offered)

A link resolves outside the skill package — a directory-traversal risk.

- Bad: `[x](../../.env)`
- Good: keep linked files inside the skill directory.

### `skill.link.remoteSuspicious`

**warning** (suspicious) / **information** (ordinary remote) · all profiles · auto-fix: no

A remote link an agent might follow; insecure transport, credentials, raw IPs, shorteners, or
executable/archive extensions are flagged as suspicious.

- Bad: `[run](http://example.com/run.exe)`
- Good: `[doc](https://example.com/guide)` — or bundle the material in the package.

---

## Quality (recommendations)

### `skill.name.folderMismatch`

**warning** · all profiles · auto-fix: yes (rename the parent folder)

A skill folder's name should match its `name` so it is easy to locate.

- Bad: folder `pdf/` containing `name: pdf-report-formatter`.
- Good: folder `pdf-report-formatter/`.

### `skill.description.tooShort`

**warning** · all profiles · auto-fix: no

`description` is shorter than the recommended minimum (default 40), so an agent has little to match.

- Bad: `description: Formats.`
- Good: `description: Format inspection reports. Use when standardizing reports.`

### `skill.description.vague`

**warning** · all profiles · auto-fix: no

`description` uses vague wording ("powerful", "smart", "helps with …") instead of concrete detail.

- Bad: `description: A powerful helper for documents.`
- Good: `description: Convert Markdown documents to formatted PDF reports.`

### `skill.description.noVerb`

**warning** · all profiles · auto-fix: no

`description` has no clear action verb stating the capability.

- Bad: `description: A helper for reports.`
- Good: `description: Format inspection reports.`

### `skill.description.noTrigger`

**warning** · all profiles · auto-fix: yes (insert a "Use when…" clause)

`description` does not say _when_ to use the skill.

- Bad: `description: Format inspection reports.`
- Good: `description: Format inspection reports. Use when standardizing an inspection report.`

### `skill.description.noBoundary`

**information** · all profiles · auto-fix: yes (insert a "Do not use when…" clause)

`description` does not say when _not_ to use the skill; a boundary sharpens triggering.

- Bad: `description: Format reports. Use when standardizing reports.`
- Good: `… Use when standardizing reports. Do not use when handling invoices.`

### `skill.description.notFrontLoaded`

**information** · all profiles · auto-fix: no

The main capability is not stated in the first words, where it matches most reliably.

- Bad: `description: When preparing a release, generate release notes.`
- Good: `description: Generate release notes when preparing a tagged release.`

### `skill.resource.unreferenced`

**warning** · all profiles · auto-fix: yes (add a Markdown link)

A file under `references/`, `scripts/`, `assets/`, or `templates/` is never referenced from `SKILL.md`.

- Bad: `references/style-guide.md` exists but nothing links or names it.
- Good: `See [the style guide](./references/style-guide.md).` (or name the path in prose).

### `skill.body.missing`

**warning** · all profiles · auto-fix: yes (insert a body template)

There is no Markdown body after the frontmatter to document the workflow.

- Bad: a file that ends right after the closing `---`.
- Good: a body with the workflow, inputs, and outputs.

### `skill.body.noExamples`

**information** (or **warning** under strict body checks) · all profiles · auto-fix: no

No "Examples" section. Governed by `skillMdInspector.body.strictness`.

- Bad: a body with no examples.
- Good: an `## Examples` section.

### `skill.body.noWhenToUse`

**information** (or **warning** under strict body checks) · all profiles · auto-fix: no

No "When to use" section.

- Bad: a body that never states when to use the skill.
- Good: a `## When to use` section.

### `skill.body.suggestBoundary`

**information** (or **warning** under strict body checks) · profiles that recommend it · auto-fix: no

No boundary section, and no "Do not use when…" prose either.

- Bad: a body with no scope boundaries.
- Good: a `## Boundaries` section or a "Do not use when…" clause.

### `skill.body.suggestIO`

**information** (or **warning** under strict body checks) · profiles that recommend it · auto-fix: no

No inputs/outputs section for skills whose profile recommends documenting I/O.

- Bad: a body that never describes inputs or outputs.
- Good: an `## Inputs and outputs` section.

---

## Portability notes (not editor diagnostics)

These surface in the **workspace portability report**, not the editor's Problems panel.

### `skill.portability.claude.descriptionLong`

**warning** · claude · auto-fix: no

The `description` is longer than Claude's recommended soft maximum (500 characters), so it may be
truncated when matched.

- Bad: a 700-character description.
- Good: tighten it under ~500 characters.
