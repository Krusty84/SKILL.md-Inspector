# Architecture

## Overview

SKILL.md Inspector is a Visual Studio Code extension for authoring, validating, and
inspecting Agent Skill packages. Its primary input is a file named exactly
`SKILL.md`; workspace analysis combines multiple such files, and a separate subsystem
inspects exported OpenCode session JSON.

The implementation has two practical boundaries:

- host-independent TypeScript parses and validates skills, computes quality and
  collision signals, models workspace results, and normalizes most OpenCode data;
- VS Code adapters manage documents, configuration, diagnostics, commands,
  persistence, filesystem URIs, tree views, progress, and webview lifecycles.

Analysis is local and deterministic. The extension does not call remote services,
send telemetry, invoke an LLM, execute OpenCode exports, run agent executables, or
fetch links referenced by a skill. `src/llm/` and the experimental LLM setting are
inert seams rather than a working integration.

The production build contains two artifacts: a CommonJS extension-host bundle and a
browser bundle for the interactive OpenCode report. Skill and workspace reports are
script-disabled HTML rendered in the extension host.

## Repository Structure

```text
.
+-- src/
|   +-- analysis/       # Single-skill pipeline and VS Code workspace adapter
|   +-- authoring/      # Instruction and bundled-resource hygiene assessment
|   +-- codeActions/    # Diagnostic quick fixes and insertion templates
|   +-- commands/       # Skill, workspace, template, and OpenCode commands
|   +-- diagnostics/    # VS Code diagnostic provider and source-range mapping
|   +-- evaluation/     # Offline behavioral trigger evaluation library
|   +-- llm/            # Inert provider interface; no runtime implementation
|   +-- navigator/      # Favorites, installed-agent discovery, workspace browser
|   +-- opencode/       # Export discovery, parsing, normalization, and view models
|   +-- parser/         # Frontmatter, Markdown, link, resource, and glob parsing
|   +-- profiles/       # Generic, VS Code, Claude, and Codex policies
|   +-- quality/        # Static Description Quality and lexical dictionaries
|   +-- templates/      # Built-in and configured template resolution
|   +-- types/          # Shared diagnostics, profiles, skills, and workspace models
|   +-- ui/             # Trees, report models, HTML renderers, and webview hosts
|   +-- validation/     # Rule registry and validators
|   +-- webview/        # Browser-side OpenCode timeline implementation
|   +-- workspace/      # Discovery, conflicts, collisions, portability, and export
|   +-- config.ts       # Resolves scoped VS Code settings
|   `-- extension.ts    # Activation and runtime composition
+-- test/               # Unit, property, integration, and regression tests
+-- benchmarks/         # Curated static-quality benchmark corpus
+-- evaluation/         # Example behavioral trigger suites
+-- fixtures/           # Sample skills and OpenCode exports
+-- docs/rules.md       # Diagnostic-code catalog
+-- scripts/            # Explicit repository synchronization utilities
+-- esbuild.js          # Extension-host and browser build definitions
+-- package.json        # Extension manifest, settings, menus, views, and scripts
`-- vitest.config.ts    # Test discovery and runtime configuration
```

`src/` is the implementation source of truth. `dist/` is generated and should not be
edited directly.

## Main Runtime Components

### Extension Composition

`src/extension.ts` is the extension-host entry point. `activate` constructs and
registers:

- one `DiagnosticsProvider` and one Markdown code-action provider;
- the bottom-panel skill analysis tree;
- Favorites, Workspace, Installed Agents, and OpenCode Sessions Activity Bar views;
- skill/report/template, workspace file-management, and OpenCode commands;
- document, configuration, workspace-folder, and filesystem event handlers;
- a shared output channel for configuration, navigator, and OpenCode failures.

Live edits are debounced by 300 milliseconds. Save, resource, workspace, and
configuration events clear the relevant caches and refresh affected providers.
Disposables and pending validation timers are tied to the extension context.

### Parsing and the Skill Document Model

`parseSkillFile` produces the normalized `SkillDocument` consumed by validation,
reports, quick fixes, and workspace analysis. Parsing is split into focused stages:

- `parseFrontmatter` uses `yaml` source positions to retain field ranges and report
  malformed or duplicate top-level keys;
- `parseMarkdownLinks` traverses a Unified/Remark Markdown tree, including inline and
  reference-style links, and recognizes supported bare resource paths;
- `parseMarkdownHeadings` records ATX and setext headings;
- `analyzeBodyEvidence` uses the Markdown tree to find meaningful examples rather
  than treating a heading alone as proof of example content;
- `discoverResources` inventories files below the skill directory while honoring
  exclusion globs; configured resource-directory names determine which unreferenced
  files produce validation diagnostics;
- `withResources` marks inventory entries referenced by canonical relative paths,
  including an unambiguous case-folded match so casing errors do not also produce a
  false unreferenced-resource warning.

Text parsing itself is filesystem-free. Full analysis adds synchronous Node
filesystem work for resource discovery and local link verification.

### Validation and Diagnostics

`analyzeSkill` is the canonical single-skill pipeline:

1. parse the current text;
2. attach discovered resources in `full` mode;
3. run the validation registry;
4. apply profile severity overrides;
5. return diagnostics in deterministic order.

The explicit analysis modes serve different latency requirements:

- `text-only` performs no filesystem work and is used after debounced edits;
- `full` discovers resources and verifies local links for open/save, commands,
  reports, and workspace analysis.

`src/validation/ruleRegistry.ts` groups frontmatter, name, description, link,
resource, body, and profile-metadata validators. Rules return tool-neutral
`SkillDiagnostic` objects classified as `specification`, `compatibility`, `security`,
or `quality`. Specification errors are protected from severity downgrades unless the
effective profile explicitly allows them.

`DiagnosticsProvider` maps those results into VS Code diagnostics and owns a
directory-keyed resource cache. `SkillCodeActionProvider` reruns analysis for the
requested document range and translates diagnostic fix metadata into editor or
filesystem edits. Core validation never mutates user files directly.

### Profiles, Configuration, and Lexical Policy

`readConfig` resolves `skillMdInspector.*` settings for a resource URI. It combines
one of the `generic`, `vscode`, `claude`, or `codex` profiles with configured limits,
body strictness, language mode, severity overrides, resource policy, collision
parameters, and heuristic dictionaries. Template, navigator, and OpenCode components
read their own settings because those values are not part of skill analysis.

`src/quality/defaultHeuristicDictionaries.json` is the canonical lexical-policy
catalog. It contains action verbs and forms, artifact terms, acronyms, trigger and
boundary phrases, vague language, morphology mappings, and collision stopwords.
`dictionaries.ts` normalizes and deeply freezes the effective settings. Malformed
individual dictionaries fall back to their catalog defaults while valid siblings
remain active, and structured warnings are shown once per unchanged warning state.

Resolved dictionaries are passed consistently through description validation,
Static Description Quality, local description improvement, portability checks,
authoring evidence, and collision feature extraction. Tokenization, scoring bands,
path security, YAML structure, and cache behavior remain code rather than user data.

### Quality Assessments

The extension keeps several signals separate because they answer different questions:

- **Static Description Quality** examines deterministic wording evidence: an action,
  usage trigger, concrete artifact, boundary, front-loaded intent, low vagueness, and
  useful length. It retains raw and adjusted scores, the public label, grade-limit
  reasons, findings, coverage, and limitations.
- **Instruction authoring quality** checks structural hygiene in the Markdown body,
  including substantive instructions, concrete examples, placeholders, empty or
  duplicate sections, unclosed fences, excessive length, and repetition.
- **Resource authoring quality** checks unreferenced files, undocumented scripts, and
  files larger than 1 MiB.
- **Validation**, **collision risk**, and **profile compatibility** remain independent
  of all three authoring assessments.

`QualityAssessmentState` distinguishes a real scored result, including zero, from
`not-scored`. Missing, null, non-string, blank, or untrustworthy description input is
not scored and has null numeric fields. Instruction quality is likewise not scored
when frontmatter failure makes the body boundary untrustworthy. Resource quality can
still be computed independently after successful discovery.

These assessments are heuristics. They do not measure instruction correctness or the
probability that an agent will select a skill.

### Reports and Workspace Analysis

The per-skill report analyzes the active document text and therefore includes unsaved
changes. `buildReportModel` combines diagnostics, description quality, instruction
quality, resource quality, and resource inventory without collapsing them into one
score.

`computeWorkspaceAnalysis` is the VS Code-facing entry point shared by the Skills
panel, workspace report, and index export. It selects the first open workspace root,
resolves its configuration, discovers saved `SKILL.md` paths, and invokes the
host-independent `analyzeWorkspace` function.

For each readable skill, workspace analysis records validation state, diagnostic
counts and codes, all quality results, profile compatibility, and a resource graph.
It then computes:

- exact normalized name conflicts and confusingly similar names;
- description collision similarity from token Jaccard, smoothed TF-IDF cosine,
  character n-grams, and name similarity;
- collision risk reductions when descriptions declare mutually exclusive boundaries;
- per-profile format compatibility for `generic`, `vscode`, `claude`, and `codex`.

Collision records retain contributing metrics, shared terms, risk, and confidence in
the available text. Portability is a format check, not an overall skill grade.

`buildSkillsIndex` projects the same saved-file analysis into schema version 4.
`exportSkillsIndex` adds a generation timestamp and writes `skills.index.json` at the
first workspace root. Version 4 permits null description and instruction score fields
when their state is `not-scored`.

### Navigation and File Operations

Navigation intentionally does not depend on aggregate workspace analysis:

- Favorites stores ordered `SKILL.md` URI strings in VS Code global state; missing
  favorites remain visible until removed.
- Workspace is a lazy, multi-root, URI-based browser. It loads one directory at a
  time through `vscode.workspace.fs`, honors enabled `files.exclude` rules, and has
  its own child cache.
- Installed Agents scans only declared built-in and configured local roots for
  supported `SKILL.md`, `AGENTS.md`, and `CLAUDE.md` files. It uses bounded depth and
  result limits, resolves real paths, and avoids traversal cycles.
- The Skills panel separately caches first-root `WorkspaceAnalysis` for diagnostics,
  collisions, portability, and resource inspection.

Workspace commands use public VS Code APIs for creation, rename, copy/cut/paste,
Trash deletion, terminals, comparison, search, and workspace-folder changes. They
reject absolute or traversal creation paths, check known read-only providers, and do
not overwrite paste conflicts without confirmation. The local clipboard stores URIs,
not file contents.

### Templates

`src/templates/` defines four built-in templates and the configured-template
pipeline. An empty setting selects the built-ins; a non-empty valid array replaces
them. If every configured item is invalid, resolution falls back to the built-ins and
reports the configuration problem.

Templates store frontmatter and body as line arrays. Rendering infers a kebab-case
name from the parent directory, derives a title, expands `{{name}}` and `{{title}}`,
and adds YAML fences. Insertion fills an empty document or inserts at the cursor; it
does not attempt to merge existing frontmatter.

### OpenCode Session Inspection

The OpenCode subsystem reads exported JSON through `vscode.workspace.fs`. The chosen
session folder is stored in workspace state when a workspace exists and global state
otherwise. Discovery can recurse and is bounded by file-size, result-count, and
preview-character settings. Parent/child sessions are reconstructed by `parentID`
with explicit cycle handling.

The import path is:

1. accept only an object root containing object `info` and array `messages`;
2. preserve known and unknown roles, part types, fields, and statuses;
3. add non-fatal diagnostics against the reconstructed pinned schema;
4. detect likely sanitization or redaction markers;
5. normalize source-ordered messages and parts into trajectory nodes and metrics;
6. match recorded `skill` calls by normalized name against local workspace skills;
7. build a bounded timeline model.

The OpenCode report is the only script-enabled webview. The extension host sends a
bounded initial model, validates incoming message shapes and event IDs, and serves
bounded event details lazily. The browser bundle owns filtering, search, expansion,
and timeline presentation. Its content security policy allows only local extension
assets; URLs and recorded commands are displayed, never fetched or executed.

Skill-call segments express recorded ordering only. Later actions are not treated as
proof that the selected skill caused or governed them.

### Offline Evaluation Library

`src/evaluation/` is development and test infrastructure, not an extension command.
It validates behavioral trigger suites, asks an injected `TriggerProvider` for
repeated yes/no selection decisions, and calculates confusion-matrix and stability
metrics. The repository supplies only a deterministic fake provider for tests.
Behavioral results remain separate from static description heuristics.

## Data Flow

### Live Editor Validation

1. VS Code opens, changes, or saves a document.
2. `extension.ts` accepts only an exact `SKILL.md` filename and resolves scoped
   configuration.
3. `DiagnosticsProvider` calls `analyzeSkill` with in-memory text: `text-only` after
   edits and `full` for open/save or explicit validation.
4. Parsers and validators return normalized diagnostics.
5. The adapter replaces the document's VS Code diagnostic collection entry.
6. When requested, the code-action provider converts fix metadata into edits.

### Workspace Report, Skills Panel, and Export

1. `computeWorkspaceAnalysis` selects the first workspace root and discovers saved
   skills.
2. `analyzeWorkspace` performs full analysis per readable file, checking cancellation
   between files.
3. Cross-skill name and description comparisons run after per-skill records exist.
4. One `WorkspaceAnalysis` feeds the Skills panel or workspace report.
5. Export projects the same model into schema-version-4 JSON and writes it with the
   VS Code filesystem API.

### Configuration Refresh

1. `readConfig` reads effective User, Workspace, and resource settings.
2. Profile and dictionary resolvers normalize the settings and return warnings.
3. Analysis callers receive the same resolved policy objects.
4. A relevant configuration event clears analysis and resource caches, revalidates
   visible skills, and refreshes affected trees.

### OpenCode Report

1. The sessions tree discovers bounded JSON candidates below the selected URI.
2. Opening a candidate rereads and parses the full bounded export.
3. Normalization builds trajectory nodes, metrics, compatibility diagnostics,
   sanitization state, and local skill matches.
4. The extension host sends a lightweight timeline to one reusable webview.
5. Expanding an event requests bounded details by a validated identifier.

## Key Design Decisions

- Core validation and analysis avoid importing `vscode`, keeping rules reusable in
  Node tests and editor mutation at the adapter boundary.
- Diagnostics are the contract between rules and quick fixes: rules describe a
  problem and optional fix metadata; VS Code-facing code applies edits.
- Fast and complete analysis modes make keystroke validation predictable while
  preserving full filesystem checks for saved/reporting workflows.
- Sorted diagnostics and normalized configuration keep editor output and tests
  deterministic.
- Lexical policy is configurable data; parsing, security, scoring, and caching
  algorithms remain implementation details.
- Static quality, authoring quality, collision risk, portability, and behavioral
  evaluation are deliberately separate and never presented as runtime proof.
- Navigator providers and aggregate skill analysis use different models because the
  navigator is multi-root and URI-oriented while aggregate analysis is first-root and
  currently path-oriented.
- OpenCode parsing is tolerant because the export is not a stable public contract;
  reconstructed-schema findings inform users without becoming an import gate.
- Interactive webview messages cross a narrow boundary with bounded payloads and
  extension-host validation of browser-supplied identifiers.

## External Dependencies and Integrations

Runtime dependencies are limited to:

- the VS Code Extension API for lifecycle, configuration, diagnostics, persistence,
  commands, filesystem URIs, editors, trees, and webviews;
- Node `fs`, `path`, and `os` for local discovery and path handling;
- `yaml` for source-aware frontmatter parsing;
- `unified`, `remark-parse`, and `unist-util-visit` for Markdown syntax traversal.

There is no runtime integration with OpenCode or any supported agent. OpenCode data is
read from exported JSON, and installed-agent files are inferred from declared paths.
No subprocess is used for discovery.

Development dependencies provide TypeScript, esbuild, Vitest, `fast-check`, ESLint,
Prettier, and VS Code type definitions. VSIX packaging uses `@vscode/vsce` through
`npx`; it is not a runtime dependency.

## Build and Validation Notes

- Required VS Code engine: `^1.90.0`.
- TypeScript targets ES2022 with strict, unused-symbol, implicit-return, and
  fallthrough checks; `tsc` performs no emit.
- `esbuild.js` targets Node 18 for `dist/extension.js`, externalizing `vscode`.
- The same build emits an ES2022 browser IIFE and CSS for the OpenCode report.
- Production builds are minified; watch builds include source maps.
- Vitest runs `test/**/*.test.ts` in Node, including `fast-check` property tests.
- `npm run check:heuristic-dictionaries` and manifest tests detect drift between the
  canonical catalog and contributed VS Code settings.
- Extension startup never synchronizes or writes repository configuration.
- Each diagnostic code should have a matching entry in `docs/rules.md`.

Standard contributor validation is:

```bash
npm run check-types
npm run lint
npm test
npm run build
```

`npm run lint` checks `src/` only. Prettier is installed but is not part of the lint
script.

## Known Constraints

- Workspace analysis, the Skills panel, workspace report, and index export use only
  the first workspace folder. The Workspace navigator is multi-root, and explicit
  workspace validation uses VS Code-wide file search.
- Aggregate analysis reads saved files. Unsaved text appears in live diagnostics and
  the per-skill report, but not in collision, portability, Skills panel, or index
  results.
- Full skill and workspace analysis use synchronous Node filesystem operations.
  Cancellation is checked between skill files, so one large scan step can still delay
  the extension host.
- Full skill analysis is path-oriented and is not consistently compatible with remote
  or virtual filesystem providers. The Workspace navigator and OpenCode reader are
  more broadly URI-based.
- The resource watcher covers the built-in `references`, `scripts`, `assets`, and
  `templates` names. Replacing `resources.directories` with custom names does not add
  equivalent live watcher patterns; reports and fresh workspace scans still discover
  those directories.
- The Skills tree caches aggregate analysis until an explicit or event-driven refresh.
  Navigator providers have independent caches and invalidation rules.
- Similarity tokenization and most description heuristics are English/ASCII-oriented.
  Non-English descriptions can be structurally analyzed but receive limited coverage.
- Collision and portability results do not execute skills in a real agent. Remote
  links are classified but never fetched.
- Installed-agent discovery is bounded to supported or configured local roots and may
  omit unknown layouts.
- OpenCode compatibility uses a reconstructed schema pinned to one upstream source
  commit. Sanitization and preview limits can make evidence incomplete.
- OpenCode skill matching is name-based and scans only local `file:` workspace roots.
- The evaluation library has no production provider or extension UI.
- LLM-assisted review is not implemented.
