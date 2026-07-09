# SKILL.md Inspector

A Visual Studio Code extension that lints, validates, and inspects `SKILL.md`
files — the metadata files that describe Agent Skills. It acts as a
deterministic **quality gate** for skills: is the file valid, is it
discoverable by an agent, and is the `description` clear and trigger-friendly?

This is **MVP1**: local, deterministic, and fast. There is no LLM integration,
no network access, and no telemetry.

## Running the extension

> **Opening this repository in VS Code does not load the extension** — the
> folder is just its source code, so the `SKILL.md Inspector:` commands will not
> appear in the Command Palette of your normal window. You must *run* or
> *install* the extension first.

**Option A — run it (for trying/developing):**

1. `npm install`
2. Press **F5** (or Run and Debug → "Run Extension"). This builds `dist/` and
   opens a second window titled **[Extension Development Host]**.
3. In *that* window, open the Command Palette (Ctrl/Cmd+Shift+P) and type
   "SKILL.md Inspector" — the four commands appear there. Open a `SKILL.md`
   file (e.g. from `fixtures/`) to see diagnostics and quick fixes.

**Option B — install it (to use in your normal window):**

1. `npm install`
2. `npx @vscode/vsce package` → produces `skill-md-inspector-0.1.0.vsix`.
3. In VS Code: Command Palette → **Extensions: Install from VSIX…** → pick the
   file, then reload. The commands now appear in your normal window.

If pressing F5 does nothing, make sure `npm install` has run so the build task
can execute.

## Features

- **Frontmatter validation** — reports missing, malformed, or not-at-top YAML
  frontmatter.
- **`name` rules** — required, string, ≤ 64 chars, lowercase/digits/hyphens
  only, no leading/trailing hyphen, and a warning when it does not match the
  parent skill folder.
- **`description` rules** — required, string, ≤ 1024 chars, with quality
  warnings for descriptions that are too short, vague, missing an action verb,
  or missing a usage-trigger clause.
- **Markdown link validation** — relative links to missing files are errors,
  absolute local paths are warnings, and remote URLs are information (or a
  warning when they look suspicious).
- **Unreferenced resource detection** — warns about files under
  `references/`, `scripts/`, `assets/`, or `templates/` that are never linked
  from `SKILL.md`.
- **Body checks** — warns when there is no body, no examples section, or no
  "When to use" section, and suggests boundaries and I/O documentation.
- **Quick fixes** — convert a name to kebab-case, rename the parent folder,
  insert frontmatter / `name` / `description`, insert a body template, add a
  "Use when…" or "Do not use when…" clause, create a missing linked file, and
  add a Markdown link to an unreferenced resource.
- **Skill Report** — a read-only webview summarizing the skill's status,
  diagnostic counts, referenced/unreferenced files, and description-quality
  notes.

## Where skills are detected

Validation runs on any file named exactly `SKILL.md`, including the common
locations:

```
.github/skills/<skill-name>/SKILL.md
.claude/skills/<skill-name>/SKILL.md
.agents/skills/<skill-name>/SKILL.md
.copilot/skills/<skill-name>/SKILL.md
skills/<skill-name>/SKILL.md
```

A standalone `SKILL.md` opened anywhere in the workspace also works.

## Commands

Available from the Command Palette under **SKILL.md Inspector**:

| Command | Description |
| --- | --- |
| Validate Current Skill | Validate the `SKILL.md` in the active editor. |
| Validate Workspace Skills | Validate every `SKILL.md` in the workspace. |
| Insert SKILL.md Template | Insert a starter template. |
| Show Skill Report | Open the read-only report for the active skill. |

## Settings

| Setting | Default | Description |
| --- | --- | --- |
| `skillMdInspector.validation.enabled` | `true` | Enable validation. |
| `skillMdInspector.validation.runOnSave` | `true` | Re-validate on save. |
| `skillMdInspector.profile` | `generic` | `generic` \| `vscode` \| `claude` \| `codex`. |
| `skillMdInspector.description.minLength` | `40` | Minimum recommended description length. |
| `skillMdInspector.description.maxLength` | `1024` | Maximum allowed description length. |
| `skillMdInspector.name.maxLength` | `64` | Maximum allowed name length. |
| `skillMdInspector.experimental.llmReview.enabled` | `false` | Reserved for future LLM review (inert in MVP1). |

## Development

```bash
npm install
npm run check-types   # tsc --noEmit
npm run build         # esbuild bundle -> dist/extension.js
npm test              # vitest unit tests
npm run lint          # eslint
```

All parsing, validation, and quality logic lives in pure modules that never
import `vscode`, so the entire rule set is unit-tested headlessly. The `vscode`
API is confined to the adapter layer (`extension.ts`, `diagnostics/`,
`codeActions/`, `commands/`, `ui/`).

### Try it in the Extension Development Host

1. Run `npm install` and press **F5** (Run Extension) to launch the Extension
   Development Host.
2. In the new window, open this repository's `fixtures/` folder.
3. Open `fixtures/skills/pdf-helper/SKILL.md` — you should see errors and
   warnings (invalid name, short/vague description, missing sections) with quick
   fixes on the lightbulb.
4. Open `fixtures/skills/pdf-report-formatter/SKILL.md` — no errors; only quality
   warnings (e.g. no examples section, one unreferenced resource file).
5. Run **SKILL.md Inspector: Show Skill Report** to open the report webview.

## Roadmap

- **MVP2** — a 0–100 Trigger Quality Score, front-loaded-intent and boundary
  checks, and local description rewrite templates.
- **MVP3** — workspace tree view, skill collision detection and matrix,
  portability report, resource graph, and `skills.index.json` export.

The architecture leaves seams for these (e.g. `quality/`, `profiles/`, and an
inert `llm/` provider interface) without requiring changes to the core parser.

## License

MIT
