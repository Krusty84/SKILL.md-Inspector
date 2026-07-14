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
   "SKILL.md Inspector" — the commands appear there. Open a `SKILL.md`
   file (e.g. from `fixtures/`) to see diagnostics and quick fixes.

**Option B — install it (to use in your normal window):**

1. `npm install`
2. `npx @vscode/vsce package` → produces `skill-md-inspector-0.3.0.vsix`.
3. In VS Code: Command Palette → **Extensions: Install from VSIX…** → pick the
   file, then reload. The commands now appear in your normal window.

If pressing F5 does nothing, make sure `npm install` has run so the build task
can execute.

## Features

- **Frontmatter validation** — reports missing, malformed, not-at-top, or
  duplicate-key YAML frontmatter.
- **`name` rules** — required, string, ≤ 64 chars, lowercase/digits/hyphens
  only, no leading/trailing hyphen, and a warning when it does not match the
  parent skill folder.
- **`description` rules** — required, string, ≤ 1024 chars, with quality
  warnings for descriptions that are too short, vague, missing an action verb,
  or missing a usage-trigger clause.
- **Profile-specific metadata rules** — for the selected profile, flags Claude
  reserved words and XML-like tags, checks VS Code / Codex field types, and
  applies an unknown-key policy.
- **Heuristic Trigger Quality Score (0–100)** — a *deterministic heuristic* for
  each `description` across seven weighted criteria (action verb, usage trigger,
  concrete artifact, boundary, front-loaded intent, low vagueness, good length),
  shown in the Skill Report with a per-criterion breakdown, a **confidence** level,
  and any analysis **limitations**. It estimates how discoverable a description is
  and **does not guarantee** that an agent will select the skill at runtime.
  Missing boundary and front-loaded-intent are surfaced as information diagnostics
  that explain the lost points.
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
  "When to use" section, and suggests boundaries and I/O documentation; advisory
  strictness is configurable (`off` / `recommended` / `strict`).
- **Diagnostic classification & overrides** — every diagnostic is classified as
  specification, compatibility, security, or quality, and its severity can be
  overridden or disabled by code (structural errors stay protected by default).
- **Quick fixes** — convert a name to kebab-case, rename the parent folder,
  insert frontmatter / `name` / `description`, insert a body template, add a
  "Use when…" or "Do not use when…" clause, create a missing linked file, and
  add a Markdown link to an unreferenced resource.
- **Skill Report** — a read-only webview summarizing the skill's status,
  diagnostic counts, referenced/unreferenced files, and the Trigger Quality
  breakdown.
- **Activity Bar navigator** — a dedicated **SKILL.md INSPECTOR** icon opens three independent Views: **FAVORITES**, **WORKSPACE**, and **INSTALLED AGENTS**.
- **Favorites** — add frequently inspected `SKILL.md` files from the Inspector submenu in the editor, Explorer, or Inspector Views. Favorites persist locally across restarts and workspace changes; missing files stay visible with a warning until removed.
- **Skills analysis Panel** — the existing **SKILL.md Skills** analysis view remains separate in the bottom Panel. It still lists every skill with its status icon, Trigger Quality score, error/warning counts, profile, and resource graph.
- **Skill collision detection** — finds skills whose descriptions overlap using a
  composite of smoothed TF-IDF cosine, token Jaccard, character n-gram, and name
  similarity, with High/Medium/Low risk bands and a separate **confidence** in the
  textual evidence, shown in a collision matrix (skill A, skill B, similarity,
  shared terms, risk, confidence, recommendation).
- **Portability report** — shows per-skill compatibility (✓ / ⚠ / ✗) across the
  `generic`, `vscode`, `claude`, and `codex` profiles.
- **Resource graph** — per skill, classifies linked/bundled files as referenced,
  unreferenced, missing, remote, or absolute, and flags scripts, binaries, and
  large files.
- **Export Skills Index** — writes `skills.index.json` describing every skill
  (name, path, score, counts, profile compatibility, and a per-diagnostic
  summary of code, severity, and kind).
- **Workspace scanning** — validation, the workspace report, and the index run
  with progress and can be cancelled; discovery skips dependency, build, and
  vendored directories (configurable).

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

## SKILL.md Inspector sidebar

Select the **SKILL.md INSPECTOR** icon in the Activity Bar to open the extension
sidebar. The container has three independent Views instead of one combined
**Agent Files** tree:

- **FAVORITES** — local, ordered shortcuts to `SKILL.md` files you inspect often.
  Only files named exactly `SKILL.md` can be added. If a favorite is on a
  disconnected drive or was deleted, it remains visible as **Missing** and can be
  removed from its context menu.
- **WORKSPACE** — an Explorer-like browser for every open workspace folder,
  including multi-root and remote workspaces. Expand and collapse directories to
  load their direct children lazily. All files are visible, subject only to VS
  Code's standard `files.exclude` setting; `skillMdInspector.discovery.exclude`
  does not control this browser. Selecting a file opens it with its original VS
  Code URI. Workspace files and directories keep normal VS Code resource behavior
  such as file icons, decorations, URI handling, and resource-aware commands from
  VS Code or other extensions. The View toolbar provides **New File**, **New
  Folder**, **Refresh**, and VS Code's standard **Collapse All** action; the
  overflow menu includes **Add Folder to Workspace...** and **Open Folder in New
  Window...**.
- **INSTALLED AGENTS** — supported local agent files discovered from bounded,
  declared roots without running agent executables or scanning your full home
  directory.

Because these are standard VS Code Views, **FAVORITES**, **WORKSPACE**, and
**INSTALLED AGENTS** can each be collapsed, expanded, resized vertically, hidden,
or restored from the standard Views menu independently.

Inspector-specific context actions are grouped under the **SKILL.md Inspector**
submenu for exact `SKILL.md` resources. **Add SKILL.md to Favorites** is no
longer contributed as a standalone top-level context-menu item; it appears in
that submenu for non-favorited `SKILL.md` files in **WORKSPACE** and
**INSTALLED AGENTS**. Already favorited `SKILL.md` entries in **FAVORITES**,
**WORKSPACE**, and **INSTALLED AGENTS** show **Remove from Favorites** instead.
Missing Favorites, `AGENTS.md`, ordinary files, directories, workspace roots,
and agent group nodes do not receive the submenu. The submenu is shown in editor
and built-in Explorer context menus only while the **SKILL.md INSPECTOR**
Activity Bar container is active.

Built-in local agent locations are:

| Agent | Files shown | Paths |
| --- | --- | --- |
| Codex | Global instructions | `$CODEX_HOME/AGENTS.md` when `CODEX_HOME` is set, otherwise `~/.codex/AGENTS.md` |
| Codex | User skills | `~/.agents/skills/**/SKILL.md` |
| Codex | Admin skills | `/etc/codex/skills/**/SKILL.md` on non-Windows systems when readable |
| Claude Code | Skills | `~/.claude/skills/**/SKILL.md` |
| GitHub Copilot | Skills | `~/.copilot/skills/**/SKILL.md` |

Project-level agent folders such as `.agents/skills`, `.claude/skills`, and
`.github/skills` are shown in **WORKSPACE**, not repeated under **INSTALLED
AGENTS**.

Use **Add SKILL.md to Favorites** from the **SKILL.md Inspector** submenu on a
non-favorited Inspector `SKILL.md` item. In the editor and built-in Explorer, use
**Add or Remove Favorite** from the same submenu while the Inspector Activity Bar
container is active. Use **Remove from Favorites** on a favorite or
already-favorited Inspector item, and **Clear All Favorites** from the
**FAVORITES** View title menu.

**Sidebar vs. SKILL.md Skills:** the **SKILL.md INSPECTOR** sidebar is for
navigation: **FAVORITES** contains specialized `SKILL.md` shortcuts, **WORKSPACE**
is a full lazy file browser, and **INSTALLED AGENTS** remains specialized
discovery for local `SKILL.md` and `AGENTS.md` files. **SKILL.md Skills** remains
the bottom Panel view for analysis, diagnostics, name conflicts, collision
detection, portability, and resource graphs.


### WORKSPACE file-management actions

The **WORKSPACE** View reproduces the common Explorer workflow by using public VS
Code APIs (`vscode.workspace.fs`, `vscode.workspace.updateWorkspaceFolders`, file
pickers, input boxes, terminals, and documented `vscode.*` commands). It does not
reuse VS Code's private Explorer implementation or attach the built-in
`explorer/context` menu to the custom View. Built-in compatibility actions are
feature-detected during activation, so unsupported VS Code commands are hidden
instead of failing the menu.

- The View toolbar keeps the quick **New File**, **New Folder**, **Refresh**, and
  VS Code **Collapse All** actions. Context-menu creation entries use Explorer
  wording (**New File...** and **New Folder...**) and appear only on directories
  and workspace roots, not on files. Nested relative paths such as
  `src/example.ts` are supported, but absolute paths and `..` traversal are
  rejected.
- File context menus are Explorer-like: **Open to the Side**, **Open With...**,
  the platform reveal action (**Reveal in File Explorer**, **Reveal in Finder**,
  or **Open Containing Folder**) for local resources, **Open in Integrated
  Terminal**, compare actions, **Open Timeline**, **Cut**, **Copy**, path-copy
  actions, **Rename...**, and **Delete**.
- Markdown-compatible files (`.md`, including `SKILL.md`) add **Open Preview**
  and **Find File References** when VS Code's Markdown commands are available.
  Selecting a file in the tree still opens the source document; preview is an
  explicit context-menu action.
- **Select for Compare** stores the selected file as the comparison source. After
  a source is selected, file menus show **Compare with Selected**, which opens a
  `vscode.diff` editor against the explicit WORKSPACE URI.
- **Find in Folder...** appears on directories and workspace roots and opens VS
  Code search restricted to the selected folder path, including multi-root
  workspaces.
- **Open in Images Preview** appears only when VS Code exposes the compatible
  Images Preview command. It is offered for folders and common image/video files
  such as `.png`, `.jpg`, `.gif`, `.webp`, `.svg`, `.mp4`, `.webm`, and `.mov`.
- Folder menus contain **New File...**, **New Folder...**, reveal, optional
  Images Preview, **Open in Integrated Terminal**, **Find in Folder...**,
  **Cut**, **Copy**, **Paste** when the WORKSPACE clipboard has items, path-copy
  actions, **Rename...**, and **Delete**. Workspace-root menus omit destructive
  file actions such as **Cut**, **Copy**, **Rename...**, and **Delete**, while
  keeping **Paste**, **Copy Path**, **Add Folder to Workspace...**, and
  **Remove Folder from Workspace**.
- **Copy**, **Cut**, and **Paste** use an extension-local resource clipboard that
  stores URIs rather than file contents. Paste copies with
  `vscode.workspace.fs.copy` and moves cut entries with `vscode.workspace.fs.rename`,
  detects conflicts, and never overwrites without confirmation.
- **Delete** moves files and folders to Trash through the active filesystem
  provider. If Trash is not supported, the extension reports the failure instead
  of silently performing permanent deletion.
- **Copy Path** copies `fsPath` for local `file:` resources and URI strings for
  remote or virtual resources. **Copy Relative Path** uses VS Code's workspace
  relative path handling.
- **Open in Integrated Terminal** uses the selected directory, workspace root, or
  file parent as the terminal working directory and preserves URI handling for
  remote-capable terminal providers.
- Mutating commands check `vscode.workspace.fs.isWritableFileSystem` first. A
  read-only filesystem is rejected safely; providers with unknown writability are
  attempted and reported with concise errors if they fail.

The extension intentionally does not reproduce Maven, Java-specific, Checkstyle,
or arbitrary third-party Explorer contributions. Standard file operations and
`SKILL.md`-specific operations are separated: ordinary file-management commands
appear at the top level of the WORKSPACE context menu, while validation,
template, report, description-improvement, and favorite actions for files named
exactly `SKILL.md` stay grouped at the bottom under the **SKILL.md Inspector**
submenu. Favorites, Installed Agents, and the bottom **SKILL.md Skills** analysis
Panel retain their existing behavior; Installed Agents remains read-only except
for opening and Inspector-specific actions.

## Diagnostic rules

Every diagnostic code — its default severity, which profiles it applies to, why it
exists, a bad/good example, and whether a quick fix is offered — is documented in
[docs/rules.md](docs/rules.md). Rules are grouped by kind, so **specification errors**
(an invalid file) are clearly separated from **quality recommendations**.

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
| `skillMdInspector.profile` | `generic` | Active profile: `generic` \| `vscode` \| `claude` \| `codex`. |
| `skillMdInspector.name.maxLength` | `64` | Maximum allowed `name` length. |
| `skillMdInspector.description.minLength` | `40` | Minimum recommended `description` length. |
| `skillMdInspector.description.maxLength` | `1024` | Maximum allowed `description` length. |
| `skillMdInspector.description.language` | `auto` | `en` forces English heuristics; `auto` marks a non-English description language-limited. |
| `skillMdInspector.body.strictness` | `recommended` | Advisory body-section severity: `off` \| `recommended` (information) \| `strict` (warning). |
| `skillMdInspector.resources.exclude` | `node_modules`, `.git`, `dist`, `out` | Globs excluded from resource discovery (replaces the defaults). |
| `skillMdInspector.discovery.exclude` | above + `.vscode-test` | Globs of directories skipped when discovering `SKILL.md` files (replaces the defaults). |
| `skillMdInspector.names.similarityThreshold` | `0.8` | Similarity (0–1) at/above which two different skill names are flagged as confusingly similar. |
| `skillMdInspector.collision.threshold` | `0.4` | Composite similarity (0–1) at/above which two skills are reported as a potential collision. |
| `skillMdInspector.collision.ngramSize` | `3` | Character n-gram size for the collision character-similarity metric. |
| `skillMdInspector.collision.boundarySeparationWeight` | `0.5` | How strongly mutually-exclusive boundaries reduce the composite collision score (0–1). |
| `skillMdInspector.collision.weights` | `0.3/0.3/0.2/0.2` | Relative weights (jaccard/cosine/charNgram/name) blended into the composite score; normalized at runtime. |
| `skillMdInspector.severityOverrides` | `{}` | Override a diagnostic's severity by code, or `"off"` to disable it. |
| `skillMdInspector.severity.allowSpecificationOverrides` | `false` | Allow the overrides above to downgrade or disable specification-level errors. |
| `skillMdInspector.experimental.llmReview.enabled` | `false` | Reserved for future LLM review (inert). |
| `skillMdInspector.navigator.additionalRoots` | `[]` | Extra bounded local roots to display after built-in agents in INSTALLED AGENTS. |

Example additional root configuration:

```json
{
  "skillMdInspector.navigator.additionalRoots": [
    {
      "id": "custom-agent",
      "label": "Custom Agent",
      "path": "~/.custom-agent",
      "files": ["SKILL.md", "AGENTS.md"],
      "recursive": true
    }
  ]
}
```

Additional root paths support `~` and `${env:VARIABLE_NAME}` expansion. Malformed
entries are ignored with a concise warning, missing or unreadable directories are
skipped, and scans are bounded by result and depth limits.

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

## Context menus and templates

SKILL.md Inspector adds a grouped **SKILL.md Inspector** submenu when you right-click an exact `SKILL.md` resource. The submenu appears in **FAVORITES**, **WORKSPACE**, and **INSTALLED AGENTS** for existing `SKILL.md` items, and in an open `SKILL.md` editor or the built-in Explorer only while the **SKILL.md INSPECTOR** Activity Bar container is active. Favorite state controls whether Inspector View items show **Add SKILL.md to Favorites** or **Remove from Favorites**; missing Favorites and `AGENTS.md` do not receive the submenu. The submenu groups validation, editing, reports, maintenance, and template-management commands while keeping the same Command Palette entries.

### Inserting bundled templates

Use **SKILL.md Inspector: Insert SKILL.md Template** from the Command Palette, the editor context submenu, or the Explorer context submenu. When invoked from Explorer, the command targets the selected `SKILL.md`; when invoked from the Command Palette, it falls back to the active editor.

Bundled templates are generic editing presets and are independent from validation profiles:

- **Minimal** — compact required frontmatter and a short body.
- **Standard** — balanced starter content converted from the original built-in template.
- **Detailed** — expanded scope, resources, examples, and constraints.
- **Workflow-oriented** — step-by-step procedure layout.

The command can insert into a new or empty `SKILL.md` at the start of the file. In an existing `SKILL.md`, it inserts at the active cursor position and does not replace existing content or merge frontmatter automatically. If multiple valid templates are available, a Quick Pick lets you choose one in configured order; cancelling the picker makes no edit.

### Custom templates

Configure `skillMdInspector.templates` in User, Workspace, or Workspace Folder settings. An unset or empty array uses the bundled templates. A non-empty array replaces the bundled catalog; bundled and custom templates are not merged. Template settings do not depend on `skillMdInspector.profile`, and changing validation profiles does not change available templates.

Templates use line arrays instead of escaped `\n` strings. `frontmatter` contains YAML lines without `---` delimiters, and `body` contains Markdown lines. Empty strings represent blank lines. Frontmatter delimiters and one blank line before the body are generated automatically. The placeholders `{{name}}` and `{{title}}` are replaced throughout frontmatter and body; unknown placeholders are left unchanged. `{{name}}` is inferred from the parent folder as kebab-case, and `{{title}}` is a readable title derived from that name.

Open **SKILL.md Inspector: Open Template Settings** to focus the setting in VS Code Settings. Use **SKILL.md Inspector: Reset Templates to Defaults** to remove an explicit User, Workspace, or Workspace Folder override and return to bundled templates. Resetting removes the setting; it does not copy bundled templates into `settings.json`.

Complete `settings.json` example:

```json
{
  "skillMdInspector.templates": [
    {
      "id": "workflow",
      "label": "Workflow",
      "description": "A template for step-based skills.",
      "frontmatter": [
        "name: {{name}}",
        "description: <Describe the task, usage trigger, and expected result.>",
        "metadata:",
        "  category: <category>"
      ],
      "body": [
        "# {{title}}",
        "",
        "## When to use",
        "",
        "<Describe when this skill should be used.>",
        "",
        "## Workflow",
        "",
        "1. <First step>",
        "2. <Second step>",
        "3. <Third step>",
        "",
        "## Inputs",
        "",
        "- <Input>",
        "",
        "## Outputs",
        "",
        "- <Output>",
        "",
        "## Constraints",
        "",
        "- <Constraint>"
      ]
    }
  ]
}
```
