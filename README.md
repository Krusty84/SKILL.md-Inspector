# SKILL.md Inspector

A Visual Studio Code extension that lints, validates, and inspects `SKILL.md`
files — the metadata files that describe Agent Skills. It acts as a
deterministic **quality gate** for skills: is the file valid, is it
discoverable by an agent, and is the `description` clear and trigger-friendly?

This is **MVP1–MVP3**: local, deterministic, and fast. It validates skills,
scores how well each `description` will trigger for an agent, and analyzes the
whole workspace for overlaps and portability. There is no LLM integration, no
network access, and no telemetry.

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
2. `npx @vscode/vsce package` → produces `skill-md-inspector-0.3.0.vsix`.
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
- **Trigger Quality Score (0–100)** — a deterministic score for each
  `description` across seven weighted criteria (action verb, usage trigger,
  concrete artifact, boundary, front-loaded intent, low vagueness, good length),
  shown in the Skill Report with a per-criterion breakdown. Missing boundary and
  front-loaded-intent are surfaced as information diagnostics that explain the
  lost points.
- **Improve Description Locally** — a command that builds a better `description`
  without an LLM: it keeps your wording and appends the missing "Use when…" /
  "Do not use when…" clauses (or offers the full template when the current one
  scores poorly).
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
  diagnostic counts, referenced/unreferenced files, and the Trigger Quality
  breakdown.
- **Workspace tree view** — a "SKILL.md Skills" view in the Explorer lists every
  skill with its status icon, Trigger Quality score, error/warning counts, and
  profile, and expands to show each skill's resource graph.
- **Skill collision detection** — finds skills whose descriptions overlap using
  smoothed TF-IDF cosine similarity, with High/Medium/Low risk bands and a
  collision matrix (skill A, skill B, similarity, shared terms, risk,
  recommendation).
- **Portability report** — shows per-skill compatibility (✓ / ⚠ / ✗) across the
  `generic`, `vscode`, `claude`, and `codex` profiles.
- **Resource graph** — per skill, classifies linked/bundled files as referenced,
  unreferenced, missing, remote, or absolute, and flags scripts, binaries, and
  large files.
- **Export Skills Index** — writes `skills.index.json` describing every skill
  (name, path, score, counts, profile compatibility).

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
| Show Skill Report | Open the read-only report (incl. Trigger Quality) for the active skill. |
| Improve Description Locally | Suggest a better `description` (no LLM) and optionally apply it. |
| Show Workspace Report | Open the workspace report: collision matrix, portability, resource graphs. |
| Export Skills Index | Write `skills.index.json` for the workspace. |
| Refresh Skills | Rescan the workspace and refresh the Skills tree view. |

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

- **MVP2 (done)** — a 0–100 Trigger Quality Score, front-loaded-intent and
  boundary checks, and local description rewrite templates.
- **MVP3 (done)** — workspace tree view, skill collision detection and matrix,
  portability report, resource graph, and `skills.index.json` export.
- **Later (not built)** — optional LLM-assisted review, a skill test harness,
  and a security scanner. The architecture leaves seams for these (e.g. the
  inert `llm/` provider interface) without requiring changes to the core parser.

## License

MIT
