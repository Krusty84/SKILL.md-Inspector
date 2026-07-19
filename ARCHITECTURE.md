# Architecture

## Overview

SKILL.md Inspector is a Visual Studio Code extension for authoring, validating, and
inspecting Agent Skill files. Its primary input is a file named exactly `SKILL.md`.
The extension provides live diagnostics and quick fixes, per-skill and workspace
reports, workspace and installed-agent navigation, template insertion, and local
OpenCode session inspection.

The extension is local and deterministic. It does not call remote services, send
telemetry, invoke an LLM, execute OpenCode exports, or fetch links found in skills
or session data. The experimental LLM setting and `src/llm/` interface are inert.

The codebase has two broad boundaries:

- host-independent TypeScript implements parsing, validation, static description
  quality, authoring checks, collision detection, portability, evaluation metrics,
  and most OpenCode normalization;
- VS Code adapters own documents, configuration, commands, diagnostics, persistence,
  filesystem URIs, tree views, output channels, and webview lifecycle.

The production build contains a CommonJS extension-host bundle and a separate
browser bundle for the interactive OpenCode timeline. The ordinary skill and
workspace reports are script-disabled webviews rendered entirely by the extension
host.

## Repository Structure

```text
.
+-- src/
|   +-- analysis/       # Single-skill pipeline and workspace-analysis adapter
|   +-- authoring/      # Structural instruction and resource authoring checks
|   +-- codeActions/    # Quick-fix translation and shared insertion templates
|   +-- commands/       # Skill, workspace-explorer, template, and OpenCode commands
|   +-- diagnostics/    # Diagnostic collection and VS Code range/severity mapping
|   +-- evaluation/     # Offline behavioral trigger-suite model, runner, and metrics
|   +-- llm/            # Inert provider seam; no runtime implementation
|   +-- navigator/      # Favorites, installed-agent discovery, and workspace browser
|   +-- opencode/       # Session discovery, tolerant parsing, normalization, and metrics
|   +-- parser/         # YAML/Markdown parsing, links, resources, globs, and cache
|   +-- profiles/       # Generic, VS Code, Claude, and Codex validation profiles
|   +-- quality/        # Static Description Quality heuristics and dictionaries
|   +-- templates/      # Built-in/custom template validation and rendering
|   +-- types/          # Shared skill, diagnostic, profile, and workspace models
|   +-- ui/             # Tree providers, report models/renderers, and webview hosts
|   +-- validation/     # Rule registry and validators
|   +-- webview/        # Browser-side OpenCode report state and rendering
|   +-- workspace/      # Skill discovery, collisions, portability, graphs, and export
|   +-- config.ts       # Resolves VS Code settings into analysis configuration
|   `-- extension.ts    # Activation, provider construction, events, and watchers
+-- test/               # Vitest unit, property, integration, and regression tests
+-- scripts/            # Explicit deterministic repository synchronization tools
+-- benchmarks/         # Curated Static Description Quality benchmark corpus
+-- evaluation/         # Example behavioral trigger suites
+-- fixtures/           # Sample skills, resources, and OpenCode exports
+-- examples/           # Copyable user-configuration examples
+-- docs/rules.md       # Diagnostic-code catalogue
+-- opencode-session-export.schema.json
|                       # Reconstructed OpenCode compatibility reference
+-- dist/               # Generated extension and OpenCode webview bundles
+-- esbuild.js           # Both production bundle definitions
+-- package.json         # Extension manifest, settings, views, menus, and scripts
+-- tsconfig.json        # Strict no-emit TypeScript configuration
`-- vitest.config.ts     # Node-based test discovery
```

`src/` is the implementation source of truth. Files under `dist/` are generated
and should not be edited directly.

## Main Runtime Components

### Extension Host Composition

`src/extension.ts` is the extension-host entry point. `activate` constructs and
registers:

- one `DiagnosticsProvider` and the Markdown code-action provider;
- the skill-analysis panel tree;
- the Activity Bar's Favorites, Workspace, Installed Agents, and OpenCode Sessions
  tree views;
- skill/report/template commands, workspace file-management commands, and OpenCode
  commands;
- file watchers and document/workspace/configuration event handlers;
- an output channel shared by navigator and OpenCode failures.

Live edits are debounced by 300 milliseconds. File and configuration events
invalidate the appropriate caches, refresh tree providers, and revalidate visible
skills. Registered VS Code disposables are attached to the extension context, and a
dedicated disposable clears pending validation timers during shutdown.

### Skill Parsing and Document Model

`parseSkillFile` creates the normalized `SkillDocument` consumed by validation,
reports, quick fixes, and workspace analysis. Parsing is split into focused stages:

- `parseFrontmatter` uses `yaml` with source positions to parse top-of-file YAML,
  retain top-level key ranges, and report malformed or duplicate fields;
- `parseMarkdownLinks` uses Unified/Remark and also recognizes bare resource paths;
- `parseMarkdownHeadings` records ATX and setext headings for body checks;
- `discoverResources` recursively inventories files below the skill directory,
  honoring exclusion globs and excluding the skill file itself;
- `withResources` marks inventory entries referenced by relative Markdown links or
  recognized bare paths.

Text parsing itself is filesystem-free. Full analysis begins synchronous Node
filesystem access when it discovers resources or verifies local link targets.

### Validation and Diagnostics

`analyzeSkill` is the single-skill pipeline:

1. parse the current text into a `SkillDocument`;
2. in `full` mode, attach discovered resources;
3. run the validation registry;
4. apply profile severity overrides and return deterministically sorted diagnostics.

`text-only` mode skips resource discovery and filesystem-dependent link checks. It
is used while typing and for lightweight OpenCode skill matching. `full` mode is
used on document open/save, explicit validation, reports, and workspace analysis.

The registry in `src/validation/ruleRegistry.ts` groups rules for frontmatter,
name, description, links, resources, body structure, and profile metadata. Every
result is a tool-neutral `SkillDiagnostic` classified as `specification`,
`compatibility`, `security`, or `quality`. Specification errors cannot be disabled
or downgraded unless the effective profile explicitly permits it.

`DiagnosticsProvider` adapts these results to VS Code diagnostics and owns a
`ResourceCache` keyed by skill directory. `SkillCodeActionProvider` reruns analysis
for the requested document range and translates diagnostic fix metadata into
`WorkspaceEdit` operations. Validation code does not directly mutate files.

### Profiles, Configuration, and Heuristics

`readConfig` resolves `skillMdInspector.*` settings for a URI. It combines one of
the `generic`, `vscode`, `claude`, or `codex` profiles with configured length
limits, body strictness, language mode, severity overrides, collision parameters,
resource directories/exclusions, and heuristic dictionary values.

Static Description Quality is a separate deterministic measure. The `quality/`
modules identify action verbs, trigger and boundary phrases, concrete artifacts,
acronyms, vague language, length, and intent placement. The result keeps the
additive raw score, the adjusted score and label after explicit grade-limit
adjustments, heuristic coverage, findings, and analysis limitations. It is not a
probability of runtime skill selection.

`src/quality/defaultHeuristicDictionaries.json` is the canonical lexical-policy
catalog. `dictionaries.ts` normalizes and deeply freezes effective
`heuristics.dictionaryValues.*` settings, using catalog defaults for omitted
dictionaries.
All description diagnostics, Static Description Quality, local improvement,
portability checks, verb/singular morphology, collision features, collision scoring,
and report pipelines receive that resolved context. Compatibility modules such as
`actionVerbs.ts` re-export catalog-derived defaults; they do not own copies.

List policy is normalized by trimming, lowercasing, removing empty/non-string values,
and stable de-duplication. Mapping keys and string-array values follow the same rules.
Malformed whole values fall back per dictionary, while valid siblings remain active.
Structured warnings flow back through `readConfig`; the extension writes details to
the shared output channel and suppresses repeated notifications for an unchanged
warning state.

### Reports and Authoring Quality

The per-skill report analyzes the active document text, so it can include unsaved
editor changes. `buildReportModel` combines validation counts, Static Description
Quality, referenced resources, and two additional structural authoring scores:
instruction quality and resource quality. These authoring scores detect obvious
hygiene problems such as empty instructions, placeholders, empty/duplicate
sections, oversized bodies, undocumented scripts, and large or unreferenced files.
They are not combined with description quality and do not judge instruction
correctness.

The workspace report presents saved-file analysis: tri-state validation, adjusted
description quality and coverage, instruction authoring quality, diagnostic counts,
duplicate/similar names, description collisions, format/portability compatibility,
and resource graphs. Format/portability compatibility covers profile-specific format
constraints and intentionally excludes general description and instruction-body
quality. Report-model and HTML-rendering functions are kept separate from their
reusable webview-panel hosts. Both skill-oriented report webviews disable scripts and
use restrictive content security policies.

### Workspace Analysis

`computeWorkspaceAnalysis` is the VS Code-facing entry point shared by the
skill-analysis tree, workspace report, and index export. It chooses the first open
workspace folder, resolves its configuration, discovers `SKILL.md` paths, and calls
the host-independent `analyzeWorkspace` function.

For each readable skill, workspace analysis records tri-state validation, diagnostic
counts and codes, the complete Static Description Quality result, separate instruction
and resource authoring results, per-profile portability, and a resource graph. It then
compares the corpus for:

- exact normalized name conflicts;
- confusingly similar names;
- lexical description collisions using token Jaccard, smoothed TF-IDF cosine,
  character n-grams, and name similarity, reduced by explicit boundary separation.

Collision output includes the contributing metrics, shared terms, a risk band, and
confidence in the available textual evidence. Portability reruns only the relevant
format/profile checks against every profile and produces `pass`, `warning`, or `fail`
status; it is not an aggregate quality grade. The resource graph classifies referenced,
unreferenced, missing, remote, and absolute targets and flags scripts, binaries, and
large files.

`buildSkillsIndex` projects this analysis into schema version 3. Each entry retains
diagnostics and profile compatibility while adding validation status, all diagnostic
counts, the complete description-quality result, and instruction/resource authoring
quality. The builder adds a generation timestamp before `exportSkillsIndex` writes
`skills.index.json` at the workspace root.

### Navigation and Workspace File Operations

Navigation is intentionally separate from workspace-wide skill analysis:

- Favorites stores ordered `SKILL.md` URI strings in VS Code global state. Missing
  local favorites remain visible until removed.
- Workspace is a lazy, multi-root, URI-based file browser. `WorkspaceExplorer`
  reads one directory at a time with `vscode.workspace.fs`, caches children, honors
  enabled `files.exclude` patterns, and watches each workspace root.
- Installed Agents scans only declared built-in and user-configured local roots for
  supported `SKILL.md`, `AGENTS.md`, and `CLAUDE.md` files. Discovery follows bounded
  depth/result limits, resolves real paths, avoids traversal cycles, and does not
  invoke agent executables.
- The separate Skills panel lazily caches the first-folder `WorkspaceAnalysis` for
  diagnostic, collision, portability, and resource inspection.

Workspace commands use public VS Code APIs for creation, rename, copy/cut/paste,
trash deletion, terminals, workspace-folder changes, and optional built-in commands.
They validate relative paths, reject traversal, check known read-only providers, and
do not overwrite paste conflicts without confirmation. The clipboard stores URIs,
not file contents.

### Templates

`src/templates/` defines four bundled templates and the custom-template pipeline.
An empty setting selects the built-ins; a non-empty valid array replaces them. If
all configured entries are invalid, resolution falls back to the bundled catalog and
reports the configuration issue.

Templates are represented as frontmatter and body line arrays. Rendering inserts
YAML delimiters, infers a kebab-case name from the parent directory, derives a title,
and expands `{{name}}` and `{{title}}`. Insertion is deliberately text-oriented: it
fills an empty document or inserts at the current cursor without merging existing
frontmatter.

### OpenCode Session Inspection

The OpenCode subsystem reads exported JSON through `vscode.workspace.fs`. A selected
sessions-folder URI is persisted in workspace state when a workspace is open and in
global state otherwise. Discovery can recurse, is bounded by configured file-size and
result limits, ignores unrelated JSON, and nests exported child sessions by
`parentID` while guarding against cycles.

The import pipeline is:

1. require only an object root with object `info` and array `messages`;
2. retain known and unknown roles, part types, fields, and status values;
3. add non-fatal diagnostics against a reconstructed schema pinned to a specific
   OpenCode source commit;
4. detect likely sanitization/redaction markers;
5. normalize source-ordered messages and parts into trajectory nodes and metrics;
6. match `skill` tool calls by normalized name against local workspace skills;
7. build a bounded timeline view model.

The OpenCode report is the only script-enabled webview. The extension-host panel
sends a bounded initial model, validates incoming messages and event IDs, and serves
bounded event details lazily. Its browser bundle owns filtering, search, expansion,
and timeline presentation. A restrictive content security policy permits only local
extension assets; embedded URLs are displayed as text, and recorded commands are
never executed.

Skill-call segments describe temporal ordering only. A later tool call is not treated
as proof that a loaded skill caused or governed that action.

### Offline Evaluation Library

`src/evaluation/` is development/test infrastructure, not an extension command. It
parses behavioral trigger suites, asks an injected `TriggerProvider` for recorded
yes/no decisions, and computes confusion-matrix metrics plus repeated-run stability.
The repository currently supplies only a deterministic fake provider for tests. These
behavioral metrics remain separate from Static Description Quality and validation.

## Data Flow

### Live Editor Validation

1. VS Code opens, changes, or saves a document.
2. `extension.ts` accepts only an exact `SKILL.md` filename and resolves scoped
   configuration.
3. `DiagnosticsProvider` passes in-memory text to `analyzeSkill`: `text-only` after
   debounced edits and `full` on open/save or explicit commands.
4. Parsing and the rule registry return tool-neutral diagnostics.
5. The diagnostics adapter maps source offsets and severities into VS Code objects
   and replaces the document's collection entry.
6. On request, the code-action provider converts fix metadata into editor or
   filesystem edits.

### Workspace Report, Skills Tree, and Export

1. `computeWorkspaceAnalysis` selects the first workspace root and discovers saved
   skill files beneath it.
2. `analyzeWorkspace` runs full analysis per file and reports progress/cancellation
   between files.
3. Cross-skill name and description comparisons run after the per-skill records are
   built.
4. The resulting immutable-style `WorkspaceAnalysis` feeds the Skills tree or
   workspace report without recomputing or collapsing the per-skill quality dimensions.
5. Export projects the same validation, quality, diagnostics, and compatibility model
   into schema-version-3 `skills.index.json` and writes it through the VS Code
   filesystem API.

### Heuristic Configuration

1. VS Code contributes one resource-scoped visible setting for every catalog entry;
   list dictionaries use arrays and morphology dictionaries use keyed string arrays.
2. `readConfig` reads the effective User/Workspace/resource values for the requested
   URI.
3. The resolver normalizes those complete values and returns deeply frozen
   dictionaries plus structured warnings, using canonical defaults for omitted
   dictionaries.
4. Analysis callers pass the same resolved object through validation, scoring,
   improvement, portability, workspace analysis, and collision code.
5. A `skillMdInspector` configuration event clears resource caches, revalidates
   visible skills, and invalidates every analysis tree. Morphology caches are keyed
   by both the active base list and mapping object, so a new configuration cannot
   reuse forms from the previous registry.

### Navigator

1. Favorites restores persisted URI strings; Installed Agents discovers declared
   local roots; Workspace obtains the current VS Code workspace folders.
2. Each provider converts its own source model into tree items. The three navigator
   views do not depend on `WorkspaceAnalysis`.
3. Workspace directories are loaded lazily and cached by URI.
4. Watchers or explicit file commands invalidate affected parents and refresh only
   the relevant views where practical.

### OpenCode Report

1. The sessions tree discovers bounded JSON candidates below the persisted folder.
2. Opening a candidate rereads and parses the full bounded export.
3. Normalization constructs trajectory nodes, metrics, diagnostics, sanitization
   state, and local skill matches.
4. The extension host sends the lightweight timeline model to one reusable webview.
5. Expanding an event requests its bounded raw details by validated event ID.

## Key Design Decisions

- Validation and most analysis models do not import `vscode`, which keeps core rules
  reusable in Node tests and makes editor mutations an adapter concern.
- Diagnostics are the contract between validation and quick fixes. Rules describe
  problems and fix metadata; VS Code-facing code performs edits.
- Fast and complete analysis are explicit modes. Keystrokes avoid filesystem work;
  save/report paths use full discovery and link checks.
- Profile settings are resolved before validation, and diagnostic output is sorted to
  keep editor and test results stable.
- Editable lexical policy is data: words, phrases, explicit verb/plural forms, and
  collision stopwords live in the catalog and settings. Algorithmic behavior remains
  internal: regex construction, punctuation terminators, tokenization, regular
  morphology, score thresholds/weights, YAML structure, path/link security, and
  cache/performance constants are not dictionary settings.
- Static quality, authoring quality, collision risk, portability, and behavioral
  evaluation are separate signals. None is presented as runtime selection proof.
- The navigator and skill-analysis tree use different models because one is a
  multi-root file browser while the other is a first-root aggregate analysis.
- VS Code URI APIs are used where remote-provider support matters. Node filesystem
  APIs remain in the local skill-analysis and installed-agent paths.
- OpenCode parsing is tolerant because its export is not a separately versioned public
  standard. Compatibility diagnostics observe a pinned reconstructed schema without
  turning it into a strict import gate.
- Interactive webview data crosses a narrow message boundary: the initial payload and
  lazily requested details are bounded, and browser-provided identifiers are checked
  against extension-host state.

## External Dependencies and Integrations

Runtime dependencies are limited to:

- the VS Code Extension API for lifecycle, configuration, diagnostics, commands,
  persistence, filesystem URIs, tree views, editors, and webviews;
- Node `fs`, `path`, and `os` APIs for local discovery and path handling;
- `yaml` for source-aware frontmatter parsing;
- `unified`, `remark-parse`, and `unist-util-visit` for Markdown syntax traversal.

There is no runtime integration with OpenCode itself; the extension reads exported
JSON only. Likewise, agent installations are inferred from declared directories,
not from executable discovery or subprocess calls.

Development dependencies provide TypeScript, esbuild, Vitest, `fast-check`, ESLint,
Prettier, and VS Code type definitions. Packaging may use `@vscode/vsce` through
`npx`, but it is not a declared runtime dependency.

## Build and Validation Notes

- Required VS Code engine: `^1.90.0`.
- TypeScript targets ES2022 with strict, unused-symbol, implicit-return, and
  fallthrough checks; `tsc` performs no emit.
- `esbuild.js` produces `dist/extension.js` as CommonJS for Node 18 with `vscode`
  externalized.
- The same build produces `dist/webview/openCodeSessionReport.js` as an ES2022
  browser IIFE and extracts its imported CSS beside it.
- Production builds are minified; watch builds include source maps.
- Vitest runs `test/**/*.test.ts` in Node. Property tests use `fast-check`.
- `npm run test:eval` limits Vitest to evaluation tests, and
  `npm run benchmark:static` runs the curated static-quality benchmark.
- `npm run sync:heuristic-dictionaries` explicitly copies the catalog into the static
  VS Code manifest; `npm run check:heuristic-dictionaries` and manifest tests fail on
  drift. Extension startup never writes repository files or `package.json`.
- `vscode:prepublish` runs the production build before VSIX packaging.

The standard contributor checks are:

```bash
npm run check-types
npm run lint
npm test
npm run build
```

`npm run lint` checks `src/` only. Prettier is available but is not part of that
script. Every skill diagnostic code should also be reflected in `docs/rules.md`.

## Known Constraints

- Workspace analysis, the Skills panel, workspace report, and index export use only
  the first open workspace folder. The Workspace navigator is multi-root, and the
  separate validate-workspace command uses VS Code-wide file search.
- Workspace analysis and full local skill analysis use synchronous Node filesystem
  operations. Cancellation is checked between skill files, so a single large scan
  step can still block the extension host and delay progress repainting.
- Workspace aggregate analysis reads saved files. Unsaved text is visible to live
  diagnostics and the per-skill report, but not to collision, portability, tree, or
  index results.
- Full skill analysis is path/Node-filesystem based. The Workspace navigator and
  OpenCode export reader support URI filesystem providers more broadly, but remote
  skill validation/resource discovery is not consistently provider-neutral.
- The resource cache watcher is registered for the built-in
  `references/scripts/assets/templates` directory names. If
  `resources.directories` replaces them with custom names, changes under those names
  do not directly invalidate the live-diagnostic resource cache. Configuration
  changes clear that cache, while workspace analysis and reports perform fresh
  discovery.
- The Skills tree caches its `WorkspaceAnalysis` until a refresh-triggering event.
  Navigator trees have separate caches and invalidation rules.
- Similarity tokenization and most description heuristics are English/ASCII-oriented.
  Non-English input is structurally analyzed and can be marked with limited coverage.
- Collision and portability results are local heuristics. They do not execute skills
  in an agent environment, and remote skill links are classified but never fetched.
- Installed-agent discovery is local and bounded to declared roots; it is not a full
  home-directory inventory and may omit unsupported agent layouts.
- OpenCode compatibility is based on a reconstructed schema pinned to one upstream
  source commit, not an official stable export contract. Unknown content is retained,
  and sanitization or preview truncation can make trajectory evidence incomplete.
- OpenCode skill matching is name-based and scans only local `file:` workspace roots.
  Matches and subsequent actions establish temporal proximity, not causation or rule
  compliance.
- The evaluation runner has no production provider or extension UI. It is currently a
  tested library seam for externally recorded behavioral decisions.
- The LLM provider interface and experimental setting are inert; no assisted review is
  implemented.
