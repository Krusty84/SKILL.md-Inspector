# HISTORY.md — Development history for AI agent sessions

> **Purpose.** This file gives a fresh AI agent (or human) session the accumulated
> context of this repository: how the project evolved PR by PR, which design
> decisions were made and reversed, which platform pitfalls were already paid for,
> and what state the codebase is in. Read it before planning non-trivial changes so
> you do not re-litigate settled decisions or re-discover known traps.
>
> **Companion documents** (read them for depth; this file is the connective tissue):
>
> | Document | Contents |
> | --- | --- |
> | `README.md` | User-facing features, commands, settings, how to run |
> | `ARCHITECTURE.md` | Module boundaries, data flow, key design decisions, constraints |
> | `CHANGELOG.md` | User-facing change log per release (0.1.0 → 0.3.0 + Unreleased) |
> | `docs/rules.md` | Catalog of every diagnostic code with rationale and examples |
> | `docs/algorithm-quality-evaluation.md` | First adversarial audit of the core algorithms (P1–P5 findings) |
> | `docs/algorithm-quality-evaluation-round2.md` | Second-pass audit (N1–N7 findings; verifies the P-fixes) |
> | `docs/remediation/` | Five self-contained remediation plans written for isolated agent sessions, plus sequencing README |

## Project snapshot (2026-07-24, after PR #67, v0.3.0 + unreleased work)

**SKILL.md Inspector** is a VS Code extension (`engines.vscode ^1.90.0`) for
authoring and reviewing Agent Skills. It validates files named exactly `SKILL.md`
(frontmatter, name/description rules, links, bundled resources, body structure),
scores description and instruction quality with transparent heuristics, measures
exact `o200k_base` token budgets offline, analyzes workspaces for name/description
collisions, browses installed agent files (Claude Code, Codex, OpenCode, Copilot),
and inspects exported OpenCode session JSON in an interactive timeline.

Hard principles, stable since PR #1 and enforced across all 67 PRs:

- **Local, deterministic, no LLM at runtime.** Core analysis never calls a model,
  never executes agent binaries, sends no telemetry. `src/llm/` is a reserved,
  unused provider boundary; `experimental.llmReview.enabled` is inert.
- **The only network feature is opt-in** remote-link availability checking
  (SSRF-protected, injected, cancellable), off by default, never part of
  `analyzeSkill`.
- **Pure core / adapter split.** Modules under `src/{parser,validation,quality,
  authoring,workspace,opencode,evaluation,templates,navigator}` do not import
  `vscode`; VS Code effects live in `src/{ui,commands,codeActions,diagnostics,
  online}` and `extension.ts`.
- **Independent signals.** Validation status, Static Description Quality,
  instruction/resource authoring quality, collision risk, and token budgets are
  never averaged into one score.
- **Deterministic output.** Stable rule order, sorted diagnostics, normalized
  config, reproducible reports.

Scale: 62 contributed commands; 46 settings in 11 titled Settings-UI categories;
~40 documented diagnostic codes; 5 tree views (FAVORITES, WORKSPACE, INSTALLED
AGENTS, OPENCODE SESSIONS in the Activity Bar container; "SKILL.md Skills" in the
Panel); ~880 Vitest tests incl. fast-check property tests; 68-case scoring
benchmark. Runtime deps: `yaml`, `unified`/`remark-parse`/`unist-util-visit`,
`js-tiktoken/lite` + bundled `o200k_base` table. Build: esbuild (extension CJS
bundle + browser bundle for the OpenCode webview).

Quality gates used throughout development:

```bash
npm run check-types   # tsc --noEmit
npm run lint          # eslint src
npm test              # vitest run
npm run build         # esbuild production
npm run benchmark:static            # scoring benchmark corpus
npm run check:heuristic-dictionaries  # settings/catalog drift check
```

## How this repository is developed

- **One AI session per branch, one PR per work item.** Branches named `claude/*`
  were authored by Claude Code sessions, `codex/*` by Codex sessions, and the
  early `feat/*`, `fix/*`, `docs/*` branches came from the same agent-driven
  workflow. The repo owner (Krusty84) reviews and merges; 66 of 67 PRs merged.
- **Plan-driven work for complex changes.** `docs/remediation/README.md` is the
  model: plans are written to be executable by an isolated session with no prior
  context, with reproduction steps, acceptance gates ("full suite passes"), and
  explicit sequencing to avoid merge conflicts on shared files
  (`defaultHeuristicDictionaries.json`, the benchmark corpus).
- **Audit → fix → adversarial re-audit loops.** Twice (PRs #43–#44 and #64–#67)
  the project ran an evaluation of its own algorithms, wrote findings to `docs/`,
  fixed them, then re-evaluated the fixes and fixed the regressions the fixes
  introduced. Expect this pattern to continue.
- **Conventions to preserve:** every new diagnostic code gets a `docs/rules.md`
  entry; heuristic vocabulary changes go through the canonical registries
  (`src/quality/triggerPhrases.ts`, `src/quality/defaultHeuristicDictionaries.json`)
  and `npm run sync:heuristic-dictionaries`, never duplicated inline; new checks
  come with tests (fixtures live in `fixtures/skills/` — a 10-step quality ladder
  plus a 13-fixture defect zoo); PR bodies describe what and why.

## ⚠ Git history caveat

The local/default-branch git history **does not go back to the beginning**. It was
re-rooted on 2026-07-16: the root commit `825b3cf` ("Update print statement from
'Hello' to 'Goodbye'" — a misleading leftover message) is a single full-tree
snapshot of everything built in PRs #1–#30 (2026-07-09 → 07-15). Merge commits
exist only for PRs #31–#67. The record of PRs #1–#30 lives in GitHub PR metadata
and in this file — `git log` alone will not show you that era.

## Development timeline

All 67 PRs, chronological. All merged except #30. Dates are merge dates.

### Phase 1 — MVP ladder (#1–#4, Jul 9–10, `claude/skillmd-inspector-vscode-eviccm`)

- **#1** MVP1: the extension itself — deterministic SKILL.md linter: frontmatter
  parsing, `name` rules (≤64 chars, kebab-case, folder match), `description`
  rules (≤1024 chars, action verb/trigger/vagueness heuristics), Markdown link +
  unreferenced-resource checks (`references/`, `scripts/`, `assets/`,
  `templates/`), body/section checks, quick fixes, Skill Report webview,
  validation profiles (generic/vscode/claude/codex — later removed in #57), pure
  pipeline decoupled from VS Code.
- **#2** Reliable F5 launch (one-shot `npm: build` preLaunchTask); README run/install docs.
- **#3** MVP2: Trigger Quality Score 0–100 over seven weighted criteria + local
  no-LLM "Improve Description" rewrite; v0.2.0. (Renamed Static Description
  Quality in #36.)
- **#4** MVP3: workspace intelligence — recursive discovery, TF-IDF-cosine
  collision detection with risk bands, resource graphs, per-profile portability,
  Skills tree view, workspace report, `skills.index.json` export; v0.3.0.

### Phase 2 — Task-numbered hardening, "Tasks 1–87" (#5–#14, Jul 11–14, `feat/*` `fix/*` branches)

- **#5** Whitespace-only name/description rejected; phrase model split into
  positive / exclusive / negative lists with negative-stripping before positive
  matching (first fix for the recurring substring-matching hazard, see Lessons).
- **#6** Path security: `isPathInsideDir`, `skill.link.escapesRoot` for
  lexical/symlink escapes; references detected in plain text and code spans, not
  just links; arbitrary resource-dir discovery + `resources.exclude` setting and
  a built-in glob matcher (no new dependency); canonical path normalization.
- **#7** Heuristic i18n: uppercase runs no longer fake artifacts; known-acronym
  registry; Unicode tokenizer; irregular verbs; `description.language`
  (`en`/`auto`) with non-scoring "Language support" finding for non-English text.
- **#8** Front-loaded-intent tightening; per-profile criterion weights with
  normalization; graduated length band; duplicate-name (case-insensitive) and
  similar-name (Levenshtein ≥ `names.similarityThreshold`) detection.
- **#9** Collision scoring rebuilt as corpus-independent composite
  (jaccard/cosine/char-ngram/name-similarity weights), boundary-separation
  penalty, `wordForms.ts` (fixes `analysis→analysi`), `collisionFeatures.ts`
  (capabilities/artifacts/trigger/boundary clauses), `collision.*` settings.
- **#10** AST parsing (`yaml` document API: duplicate-key detection, exact key
  ranges; remark headings), `body.strictness` setting, per-profile metadata
  rules, portability rewrite, and the **text-only vs full analysis split** with
  `ResourceCache` + resource watcher for typing performance.
- **#11** `discovery.exclude` setting; workspace analysis cancellation +
  progress; cancelled runs marked, never presented as complete.
- **#12** fast-check property tests (scoring invariants, similarity symmetry,
  path containment incl. win32/percent-encoded) + regression locks; no prod changes.
- **#13** Transparency: `docs/rules.md` rule catalog; score labeled "heuristic";
  confidence + limitations metadata on quality and collision results.
- **#14** Diagnostic pipeline: `kind` (specification/compatibility/quality/
  security) via exhaustive code map, deterministic sorting, rule registry,
  severity overrides (`severityOverrides`, `severity.allowSpecificationOverrides`
  protecting spec errors), diagnostics embedded in the skills index.

### Phase 3 — Docs sync (#15–#16, Jul 14)

- **#15** ARCHITECTURE.md rewritten to the post-Tasks-1–87 reality.
- **#16** README features + full 18-setting table cross-checked against package.json.

### Phase 4 — Codex UX build-out: templates, navigator, views (#17–#23, Jul 14, `codex/*`)

- **#17** Template subsystem (`src/templates/`: line-array templates,
  `{{name}}`/`{{title}}` placeholders, `skillMdInspector.templates` replaces the
  bundled catalog when non-empty); grouped context submenu; `resolveSkillTarget`
  so Explorer invocations act on the clicked file.
- **#18** Activity Bar navigator + Favorites + Installed Agents discovery
  (read-only, bounded, symlink-cycle-safe); Skills analysis view moved to Panel.
- **#19** Workspace navigator rebuilt as lazy Explorer-like tree over
  `workspace.fs` (works on remote/virtual filesystems; honors `files.exclude`
  deliberately, not `discovery.exclude`).
- **#20** Single navigator split into three independent views (FAVORITES /
  WORKSPACE / INSTALLED AGENTS); native resource context menus restored.
- **#21** Explorer-parity workspace commands (new/rename/delete/copy/cut/paste/
  copy-path/terminal/etc.) with safe path validation and an extension-local clipboard.
- **#22** Built-in-command adapter: capability context keys hide unsupported
  menu items instead of letting them fail.
- **#23** Submenu regression repair; normalized context values
  (`skillMdInspector.skillFile` etc.); `toggleFavorite`.

### Phase 5 — OpenCode session integration (#24–#35, Jul 14–16, `codex/*`)

- **#24** OpenCode `session.json` inspection: tolerant parser → sanitization
  detector → trajectory normalization → skill matching (temporal, explicitly
  non-causal); OPENCODE SESSIONS view; static report + interactive Cytoscape+ELK
  trace explorer webview.
- **#25** View registration fix (auxiliarybar container is not contributable);
  URI resolver + picker fallback; watcher and webview-ready handshake fixes.
- **#26** OpenCode global/skills dirs added to Installed Agents sources.
- **#27** Example custom template + test exercising the production template path.
- **#28** Trace graph: top-to-bottom default, grapheme-safe label truncation,
  overlap-driven relayout, progressive disclosure (expand/show/hide subtree).
- **#29** Semantic "Path" overview (request/skill/phase/error/retry/response
  route) alongside the execution graph.
- **#30** *(closed, never merged — the only one)* proposed deleting the entire
  interactive trace graph. Rejected as-is, but the direction won: #31–#32
  replaced graph + static report with the timeline.
- **#31** Compatibility diagnostics for exports (`opencode.invariant.*`,
  `opencode.id.*`), richer normalized details, hardened static report.
- **#32** Interactive **timeline** report replaces the static report and the
  trace graph (cytoscape/elkjs removed); secure singleton webview (strict message
  validation, lazy details); browser bundle under `src/webview/openCodeSessionReport/`.
- **#33** Fixed-header shell, chevron session details, accessible tooltips, Skills filter.
- **#34** Tools filter includes skill calls again (semantics fix of #33);
  detached-container race in repeated detail expansion fixed.
- **#35** Explicit per-event expand/collapse toggle buttons (a11y, reduced motion).

### Phase 6 — Quality honesty pass (#36–#40, Jul 17, mixed `codex/*` + `claude/*`)

- **#36** The big rename: TriggerQuality → **StaticDescriptionQuality**,
  `confidence` → `coverage` — the score measures text evidence, not agent
  selection. Folder/name mismatch inside `skills/` became a spec error. Added the
  versioned benchmark corpus (`benchmarks/static-description-quality/`), the
  offline behavioral evaluation framework (`src/evaluation/`), authoring-quality
  checks, index `schemaVersion: 2`.
- **#37** `triggerPhrases.ts` made the single canonical marker registry (fixed
  "Use this skill when" earning no credit; negatives no longer count as positive
  triggers); authoring penalties severity-weighted (major/moderate/minor).
- **#38** Configurable heuristic dictionaries (`heuristics.dictionaryValues.*`
  with add/remove/replace semantics), low-signal artifact list, strongest-marker
  scope selection, `resources.directories` setting.
- **#39** `AnalysisContext` threads resolved dictionaries through *every*
  analysis surface (same file scores identically everywhere); ambiguous-acronym
  safeguards (`can`, `step`, `pr`); authoring scoring bands.
- **#40** Bug-fix batch: largest-remainder weight integerization (points sum to
  score), min-length band inversion, verb-form registry isolation + irregular
  plurals, word-boundary phrase matching, typographic apostrophes,
  reference-style links validated, `skill.link.caseMismatch`, `textMatch.ts`
  shared phrase utilities.

### Phase 7 — Fixture corpus (#41–#42, Jul 19, `claude/skill-md-fixtures-*`)

- **#41** Ten hand-written fixtures from broken (`stuff/`) to excellent
  (`pdf-form-filler/` with real reference docs + runnable script) under
  `fixtures/skills/`.
- **#42** Thirteen-fixture "defect zoo", each isolating one failure class
  (missing fields, over-long names, duplicate names, dead links, description
  instruction-dump, 666-line body, BOM/CRLF/unclosed fences, YAML block scalars,
  mixed-language content).

### Phase 8 — First audit loop + settings UX (#43–#48, Jul 20, `claude/skill-linter-algorithm-eval-uiniia`)

- **#43** First adversarial audit (`docs/algorithm-quality-evaluation.md`,
  P1–P5 + 40 findings) **plus, in the same PR** (body undersells it): fixes for
  P1 (guard YAML `toJS()` crash), P2 (rule isolation in the registry), P3
  (collision O(n) pre-pass + cancellation), P4 (scoring de-gaming: echoed-scope
  cap, gerund credit), and new features — **SSRF-protected remote-link checking**
  (`src/online/`, `links.onlineCheck.*`) and **token-budget validation/reporting**
  (o200k_base, `src/parser/tokenUsage`), body-evidence analysis, explicit scoring states.
- **#44** *(empty PR body — actual contents recovered from git)*: second-pass
  audit doc (N1–N7), fix N1 (quick fixes corrupted multi-line YAML values — edits
  now computed from YAML value ranges), fix N1b (**security**:
  `RenameParentFolder` gained `isSafeFolderRenameTarget` path-containment guard
  against `name: ../../evil`), repair of the P4-fix regression (echo cap ate
  "Python 2/3" digits).
- **#45** Context menus tidied (per-file menu loses workspace-wide commands;
  workspace-folder submenu gains them).
- **#46–#48** Settings UI grouping, three attempts (see Lessons): key reorder
  (no effect) → explicit `order` fields → **titled category array** (the shipped
  design: General/Validation/Heuristics/…/Experimental); sync script and manifest
  tests updated to match.

### Phase 9 — Views, scoped analysis, simplification (#49–#57, Jul 21–22, `claude/*`)

- **#49** Skill folders render as expandable tree nodes showing real contents.
- **#50–#51** Submenu visibility repairs; root cause: VS Code silently drops a
  submenu contributed twice to one menu → unique per-(view×item-type) submenu ids
  + regression test.
- **#52** Installed-scope Validate/Report: node-aware commands analyze skills
  *outside* the workspace (`computeScopedAnalysisOnline`, `validatePaths`).
- **#53–#55** View-refresh isolation: config refreshes are value-driven and
  scoped per view; file ops only refresh dependent views; every refresh logs a
  `[view-refresh]` reason; documented the unavoidable extension-host restart when
  the first workspace folder changes (VS Code API contract).
- **#56** Dead code removal (audit N7): unused static OpenCode HTML renderer +
  orphaned view-model layer; behaviors re-asserted on the normalized model.
- **#57** **Vendor profiles removed** (vscode/claude/codex + `profile` setting +
  profile-metadata rules + portability matrix): generic is the only validation
  policy, tunable via override settings. Index `schemaVersion` 5.

### Phase 10 — Reports & settings polish (#58–#63, Jul 22–24, `claude/*`)

- **#58** "Generated:" timestamp on skill/workspace reports.
- **#59** `general.timeFormat` (european 24h default / usa 12h) + `formatTimestamp`.
- **#60** Pure-CSS sticky table-of-contents in HTML reports (`reportToc.ts`,
  no scripts, CSP unchanged).
- **#61** Token usage surfaced: report card + SKILLS table column
  (`Body X · Ref Y · Other Z`), `totalSkillTokens()`.
- **#62** Guided severity-override picker (`configureSeverityOverrides`
  command): kind-grouped code list, severity, User/Workspace scope, modal guard
  for protected specification downgrades; pure model in `severityOverridesModel.ts`.
- **#63** Override deletion removes the code from **every** scope so the merged
  config actually loses it.

### Phase 11 — Second audit loop: remediation plans 1–5 (#64–#67, Jul 24, `claude/skill-md-quality-checker-*`)

- **#64** Five self-contained remediation plans + sequencing README under
  `docs/remediation/` (see "How this repository is developed").
- **#65** Plans 1–4 implemented: manifest tests reconciled with modern implicit
  activation events; glob brace alternation `{a,b,c}`; **description evidence
  overhaul** (gerund leads, noun-phrase subjects, usage-context pattern grammar,
  placeholder anti-gaming cap at 59); **Latin-script language detection**
  (de/fr/es/it/pt stopword profiles); **collision boilerplate damping** (action
  verbs out of Jaccard tokens) + morphology fixes (`apis`, `axes`, `vertices`);
  `skill.description.noVerb` demoted error→warning; benchmark recalibrated.
- **#66** Plan 5 written from an adversarial re-audit of #65: negated usage
  verbs scored as positive triggers; duration/conditional statements scored as
  triggers; stopword homographs flagged terse English as foreign.
- **#67** Plan 5 implemented: negation grammar factored from the same
  `USAGE_VERB_CORE` as the positive grammar (symmetry by construction); `avoid`
  added to negations; `for`+quantity/duration rejected as usage evidence; bare
  third-person usage verbs need explicit context; language profiles split into
  unique vs homograph markers (≥1 unique marker required). Dutch detection is a
  documented, test-pinned gap. 880 tests, 68 benchmark cases green.

## Design decisions and reversals (the "why" ledger)

Settled — do not silently reintroduce:

1. **No runtime LLM, no telemetry, no agent execution.** Only opt-in remote-link
   checks touch the network.
2. **Static Description Quality is a text heuristic, not a selection predictor**
   — naming, docs, and UI must keep saying so (#13, #36). Signals stay independent.
3. **Vendor profiles are gone** (#57, reversing #1/#10 investment). Policy is the
   generic profile + override settings. Don't resurrect per-vendor rule sets
   without owner buy-in.
4. **The OpenCode trace graph is gone** (#30 proposed, #32 executed). The
   interactive timeline is the only session report; the removed static renderer
   (#56) should not come back.
5. **Marker vocabulary lives in one registry** (`triggerPhrases.ts`,
   dictionaries JSON + sync script). Three separate bugs (#5, #37, #65/#67) came
   from duplicated or asymmetric phrase lists; the negation grammar is now
   *derived* from the positive grammar to keep symmetry by construction.
6. **Analysis surfaces share one `AnalysisContext`** (#39) so custom dictionaries
   produce identical scores everywhere.
7. **Specification-kind errors are protected** from severity override unless
   `severity.allowSpecificationOverrides` is set (#14, #62).
8. **Aggregate analysis is first-workspace-folder and saved-files only**; the
   navigator is multi-root and URI-based (#19). Two different models on purpose.
9. **Quick fixes distrust frontmatter input**: kebab-case/rename/create-file
   actions must keep their containment and YAML-value-range guards (#6, #44).

## Hard-won platform lessons (VS Code specifics)

- Settings UI ignores manifest declaration order; use a `configuration` **array
  of titled categories** (lexicographic sort otherwise; per-key `order` works
  only within a category) (#46–#48).
- A submenu id can be contributed to a given menu **only once**; duplicates are
  silently dropped — use unique ids per (view × item type) (#51).
- Views cannot be contributed to `viewsContainers.auxiliarybar` (#25).
- Changing the **first** workspace folder (or going single→multi-root) restarts
  the extension host by API contract; no extension can prevent the resulting
  full view reload — detect via output-channel session marker (#55).
- Since VS Code 1.74, `onView:`/`onCommand:` activation events are implicit;
  tests should assert the modern contract (#64/#65 Plan 1).
- Webview races: use a `ready` handshake before posting state (#25); render
  details into the newly created DOM node, not a stale reference (#34).

## Current state and open threads

- **Unreleased work is piled on 0.3.0** — everything in `CHANGELOG.md` "Unreleased"
  (remote-link checks, case-mismatch links, profile removal, view-refresh
  isolation, scoring fixes, authoring severities, plans 1–5). Cutting a release
  (version bump + changelog) has not been done in this repo's PR history.
- **Audit findings**: P1–P4 fixed (#43), N1/N1b fixed (#44), N7 fixed (#56), the
  portability-matrix finding is moot (#57), and Plans 1–5 (#65, #67) covered the
  evidence/language/collision/morphology/glob families. Items from
  `docs/algorithm-quality-evaluation-round2.md` **not** in that list — e.g.
  editor-path hardening (N2 empty-name kebab fix, N3 unclamped collision
  settings, N4 malformed severityOverrides falling through to Error, N6 ghost
  diagnostics), P5 OpenCode aggregate bounds, uncapped resource reads, non-ASCII
  similarity invisibility — were open as of that audit; **verify against current
  code before acting**, the audits are point-in-time documents.
- **Documented heuristic gaps**: Dutch is not detected by language profiles
  (test-pinned, #67); heuristics and similarity remain primarily English/ASCII
  oriented; token-budget thresholds are fixed policy.
- **Known constraints** (see ARCHITECTURE.md): first-root aggregate analysis,
  saved-files-only aggregates, synchronous fs in full analysis, watcher coverage
  limited to the four standard resource dirs.

## Orientation map

| Area | Where |
| --- | --- |
| Composition root / activation | `src/extension.ts` |
| Config resolution (all settings) | `src/config.ts` |
| Single-skill pipeline (`analyzeSkill`, text-only vs full) | `src/analysis/` |
| Frontmatter/Markdown/links/resources/tokens | `src/parser/` |
| Validation rules + registry + diagnostic codes | `src/validation/` |
| Scoring heuristics, dictionaries, word forms, language | `src/quality/` |
| Instruction/resource authoring quality | `src/authoring/` |
| Collisions, discovery, index export | `src/workspace/` |
| Quick fixes (containment guards live here) | `src/codeActions/` |
| Tree views, reports, webview hosts | `src/ui/` |
| Commands (incl. workspace Explorer-parity, severity picker) | `src/commands/` |
| Opt-in remote-link checker (SSRF) | `src/online/` |
| OpenCode parsing/normalization/timeline model | `src/opencode/` + `src/webview/openCodeSessionReport/` |
| Navigator/favorites/installed agents | `src/navigator/` |
| Templates | `src/templates/` |
| Offline behavioral evaluation library | `src/evaluation/` + `evaluation/examples/` |
| Tests (unit/property/regression) | `test/` |
| Scoring benchmark corpus | `benchmarks/static-description-quality/` |
| Hand-written skill fixtures (quality ladder + defect zoo) | `fixtures/skills/` |
| Dictionary/settings drift check | `scripts/sync-heuristic-dictionaries.js` |

---

*Maintenance: this file is a curated snapshot through PR #67 (2026-07-24). When
significant PRs merge, append them to the timeline and update "Current state";
keep entries in the compressed style used above.*
