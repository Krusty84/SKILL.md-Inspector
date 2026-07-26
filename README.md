# SKILL.md Inspector

SKILL.md Inspector is a Visual Studio Code extension for authoring and reviewing
Agent Skills. It validates every file named exactly `SKILL.md`, explains problems in
the editor, evaluates description and instruction quality, and analyzes collections
of skills for collisions.

Core analysis is local and deterministic. The extension does not call an LLM, run
agent executables, or send telemetry. Optional remote-link availability checking is
disabled by default and is the only validation feature that sends network requests.

## Features

- **Validate skills as you edit** — check YAML frontmatter, names, descriptions,
  Markdown links, bundled resources, and body structure.
- **Check remote links when explicitly enabled** — augment full validation with
  SSRF-protected HTTP availability checks while keeping typing and core analysis offline.
- **Fix common problems quickly** — insert required fields or a complete template,
  convert names to kebab-case, add trigger and boundary clauses, create missing
  linked files, and reference untracked resources.
- **Review separate quality signals** — inspect description completeness, authoring
  hygiene for instructions and bundled resources, validation status, and heuristic
  coverage without combining them into a misleading aggregate score.
- **Measure packaged context offline** — view exact `o200k_base` token and line
  metrics for the `SKILL.md` body, reference files, and other text files, with
  validation diagnostics when the body budget or advisory resource thresholds
  are exceeded.
- **Analyze a workspace** — discover skills, detect duplicate or similar names,
  compare overlapping descriptions, inspect resource graphs, and export a
  machine-readable `skills.index.json`.
- **Navigate skill ecosystems** — browse workspace files, keep persistent favorites,
  and discover supported local Codex, Claude Code, OpenCode, and GitHub Copilot files.
- **Inspect OpenCode exports** — browse exported session JSON, view a searchable tool
  timeline, inspect compatibility diagnostics, and correlate recorded `skill` calls
  with local skills by name.
- **Customize policy without code changes** — adjust advisory severity, replace
  resource directories and exclusion globs, define custom templates, and tune the
  heuristic dictionaries used by description and collision analysis.

Description completeness is a transparent text heuristic, not a prediction that an
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
| **Show Workspace Report**     | Review name conflicts, description collisions, and resources.              |
| **Export Skills Index**       | Write schema-version-6 `skills.index.json` to the first workspace root.    |
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

## Diagnostic classification

Every diagnostic is classified as **specification**, **compatibility**, **security**,
or **quality**. The complete code catalog, rationale, examples, and available fixes
are documented in [docs/rules.md](docs/rules.md).

## Configuration

Open VS Code Settings and search for `SKILL.md Inspector`. Common settings include:

| Setting                                  | Default                                        | Purpose                                                        |
| ---------------------------------------- | ---------------------------------------------- | -------------------------------------------------------------- |
| `skillMdInspector.validation.enabled`    | `true`                                         | Enable editor validation.                                      |
| `skillMdInspector.validation.runOnSave`  | `true`                                         | Run full validation on save.                                   |
| `skillMdInspector.links.onlineCheck.enabled` | `false`                                    | Send HTTP requests during full validation to check referenced URLs. |
| `skillMdInspector.links.onlineCheck.maxConcurrency` | `4`                                   | Limit concurrent checks across one complete validation operation (1–10). |
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
- **Description completeness** counts how many of 7 structural conventions the
  description satisfies: a capability verb, a usage trigger, a concrete artifact, a
  boundary, front-loaded intent, low vagueness, and useful length. It measures
  convention coverage, not how useful the wording is: the check is deterministic
  and does not guarantee that an agent will select the skill at runtime. Wording
  outside the configured dictionaries earns partial credit when it is shaped like
  a capability or artifact, with a quick fix to register the word. Internally, and
  in the exported index, the field is still named `staticDescriptionQuality`.
- **Authoring hygiene** counts structural defects, reported separately for the
  Markdown body (an empty body, placeholders, weak example evidence, empty or
  duplicate sections, excessive length, repetition, unclosed code fences) and for
  bundled resources (unreferenced files, undocumented scripts, unusually large
  files). It does **not** assess whether the instructions are correct, complete, or
  safe: a tidy body of harmful or meaningless instructions scores `clean`. Labels
  are `clean` (no findings at all), `minor-issues`, `issues`, and `defects`.
  Internally the field is still named `authoringQuality`.
- **Collision risk** compares descriptions and names across the workspace. Pair
  similarities are computed against the whole scanned corpus (TF-IDF document
  frequencies), so adding or removing unrelated skills can shift a pair's score
  by a few hundredths. A pair marked `text coverage: low` had fewer than 3
  comparable content tokens — typically a non-Latin script the text metrics cannot
  read — so its similarity comes mostly from the skill names.

When required input is missing or cannot be trusted, description completeness or
instruction hygiene is shown as **Not scored** instead of silently assigning zero.
Resource hygiene remains independent when resource discovery succeeds.

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
| `npm run benchmark:static`             | Run the curated description-completeness benchmark.                |
| `npm run check:heuristic-dictionaries` | Verify dictionary defaults match the extension manifest.           |
| `npm run sync:heuristic-dictionaries`  | Synchronize manifest defaults after catalog changes.               |

The production build creates a CommonJS extension-host bundle and a separate browser
bundle for the OpenCode report. For contributor-oriented component boundaries, data
flows, and constraints, see [ARCHITECTURE.md](ARCHITECTURE.md). Release history is in
[CHANGELOG.md](CHANGELOG.md).

## Privacy and limitations

- Core analysis, validation while typing, code actions, and OpenCode skill matching
  are offline. Remote links still receive the static
  `skill.link.remoteSuspicious` diagnostic whether online checking is enabled or not.
- Enabling `skillMdInspector.links.onlineCheck.enabled` sends `HEAD` requests, and
  minimal range `GET` requests when required, to HTTP(S) URLs referenced by
  `SKILL.md`. Those servers can observe the request, source IP address, timing, and
  user-agent. Redirect destinations are also contacted after validation.
- Online checks accept `2xx` and `403`, follow at most five safe redirects, use an
  approximately ten-second per-request timeout, and report network/DNS/TLS failures
  as indeterminate rather than definitely broken. Availability at check time does
  not guarantee future availability or safe content.
- The checker rejects credentials, local-only hosts, non-public IP addresses,
  mixed public/private DNS answers, HTTPS-to-HTTP redirects, and unsafe redirect
  targets. It connects directly to a validated address and does not use ambient
  proxy configuration; restrictive networks may therefore produce check failures.
- Token and line metrics, including the fixed content-budget diagnostics, are
  measured with the open `o200k_base` encoding as a deterministic offline proxy.
  Claude's production tokenizer is not `o200k_base`, so counts near a budget
  threshold can differ by roughly ±10–20%; read budget thresholds with that
  tolerance rather than as exact production counts.
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
