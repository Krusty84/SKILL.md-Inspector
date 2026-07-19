# SKILL.md Inspector

SKILL.md Inspector is a Visual Studio Code extension for authoring and reviewing
Agent Skills. It validates every file named exactly `SKILL.md`, explains problems in
the editor, evaluates description and instruction quality, and analyzes collections
of skills for collisions and portability issues.

All analysis is local and deterministic. The extension does not call an LLM, fetch
links, run agent executables, send telemetry, or require network access at runtime.

## Features

- **Validate skills as you edit** — check YAML frontmatter, names, descriptions,
  Markdown links, bundled resources, body structure, and profile-specific metadata.
- **Fix common problems quickly** — insert required fields or a complete template,
  convert names to kebab-case, add trigger and boundary clauses, create missing
  linked files, and reference untracked resources.
- **Review separate quality signals** — inspect Static Description Quality,
  instruction authoring quality, resource authoring quality, validation status, and
  heuristic coverage without combining them into a misleading aggregate score.
- **Analyze a workspace** — discover skills, detect duplicate or similar names,
  compare overlapping descriptions, check format compatibility across four profiles,
  inspect resource graphs, and export a machine-readable `skills.index.json`.
- **Navigate skill ecosystems** — browse workspace files, keep persistent favorites,
  and discover supported local Codex, Claude Code, OpenCode, and GitHub Copilot files.
- **Inspect OpenCode exports** — browse exported session JSON, view a searchable tool
  timeline, inspect compatibility diagnostics, and correlate recorded `skill` calls
  with local skills by name.
- **Customize policy without code changes** — select a validation profile, adjust
  advisory severity, replace resource directories and exclusion globs, define custom
  templates, and tune the heuristic dictionaries used by description and collision
  analysis.

Static Description Quality is a transparent text heuristic, not a prediction that an
agent will select a skill. OpenCode skill matches and subsequent tool calls show
temporal proximity, not causation or instruction compliance.

## Run from source

Opening this repository normally does not activate its extension commands. Start an
Extension Development Host instead:

1. Run `npm install`.
2. Open the repository in VS Code.
3. Press **F5**, or choose **Run and Debug → Run Extension**.
4. In the new **Extension Development Host** window, open a folder containing a
   `SKILL.md` file.

The launch configuration builds the extension before starting the development host.
Open a sample under `fixtures/skills/` to see diagnostics and quick fixes immediately.

## Install a local VSIX

```bash
npm install
npx @vscode/vsce package
```

Then run **Extensions: Install from VSIX…** in VS Code, select the generated
`skill-md-inspector-0.3.0.vsix`, and reload the window.

## Use the extension

### Edit one skill

Open a file named exactly `SKILL.md`. Diagnostics appear in the editor and Problems
panel. Use the lightbulb menu for available fixes, or open the Command Palette and
run one of these commands:

| Command                                             | Purpose                                             |
| --------------------------------------------------- | --------------------------------------------------- |
| **SKILL.md Inspector: Validate Current Skill**      | Run complete validation for the active skill.       |
| **SKILL.md Inspector: Insert SKILL.md Template**    | Insert one of the bundled or configured templates.  |
| **SKILL.md Inspector: Improve Description Locally** | Add missing scope language without using an LLM.    |
| **SKILL.md Inspector: Show Skill Report**           | Review diagnostics, quality signals, and resources. |

The bundled templates are **Minimal**, **Standard**, **Detailed**, and
**Workflow-oriented**. A non-empty `skillMdInspector.templates` setting replaces
that catalog with custom templates.

### Analyze a workspace

Use the **SKILL.md Skills** panel for a compact analysis tree, or run:

| Command                       | Purpose                                                                    |
| ----------------------------- | -------------------------------------------------------------------------- |
| **Validate Workspace Skills** | Validate every discovered `SKILL.md` and publish results to Problems.      |
| **Show Workspace Report**     | Review name conflicts, description collisions, portability, and resources. |
| **Export Skills Index**       | Write schema-version-4 `skills.index.json` to the first workspace root.    |
| **Refresh Skills**            | Rebuild the cached Skills panel analysis.                                  |

Workspace report generation and index export can be cancelled. They analyze saved
files under the first open workspace folder; live diagnostics and the single-skill
report can include unsaved editor text.

### Navigate files and installed agents

Select **SKILL.md INSPECTOR** in the Activity Bar. Its independent views are:

- **FAVORITES** — persistent shortcuts to frequently used `SKILL.md` files;
- **WORKSPACE** — a lazy, multi-root file browser with common create, rename, copy,
  compare, search, terminal, and Trash operations;
- **INSTALLED AGENTS** — bounded discovery of supported local `SKILL.md`, `AGENTS.md`,
  and `CLAUDE.md` locations;
- **OPENCODE SESSIONS** — local exported-session discovery and reporting.

The Installed Agents view checks declared locations such as `~/.codex/skills`,
`~/.agents/skills`, `~/.claude/skills`, `~/.config/opencode/skills`, and
`~/.copilot/skills`. It does not scan the entire home directory or run an agent to
discover files. Additional local roots can be supplied with
`skillMdInspector.navigator.additionalRoots`.

### Inspect OpenCode sessions

In **OPENCODE SESSIONS**, choose a folder containing exported OpenCode session JSON.
The extension discovers compatible files, preserves parent/child relationships, and
opens an interactive report with filters, search, metrics, sanitization warnings,
and lazily loaded event details.

The importer is intentionally tolerant because the export shape is not a stable,
versioned public contract. Unknown fields are retained where possible, while a
reconstructed schema provides non-fatal compatibility diagnostics. Recorded commands
and links are displayed but never executed or fetched.

## Skill discovery

Any opened file named exactly `SKILL.md` can be validated. Workspace analysis also
discovers common layouts such as:

```text
.github/skills/<skill-name>/SKILL.md
.claude/skills/<skill-name>/SKILL.md
.agents/skills/<skill-name>/SKILL.md
.copilot/skills/<skill-name>/SKILL.md
skills/<skill-name>/SKILL.md
```

Dependency, VCS, and generated directories are excluded by default. Replace the
workspace discovery patterns with `skillMdInspector.discovery.exclude` when needed.

## Validation profiles

Set `skillMdInspector.profile` to one of:

| Profile   | Focus                                                              |
| --------- | ------------------------------------------------------------------ |
| `generic` | Baseline Agent Skill requirements and recommendations.             |
| `vscode`  | VS Code/Copilot metadata fields and input/output guidance.         |
| `claude`  | Claude metadata restrictions and boundary guidance.                |
| `codex`   | Codex metadata fields with stronger boundary and I/O expectations. |

Profiles are best-effort format checks maintained by this project. A portability pass
does not prove runtime behavior or instruction quality.

Every diagnostic is classified as **specification**, **compatibility**, **security**,
or **quality**. The complete code catalog, rationale, examples, and available fixes
are documented in [docs/rules.md](docs/rules.md).

## Configuration

Open VS Code Settings and search for `SKILL.md Inspector`. Common settings include:

| Setting                                  | Default                                        | Purpose                                                        |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `skillMdInspector.validation.enabled`    | `true`                                         | Enable editor validation.                                      |
| `skillMdInspector.validation.runOnSave`  | `true`                                         | Run full validation on save.                                   |
| `skillMdInspector.profile`               | `generic`                                      | Select the active format profile.                              |
| `skillMdInspector.description.language`  | `auto`                                         | Use English heuristics or detect limited non-English coverage. |
| `skillMdInspector.body.strictness`       | `recommended`                                  | Disable, inform, or warn on advisory body sections.            |
| `skillMdInspector.discovery.exclude`     | common generated directories                   | Replace workspace discovery exclusions.                        |
| `skillMdInspector.resources.directories` | `references`, `scripts`, `assets`, `templates` | Replace monitored resource directories.                        |
| `skillMdInspector.severityOverrides`     | `{}`                                           | Change or disable diagnostics by code.                         |
| `skillMdInspector.templates`             | `[]`                                           | Replace bundled templates with custom definitions.             |

Specification errors are protected from severity downgrades unless
`skillMdInspector.severity.allowSpecificationOverrides` is explicitly enabled.
Collision thresholds and weights, OpenCode discovery limits, resource exclusions,
name similarity, and all description heuristic dictionaries are also configurable.
See [examples/custom-template.settings.json](examples/custom-template.settings.json)
for a template example.

## How quality results work

The extension deliberately reports distinct signals:

- **Validation status** reflects emitted errors and warnings.
- **Static Description Quality** scores deterministic evidence such as an action,
  trigger, artifact, boundary, front-loaded intent, specificity, and useful length.
- **Instruction authoring quality** detects structural hygiene problems such as an
  empty body, placeholders, weak example evidence, empty or duplicate sections,
  excessive length, repetition, and unclosed code fences.
- **Resource authoring quality** identifies unreferenced files, undocumented scripts,
  and unusually large bundled resources.
- **Collision risk** compares descriptions and names across the workspace.
- **Profile compatibility** evaluates format constraints for each supported profile.

When required input is missing or cannot be trusted, description or instruction
quality is shown as **Not scored** instead of silently assigning zero. Resource
quality remains independent when resource discovery succeeds.

## Development

```bash
npm install
npm run check-types
npm run lint
npm test
npm run build
```

Additional commands:

| Command                                | Purpose                                                            |
| -------------------------------------- | ------------------------------------------------------------------ |
| `npm run watch`                        | Rebuild extension and OpenCode webview bundles during development. |
| `npm run test:eval`                    | Run the offline behavioral-evaluation tests.                       |
| `npm run benchmark:static`             | Run the curated Static Description Quality benchmark.              |
| `npm run check:heuristic-dictionaries` | Verify dictionary defaults match the extension manifest.           |
| `npm run sync:heuristic-dictionaries`  | Synchronize manifest defaults after catalog changes.               |

The production build creates a CommonJS extension-host bundle and a separate browser
bundle for the OpenCode report. For contributor-oriented component boundaries, data
flows, and constraints, see [ARCHITECTURE.md](ARCHITECTURE.md). Release history is in
[CHANGELOG.md](CHANGELOG.md).

## Privacy and limitations

- Analysis is offline; remote links are classified but not fetched.
- Workspace aggregate analysis currently uses only the first workspace folder.
- Full skill analysis depends partly on local Node filesystem APIs, so remote or
  virtual workspaces are not uniformly supported.
- Description and collision heuristics are primarily English/ASCII-oriented.
- The experimental LLM setting and provider interface are inert; assisted review is
  not implemented.
- OpenCode reports inspect exported JSON only and do not integrate with or control an
  OpenCode process.

## License

[MIT](LICENSE)
