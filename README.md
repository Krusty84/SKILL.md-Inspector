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
- **`description` rules** — required, string, ≤ 1024 chars; a missing action
  verb is an error, while descriptions that are too short, vague, or missing a
  usage-trigger clause produce quality warnings.
- **Profile-specific metadata rules** — for the selected profile, flags Claude
  reserved words and XML-like tags, checks VS Code / Codex field types, and
  applies an unknown-key policy.
- **Heuristic Static Description Quality Score (0–100)** — a *deterministic heuristic* for
  each `description` across seven weighted criteria (action verb, usage trigger,
  concrete artifact, boundary, front-loaded intent, low vagueness, good length),
  with a transparent additive `rawScore` and an explicit adjusted score for essential
  completeness. Every applied score ceiling and its reason is reported; the public label
  comes from the adjusted score. The result also includes a **heuristic coverage** level
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
- **Skill Report** — a read-only webview that keeps validation status, diagnostic
  counts, Static Description Quality, instruction authoring quality, resource
  authoring quality, and referenced/unreferenced files as separate signals.
- **Activity Bar navigator** — a dedicated **SKILL.md INSPECTOR** icon opens three independent Views: **FAVORITES**, **WORKSPACE**, and **INSTALLED AGENTS**.
- **Favorites** — add frequently inspected `SKILL.md` files from the Inspector submenu in the editor, Explorer, or Inspector Views. Favorites persist locally across restarts and workspace changes; missing files stay visible with a warning until removed.
- **Skills analysis Panel** — the existing **SKILL.md Skills** analysis view remains
  separate in the bottom Panel. Each skill shows tri-state validation, adjusted
  Static Description Quality and heuristic coverage, instruction authoring quality,
  diagnostic counts, format/portability compatibility, and its resource graph.
- **Skill collision detection** — finds skills whose descriptions overlap using a
  composite of smoothed TF-IDF cosine, token Jaccard, character n-gram, and name
  similarity, with High/Medium/Low risk bands and a separate **confidence** in the
  textual evidence, shown in a collision matrix (skill A, skill B, similarity,
  shared terms, risk, confidence, recommendation).
- **Format / portability compatibility** — shows per-skill compatibility
  (✓ / ⚠ / ✗) across the `generic`, `vscode`, `claude`, and `codex` profiles.
  This is a profile-format compatibility check; a pass does not include or imply
  good general description or instruction-body quality.
- **Resource graph** — per skill, classifies linked/bundled files as referenced,
  unreferenced, missing, remote, or absolute, and flags scripts, binaries, and
  large files.
- **Export Skills Index** — writes schema-version-3 `skills.index.json` entries with
  tri-state validation, complete Static Description Quality data (raw/adjusted
  scores, label, coverage, limitations, findings, and grade-limit adjustments),
  instruction/resource authoring quality, all diagnostic counts, profile
  compatibility, and the existing per-diagnostic code/severity/kind summary.
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
  VS Code or other extensions. When no folder is open, the welcome action and the
  first toolbar button provide **Select SKILLs Folder**. The toolbar also provides
  **New File**, **New Folder**, **Refresh**, and VS Code's standard **Collapse
  All** action; the overflow menu retains the multi-select **Add Folder to
  Workspace...** command and **Open Folder in New Window...**.
- **INSTALLED AGENTS** — supported local agent files discovered from bounded,
  declared roots without running agent executables or scanning your full home
  directory. Installed file entries use the active VS Code file icon theme;
  favorite state changes their context actions, not their icons.

Because these are standard VS Code Views, **FAVORITES**, **WORKSPACE**, and
**INSTALLED AGENTS** can each be collapsed, expanded, resized vertically, hidden,
or restored from the standard Views menu independently.

Inspector-specific context actions are grouped under the **SKILL.md Inspector**
submenu for exact `SKILL.md` resources. **Add SKILL.md to Favorites** is no
longer contributed as a standalone top-level context-menu item; it appears in
that submenu for non-favorited `SKILL.md` files in **WORKSPACE** and
**INSTALLED AGENTS**. Already favorited `SKILL.md` entries in **FAVORITES**,
**WORKSPACE**, and **INSTALLED AGENTS** show **Remove from Favorites** instead.
Missing Favorites, `AGENTS.md`, `CLAUDE.md`, ordinary files, directories, workspace roots,
and agent group nodes do not receive the submenu. The submenu is shown in editor
and built-in Explorer context menus only while the **SKILL.md INSPECTOR**
Activity Bar container is active.

Built-in local agent locations are:

| Agent | Files shown | Paths |
| --- | --- | --- |
| Codex | Global instructions | `$CODEX_HOME/AGENTS.md` when `CODEX_HOME` is set, otherwise `~/.codex/AGENTS.md` |
| Codex | Codex home skills | `$CODEX_HOME/skills/**/SKILL.md` when `CODEX_HOME` is set, otherwise `~/.codex/skills/**/SKILL.md` |
| Codex | Compatible user skills | `~/.agents/skills/**/SKILL.md` |
| Codex | Admin skills | `/etc/codex/skills/**/SKILL.md` on non-Windows systems when readable |
| Claude Code | Global instructions | `~/.claude/CLAUDE.md` |
| Claude Code | Skills | `~/.claude/skills/**/SKILL.md` |
| OpenCode | Global instructions | `~/.config/opencode/AGENTS.md` |
| OpenCode | Skills | `~/.config/opencode/skills/**/SKILL.md` |
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
discovery for local `SKILL.md`, `AGENTS.md`, and `CLAUDE.md` files. **SKILL.md Skills** remains
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

- The View toolbar starts with **Select SKILLs Folder** and keeps the quick **New
  File**, **New Folder**, **Refresh**, and VS Code **Collapse All** actions. When
  there are no workspace folders, the same selection command is the normal
  welcome action. Context-menu creation entries use Explorer
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
| Show Skill Report | Open the read-only report (incl. Static Description Quality) for the active skill. |
| Improve Description Locally | Suggest a better `description` (no LLM) and optionally apply it. |
| Show Workspace Report | Open the workspace report: collision matrix, portability, resource graphs. |
| Export Skills Index | Write `skills.index.json` for the workspace. |
| Refresh Skills | Rescan the workspace and refresh the Skills tree view. |
| Open Heuristic Dictionary Settings | Open VS Code Settings filtered to all editable heuristic dictionaries. |

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
| `skillMdInspector.heuristics.dictionaryValues.*` | built-in catalog | Complete dictionaries for lexical heuristic policy. |

Example additional root configuration:

```json
{
  "skillMdInspector.navigator.additionalRoots": [
    {
      "id": "custom-agent",
      "label": "Custom Agent",
      "path": "~/.custom-agent",
      "files": ["SKILL.md", "AGENTS.md", "CLAUDE.md"],
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

- **MVP2 (done)** — a 0–100 Static Description Quality Score, front-loaded-intent and
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

Configure `skillMdInspector.templates` in User, Workspace, or Workspace Folder settings. You can paste the `skillMdInspector.templates` property into any of those settings scopes. An unset or empty array uses the bundled templates. **Warning:** a non-empty custom array replaces the bundled catalog; bundled and custom templates are not merged. Add multiple custom templates to the same array when you want more than one choice; they appear in the template picker in configured order. Template settings do not depend on `skillMdInspector.profile`, and changing validation profiles does not change available templates.

Templates use line arrays instead of escaped `\n` strings. `frontmatter` contains YAML lines without `---` delimiters, and `body` contains Markdown lines. Empty strings represent blank lines. Frontmatter delimiters and one blank line before the body are generated automatically. The placeholders `{{name}}` and `{{title}}` are replaced throughout frontmatter and body; unknown placeholders are left unchanged. `{{name}}` is inferred from the parent folder as kebab-case, and `{{title}}` is a readable title derived from that name.

Open **SKILL.md Inspector: Open Template Settings** from the Command Palette to focus the setting in VS Code Settings, then paste or edit the template array. Use **SKILL.md Inspector: Reset Templates to Defaults** to remove an explicit User, Workspace, or Workspace Folder override and return to bundled templates. Resetting removes the setting; it does not copy bundled templates into `settings.json`.

A complete quality-focused settings example is available at [`examples/custom-template.settings.json`](examples/custom-template.settings.json). The inline example below is compact for quick reference; the repository example is copy-paste-ready and demonstrates a fuller production-quality skill structure.

Compact `settings.json` example:

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

## OpenCode session reports

SKILL.md Inspector can inspect local OpenCode `session.json` exports without invoking OpenCode, executing recorded commands, downloading resources, or sending telemetry. Export a session with:

```bash
opencode export <sessionID> > my-session.opencode-session.json
```

Example workflow:

1. Open **SKILL.md Inspector** in the Activity Bar.
2. Find the **OPENCODE SESSIONS** view.
3. Optionally move the view with the view title context menu: **Move View** → **Secondary Side Bar**. VS Code exposes this as a user-controlled layout action; the extension does not directly contribute a custom Secondary Side Bar container.
4. Run **SKILL.md Inspector: Select OpenCode Sessions Folder** and choose the folder containing exported JSON files.
5. Select a discovered session. The compact **OpenCode Session Report** timeline opens in a single reusable webview panel.
6. Use the session context menu to open the report or raw JSON explicitly.

Selecting a sessions folder is optional for standalone exports. To open one JSON export directly, use the Command Palette:

* **SKILL.md Inspector: Open OpenCode Session Report** → select a session JSON file.
* **SKILL.md Inspector: Open Raw OpenCode Session JSON** → select a session JSON file.

### Session discovery

The OpenCode Sessions view scans the selected folder recursively by default and considers only `.json` files whose root object contains an object `info` field and an array `messages` field. Invalid or unrelated JSON files are ignored and concise diagnostics are written to the SKILL.md Inspector output channel. The selected folder is persisted in workspace state when a workspace is open and global state otherwise. URI-based reads use VS Code workspace file-system APIs so local and supported remote file systems can be used.

Discovery is bounded and configurable:

* `skillMdInspector.openCode.maxSessionFileSizeMb` (default `25`)
* `skillMdInspector.openCode.maxDiscoveredSessions` (default `1000`)
* `skillMdInspector.openCode.maxPreviewCharacters` (default `20000`)
* `skillMdInspector.openCode.scanRecursively` (default `true`)

Child sessions are nested under parent sessions when exported files in the selected folder include matching `info.parentID` metadata. Sessions are sorted by updated time with a filename fallback. The view watches JSON files in the configured folder and refreshes automatically when VS Code supports watching that location.

### OpenCode Session Report timeline

Use **SKILL.md Inspector: Open OpenCode Session Report** from a session tree item or the Command Palette to open a single-view chronological timeline. The existing **OpenCode Session Report** webview panel is reused when another session is opened, so session navigation from the **OPENCODE SESSIONS** tree replaces the current report instead of creating a separate details view.

The sticky report header summarizes the session title, session ID, agent, provider/model, OpenCode version, created/updated time, cost, deterministic token totals, cached share, duration, changed files, line additions/deletions, errors, and retries. Token totals are calculated as `inputTokens + outputTokens + reasoningTokens` when at least one component exists. Cached share is displayed only when `cacheReadTokens / (inputTokens + cacheReadTokens)` has a non-zero denominator and is labeled as a cached share rather than an official upstream cache-hit metric. Invalid, missing, negative, `NaN`, or infinite metric values are omitted.

Below the header, filter chips show counts for **All**, **Tools**, **Skills**, **Reasoning**, **Errors**, **Diffs**, **Text**, and **Subtasks**. **Tools** includes every tool invocation, including skill calls, while **Skills** narrows the timeline to skill calls only; these counts intentionally overlap. Filtering never mutates the underlying session model. The search box is debounced, combines with the active filter, searches normalized labels, tools, skills, statuses, previews, file paths, errors, subtasks, agent names, and call IDs, and highlights matches as text nodes. **Expand all** and **Collapse all** apply only to currently visible timeline events. Keyboard users can focus search with Ctrl/Cmd+F, clear it with Escape, toggle expandable events with Enter/Space, and move between visible event headers with Arrow Up/Down.

The timeline is not a causal graph. Events remain ordered by the exported source sequence. Timestamps provide elapsed time and duration only. The elapsed-time column and rail show user messages, assistant responses, reasoning, tools, tool errors, retries, patches/diffs, subtasks/agents, compactions, and unknown future parts with distinct glyphs and labels. Long labels truncate within the event column, code and JSON previews scroll horizontally inside the row, and the layout adapts for narrow panels without hiding critical information.

Expandable rows reveal details inline in the row that owns them. Tool and skill rows show bounded input, output, errors, metadata, attachments, call IDs, status, and temporal skill information; failed tools use readable structured error summaries rather than raw object strings. Reasoning starts collapsed, errors may start expanded, user/assistant text remains readable without expansion, patch rows show affected files and addition/deletion summaries with escaped bounded patch previews, subtasks show agent/model/command/child-session information when present, and compactions render as timeline markers. The report includes latency bars normalized against the session's 95th percentile event duration; exact duration text remains authoritative.

The session-title chevron expands an inline section in the same webview containing the compatibility summary, reconstructed schema source commit, session metadata, change summary, diagnostics, sanitization warnings, loaded skills, and matching `SKILL.md` status. Actions observed after a skill load are temporal observations and do not prove that a SKILL.md rule caused an action.

The initial webview payload intentionally excludes raw tool inputs, full outputs, patches, snapshots, metadata, and attachments. These details are loaded lazily when an event is expanded and are bounded by `skillMdInspector.openCode.maxPreviewCharacters`; “show all” style output still means the complete value only up to that configured hard limit, never an unbounded multi-megabyte payload. Embedded URLs, file URLs, and attachment URLs are displayed as text only and are not opened or linked. All report assets are local extension files, the Content Security Policy is restrictive, webview messages are validated by the extension host, and recorded commands are never executed.

### Tolerant parser policy and supported concepts

OpenCode exports are treated as an evolving internal format. The parser requires only a root object with object `info` and array `messages`; unknown message roles, part types, tool names, fields, and tool status strings are retained and displayed rather than causing import failure. Unknown future fields are retained through raw references so the raw JSON remains available for complete inspection. Known concepts include user and assistant messages, text, reasoning, files, tools, skill tool calls, step boundaries, snapshots, patches, agents, retries, and compactions. Source array order is authoritative; timestamps are used only for durations and relative positioning when valid. Large values are truncated according to `skillMdInspector.openCode.maxPreviewCharacters`.


### Reconstructed schema compatibility diagnostics

The extension includes a reconstructed pinned compatibility reference for OpenCode session exports based on OpenCode source commit `17544802c38a4d35834275526ccf38be1cdcfbf4`. Runtime parsing remains tolerant: schema compatibility diagnostics are non-fatal observations, not a strict import gate. The compatibility layer checks schema-required fields, canonical ID prefixes, duplicate message/part/tool-call IDs, and cross-object references such as message `sessionID`, part `sessionID`, part `messageID`, and assistant `parentID`. Schema compatibility diagnostics indicate differences from a reconstructed schema pinned to a specific OpenCode source commit. They are not proof of conformance to an official stable OpenCode export standard.

Likely sanitized exports are detected through redaction markers such as `[redacted:` and `{ "redacted": "..." }`. Sanitized sessions remain inspectable, but reports warn that detailed trajectory analysis may be incomplete.

### SKILL.md matching and temporal evidence

When an OpenCode `skill` tool call includes `state.input.name`, the extension attempts to match it to discovered local `SKILL.md` files in supported workspace skill roots. Exact normalized frontmatter `name` matches are preferred. Reports distinguish no match, one match, and multiple ambiguous matches.

Actions listed after a skill load are **temporal observations** within a heuristic segment: from that skill call until the next skill call in the same assistant message or the end of that assistant message. The extension does **not** claim that a skill caused a command, edit, file read, or rule compliance unless a future OpenCode evidence format explicitly records that relationship.

### Privacy, offline behavior, and limitations

All OpenCode inspection is local and deterministic. The extension does not execute recorded commands, does not invoke OpenCode, does not open URLs embedded in session data, and does not send telemetry. Large values are previewed with truncation markers. Known limitations: OpenCode has no separately versioned public export standard, some remote URI schemes may not support file watching or OS reveal actions, and temporal skill segments are evidence of ordering only—not causal attribution or proof of SKILL.md rule compliance.

## Evaluation terminology and migration

`Trigger Quality Score` has been renamed to **Static Description Quality Score**. Its `coverage` value describes the applicability and completeness of deterministic checks (language and available text), not probability, certainty, or agent agreement. The score is static and does **not** measure actual skill selection. Behavioral trigger precision, recall, specificity, F1, and stability are calculated separately from recorded provider decisions; they never affect validation or the static score. Run `npm run benchmark:static` for the curated offline corpus and `npm run test:eval` for metric tests.

## Configurable heuristic dictionaries and resources

Run **SKILL.md Inspector: Open Heuristic Dictionary Settings** to see and edit every built-in lexical dictionary in the normal VS Code Settings UI. Each `skillMdInspector.heuristics.dictionaryValues.*` setting contains its complete effective base list or map, so **Reset Setting** restores the canonical extension default. Use User settings for organization-wide policy on the current machine, or Workspace/resource settings when a repository needs its own vocabulary. No window reload is required.

The editable dictionaries are:

| Dictionary suffix | Analysis affected |
| --- | --- |
| `actionVerbs` | Blocking action-capability diagnostics, Static Description Quality, improvement, and collision capabilities. |
| `actionVerbForms` | Explicit base-verb surface forms, including irregular past/participle forms. |
| `vagueTerms` | Vague-description diagnostics and the low-vagueness score. |
| `artifactHints` | High-signal artifacts/domains, adjusted score, and collision features. |
| `lowSignalArtifactTerms` | Generic artifacts that require supporting domain evidence. |
| `multiWordArtifacts` | Multi-word artifact/domain recognition. |
| `artifactSupportTerms` | Terms that make low-signal artifacts concrete. |
| `acronyms` | Known acronym/technology artifact evidence. |
| `uppercaseOnlyAcronyms` | Ambiguous acronyms that count only when spelled in uppercase. |
| `positiveTriggerPhrases` | Positive usage-trigger markers. |
| `negativeBoundaryPhrases` | Negative boundaries and collision-scope separation. |
| `exclusiveTriggerPhrases` | Markers that count as both a trigger and a boundary. |
| `restrictiveBoundaryPhrases` | Non-negative scope restrictions and boundary score. |
| `frontLoadedFillerTerms` | Words ignored while assessing a concrete front-loaded object. |
| `scopeStopwords` | Words ignored in trigger/boundary clause content. |
| `scopeVagueTerms` | Words that make trigger/boundary scope content too vague. |
| `irregularSingularForms` | Base-to-plural mappings used for artifact and collision normalization. |
| `collisionStopwords` | Common words removed from workspace collision similarity. |

Resolution is deterministic: each effective `dictionaryValues.*` setting is the complete value for that dictionary, and omitted dictionaries use the canonical catalog default.

List entries are trimmed and lowercased; empty entries are removed and duplicates are de-duplicated in stable order. Mapping keys and forms receive the same normalization. Invalid runtime values are ignored while valid entries remain active; if a complete value has the wrong type, that dictionary falls back to its built-in default. Details are written to the **SKILL.md Inspector** output channel, with at most one concise notification for an unchanged invalid state.

Explicit `actionVerbForms` take precedence over generated regular morphology. A base verb with no explicit mapping still receives regular forms. Removing a base from `actionVerbs` also removes all of its configured forms from analysis.

For example, configure explicit action-verb forms as a complete mapping:

```jsonc
{
  "skillMdInspector.heuristics.dictionaryValues.actionVerbForms": {
    "write": ["write", "writes", "writing", "wrote", "written"],
    "teach": ["teach", "teaches", "teaching", "taught"]
  }
}
```

Changing lexical policy can change validation errors, raw/adjusted Static Description Quality, and workspace collision results immediately.

`skillMdInspector.resources.directories` **replaces** the default monitored directories. Only files beneath these relative paths receive unreferenced-resource warnings; root files such as `README.md` and `LICENSE` remain discoverable but are not treated as forgotten bundled resources. Absolute paths and paths containing `..` are ignored.
