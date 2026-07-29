# Changelog

## Unreleased

### Added

- **Static security scan** (on by default, fully offline, executes nothing): a
  new `security` validation rule flags instructions that could harm the user if
  an agent acted on them. Seven new `security`-kind diagnostics —
  `skill.security.command.dangerous` (error) and `skill.security.command.risky`
  (warning) for a two-tier command assessment, `skill.security.service.risky`
  for paste/exfil/tunnel/IP-echo endpoints, `skill.security.secret` (error) for
  hardcoded credentials (known token formats plus `password=`/`api_key=`
  assignments, with placeholder suppression and no echoing of the secret),
  `skill.security.promptInjection`, `skill.security.hiddenContent` (HTML-comment
  instructions and zero-width/bidi Unicode), and `skill.security.sensitivePath`.
  Command and secret patterns are scanned in code contexts and — during full
  validation — in bundled resource files (scripts and other text); prose is
  scanned for injection, hidden content, and sensitive paths. New settings under
  the **Security** group (`skillMdInspector.security.*`) toggle the scan and
  resource scanning, cap scanned file size, and supply allowlists and additive
  command/service patterns. Every code honors `skillMdInspector.severityOverrides`.
- **Per-agent compatibility projection**: the skill and workspace reports gain
  an "Agent compatibility" section that projects one validated skill against
  documented behavior of the `skills-ref` spec baseline, Claude Code, Codex,
  and OpenCode — accepted frontmatter fields, name/directory rules, discovery
  paths, `allowed-tools` semantics, `$ARGUMENTS` substitution, and dynamic
  context — and reports a per-agent verdict with findings. Every capability
  fact carries a source URL and a verified-on date (`src/compat/`). The
  projection is a static, read-only layer: it emits no diagnostics, does not
  interact with severity overrides, and never changes validation status.
  `skills.index.json` now has `schemaVersion` 7: each skill gains a
  `compatibility` object with the projections (without display labels).
  Each agent has an enable/disable checkbox in the Validation settings
  (`skillMdInspector.validation.compatibilityAgents.*`, all on by default);
  a disabled agent is omitted from the bar, the detailed section, the
  workspace matrix, and the exported index, and the reports say so in words
  when every agent is disabled.
- **`skill.description.xmlTags`** (error, specification): the description contains
  `<` or `>`, which Anthropic's platform rejects because the description is
  injected into the system prompt. Previously such a skill validated clean locally
  and failed only on upload.
- **`skill.name.reservedWord`** (error, specification): the name contains
  "anthropic" or "claude", which Anthropic's platform refuses (matched as
  substrings, mirroring the upload validator).
- **`skill.description.languageLimited`** (information, quality): emitted instead
  of the English wording diagnostics when the description is detected as
  non-English. A well-formed Russian description previously drew six diagnostics
  telling the author to add English phrases like "Use when…"; it now gets this
  single notice while structural rules (required fields, types, length) still run.

### Changed

- The skill report's summary row drops the Profile card and gains a Lines card
  (Markdown body line count). The Profile card was vestigial — validation has
  used a single generic policy since the vendor profiles were removed (PR #57),
  so it always read "Generic". A full-width Agent compatibility bar under the
  summary cards shows one semaphore lamp per agent — green (compatible),
  yellow (notes), red (issues), verdict words on hover — with the spec
  baseline shown as "Regular SKILL.md"; a not-evaluated projection renders in
  words, like the other not-scored cards. The detailed Agent compatibility
  section is unchanged.
- Resource token budgets are advisory warnings, never errors. The 25k/50k/100k
  error tiers had no basis in the Agent Skills specification — bundled resources
  load on demand and have no spec limit — yet marked spec-valid skills as
  failing. Messages now name the thresholds as advisory instead of claiming an
  official limit, and `docs/rules.md` no longer contradicts the "quality findings
  are never fatal" rule for these codes.
- Fenced command blocks (`bash`, `python`, and other script languages) count
  toward the substantive-instructions check. A concise command-centric skill whose
  steps live in fenced commands was previously labeled "issues" for lacking prose;
  unlabeled and `text` fences still contribute nothing, so arbitrary fenced prose
  cannot satisfy the check.
- `skill.body.noExamples` no longer claims "No examples section found" when an
  examples section exists: if the section's content is just not recognized as a
  concrete example, the message now says exactly that.
- The report's token section for files outside the standard folders is titled
  "Other text files" instead of "Non-standard files" — root-level reference files
  are a documented Anthropic authoring pattern, not a layout mistake.
- `docs/rules.md` documents `skill.name.folderMismatch` under specification with
  error severity, matching what the code has always emitted.

- Opt-in remote-link availability checks for VS Code full-validation flows, reports,
  and index export. Checks use `HEAD` with minimal `GET` fallback, safe manual
  redirects, per-operation deduplication and concurrency limits, cancellation and
  stale-editor protection, and an injected DNS/HTTP boundary for offline tests.
  SSRF protection rejects non-public or mixed DNS destinations and connects only to
  the validated address. New diagnostics are `skill.link.remoteUnavailable`,
  `skill.link.remoteCheckFailed`, and `skill.link.remoteCheckBlocked`.
- **`skill.link.caseMismatch`** (warning, compatibility): a relative link that
  matches a bundled file except for letter case is reported with the on-disk
  path — it resolves on macOS/Windows but breaks on case-sensitive systems.
  The mismatched resource still counts as referenced, so no spurious
  unreferenced-resource warning piles on.
- Reference-style Markdown links (`[text][id]` with `[id]: references/file.md`)
  are now extracted and validated: missing definition targets are reported and
  existing ones count as referencing bundled resources.
- **`skillMdInspector.heuristics.dictionaryValues.scopeRestrictionPhrases`**: the
  phrases that name a skill's own scope (`only for`, `limited to`), split out of
  `restrictiveBoundaryPhrases`. They still earn the boundary criterion in
  description scoring, but no longer act as exclusions in collision analysis.
- **Two falsifiable benchmark corpora**, alongside the existing synthetic
  regression corpus, plus `npm run benchmark` to run all three
  (`benchmark:calibration` and `benchmark:collisions` run them individually; all
  three also run under `npm test`):
  - `benchmarks/description-calibration/production-skills.json` — 37 verbatim
    `description` values from real, shipped skills, each with provenance and a
    re-verification path. The test gates the **median** score, currently 60, with
    the gate exported as a single constant so raising it is deliberate. Today's
    distribution: mean 62.9, 21 of 37 below "good".
  - `benchmarks/collision-pairs/pairs.json` — 26 skill pairs labeled `COLLIDE` or
    `DISTINCT`, with the labeling rule stated in the file. Half use verbatim
    shipped descriptions; the rest each isolate one discrimination (paraphrase with
    little shared text, mutual exclusion with heavy shared text, same artifact with
    opposite capability, house boilerplate, non-Latin script). The test reports
    recall and precision at the default threshold and a threshold-independent AUC,
    reusing `calculateTriggerMetrics` so the confusion matrix has one
    implementation. Measured today: recall 0.00, precision 0.00, AUC 0.53.
  - Both tests print a full diagnostic table on failure, and
    `benchmarks/README.md` records what each corpus is allowed to prove — a failing
    calibration or collision gate means the metric is wrong, not that the corpus
    needs adjusting.
- **Two quick fixes that register an unrecognized word** instead of leaving an
  unexplained grade: **Add "…" to recognized action verbs** and **Add "…" to
  recognized artifacts**. They write
  `skillMdInspector.heuristics.dictionaryValues.actionVerbs` / `.artifactHints` in
  workspace settings (user settings when no workspace is open) and never edit your
  file. The addition is appended to the effective list, so the built-in entries are
  preserved; neither fix is ever auto-applied.
- **`skill.description.noArtifact`** (information): the description names something
  artifact-shaped that the configured `artifactHints` do not contain. The
  description is fine and the dictionary is incomplete, so the artifact criterion
  pays half until the word is registered.
- **`skillMdInspector.heuristics.dictionaryValues.capabilitySynonymGroups`** and
  **`.artifactSynonymGroups`**: verbs and artifact terms that count as the same
  thing when comparing two skills' scope, so `extract`/`retrieve` and
  `xlsx`/`workbook` are not treated as unrelated. Groups must not share a term.
- **`scopeOverlap`** in `skillMdInspector.collision.weights` and in the per-pair
  metric breakdown shown in reports.

### Removed

- The vendor-specific validation profiles (`vscode`, `claude`, `codex`) and the
  `skillMdInspector.profile` setting: the generic profile is now the only
  validation policy, still adjustable through the existing override settings
  (`name.maxLength`, `description.minLength`/`maxLength`/`language`,
  `body.strictness`, `severityOverrides`, `severity.allowSpecificationOverrides`).
  A leftover `skillMdInspector.profile` entry in user settings is ignored, and
  generic validation behavior is unchanged.
- The profile-metadata rules and their diagnostics (`skill.metadata.reservedWord`,
  `skill.metadata.xmlTag`, `skill.metadata.fieldType`,
  `skill.metadata.unknownKey`), which only the vendor profiles defined.
- The cross-profile portability evaluation: the workspace report's
  "Format / portability compatibility" matrix, the compatibility lines in the
  Skills panel tooltip, and the `skill.portability.claude.descriptionLong` note.
- The unused static HTML renderer for OpenCode session reports
  (`renderOpenCodeSessionReportHtml`) and its orphaned support code: the
  `buildSessionViewModel` mapper, the compact session view-model types, and the
  `escapeHtml` helper in `src/opencode/util.ts`. The interactive timeline webview
  is and remains the only shipped report path; this resolves the dead-code item
  of audit finding N7. Trajectory behaviors the deleted render tests exercised
  (agent/subtask labels, retry error previews, tool attachments) are now asserted
  directly on the normalized session model.

### Changed

- **Collision detection now compares what skills _do_, not how alike they read.**
  A new `scopeOverlap` metric — the weighted geometric mean of artifact and
  capability agreement, built on features the extension already extracted — leads
  the composite at weight 0.70, and the four lexical metrics drop to corroboration.
  On the labeled benchmark corpus the four surface metrics measured **at or below
  chance** (AUC 0.47–0.53): genuine collisions are usually paraphrases that share
  little text, while two skills that merely share an artifact share a lot of it. The
  visible effects:
  - Two skills disambiguated by mutual boundaries (`Python 2 only` /
    `Python 3 only`) are no longer the highest-scoring pair in the workspace. The
    extension stopped penalizing the pattern its own diagnostics recommend.
  - `Extract from PDFs` vs `Create PDFs` now scores 0 on scope: same artifact,
    opposite capability.
  - Paraphrases with no shared wording (`Generate API docs` /
    `Produce schema descriptions`) are detected for the first time.
  - Capability and artifact synonyms fold, so `extract`/`retrieve` and
    `xlsx`/`workbook`/`spreadsheet` count as the same scope. Both tables are
    editable settings.
  - A skill's own `Do not use for ...` clause no longer counts toward what it does.
    A PDF reader that disclaims creating PDFs was previously credited with
    `create`.
  - Corpus-wide: recall 0.00 → 0.33, precision 0.00 → 1.00, AUC 0.533 → 0.726. The
    remaining gap to the target is documented in `benchmarks/README.md` rather than
    tuned away.
- **`skillMdInspector.collision.threshold` now defaults to 0.3** (was 0.4), and the
  risk bands to High ≥ 0.40 / Medium ≥ 0.35 (were 0.80 / 0.60). Both were derived
  from the corpus distribution. This changes what you see: the old bands were
  unreachable except by near-verbatim duplication, so in practice there was one
  band, and the old threshold reports almost nothing against a scope-led composite.
  A saved `collision.weights` object from before `scopeOverlap` existed keeps
  working — the missing key takes its default weight rather than disabling the new
  metric.
- **Non-Latin descriptions are compared instead of discarded.** Collision
  tokenization matched only `[a-z0-9]`, so two identical Russian descriptions and
  two unrelated ones both scored 0.17 — entirely from their names. Identical
  Cyrillic descriptions now score ~0.99 and unrelated ones stay below the threshold.
  Stopword lists are still English, so such pairs keep reporting low confidence.
- **A word outside the built-in dictionaries no longer decides your grade.** Two
  independent changes, and the description score on real shipped skills moved from a
  median of 60 to 79 (mean 62.9 → 76.7) as a result:
  - The seed dictionaries grew: 39 → 168 action verbs (including `-ise`/`-yse`
    spellings, so British English no longer scores as if it stated no capability),
    68 → 256 artifact hints, 10 → 74 multi-word artifacts. Harvested from real
    published skills rather than brainstormed. Words that name what a skill operates
    _on_ (`chart`, `model`, `index`, `label`, `profile`, `query`, `benchmark`) went
    to the artifact lists, not the verb list, so collision analysis keeps that
    signal.
  - A dictionary miss is no longer treated as proof of absence. `Pull tables from
PDF invoices…` used to score 59/weak against 100/excellent for
    `Extract tables from…` — 41 points and two label bands for a synonym. An opening
    shaped like a capability statement, or a token shaped like a domain term, now
    keeps the 59-point ceiling off and earns half the criterion, with a finding
    naming the word and the setting that would score it fully.
  - Non-English descriptions benefit too: `Formatiert PDF-Rechnungen…` is read as a
    stated capability. Latin-script only, and still marked language-limited.
  - Not fixed, and now documented in `docs/rules.md`: keyword stuffing still scores
    highly, because it has genuine dictionary evidence rather than a dictionary miss.
- A file extension is recognized more strictly: `Process foo.bar items` no longer
  counts as naming a concrete artifact, while `keybindings.json` and `CLAUDE.md`
  still do.
- **The two headline scores are now named after what they measure.** No scoring
  arithmetic changed — every score is byte-identical — only labels and headings:
  - Authoring quality labels are no longer `excellent | good | acceptable | weak |
poor` but `clean | minor-issues | issues | defects`. The checks look for
    structural defects, so the labels no longer read as praise for the content,
    and `clean` now requires a full 100 (no findings at all) instead of 90+.
  - "Instruction / Resource authoring quality" is now "Authoring hygiene
    (instructions)" / "Authoring hygiene (resources)"; the report section anchors
    are unchanged. "Heuristic Static Description Quality" is now "Description
    completeness". Both carry a one-sentence definition in a tooltip and hover:
    completeness counts convention coverage, hygiene counts structural defects,
    and neither judges whether the instructions are correct or safe.
  - Workspace report columns are now "Completeness" and "Hygiene".
- Collision results carry `textCoverage: 'full' | 'low'`. `low` means fewer than
  3 comparable content tokens on one side (typically non-Latin script), where all
  three text metrics return 0 and the similarity is derived mostly from the skill
  names; the report and tree now say so instead of showing a bare number.
- `skills.index.json` now has `schemaVersion` 6: collision objects gained the
  `textCoverage` field. Version 5 removed the `profileCompatibility` map from
  entries.

### Fixed

- **`only for X` / `limited to X` no longer damp a true collision.** Those
  phrases name the skill's scope, but collision analysis pooled them with the
  exclusion phrases, so two skills that both say "Only for PDF files" — i.e. a
  maximal overlap — had their composite reduced. The restricted scope now stays
  in the domain set and reads as a positive trigger; genuine `do not use for` /
  `except for` exclusions keep their full damping.
- **A description that fails validation as too long no longer scores in the top
  band.** Exceeding the configured `maxLength` zeroed the length criterion but
  imposed no ceiling, so a specification error still read as 90/"excellent". It
  now carries an `over-maximum-length` grade limitation with a ceiling of 59,
  matching the other essential failures. A description exactly at the maximum is
  unaffected, and the raw criterion score is unchanged.
- **A cancelled workspace scan no longer blocks on the similar-names pass.**
  `detectSimilarNames` now takes the same cancellation token as the collision
  detector and stops between rows, returning in under a millisecond at n=1000
  instead of ~2 s, and the analysis is marked partial when the token trips in
  either cross-skill phase. It also skips the edit distance for name pairs whose
  lengths differ by more than the threshold allows, which cannot change the
  result.
- **Common trigger phrasings are recognized.** `any time` / `anytime`,
  `in cases where`, `wherever`, and `on any` now count as scope conjunctions, and
  `Reach for`, `Consult`, `Refer to`, `Load`, and `Read this skill` count as
  usage lead-ins — previously only `use`-family lead-ins did, so an explicit
  "Use this skill any time a spreadsheet is the input" earned no trigger at all.
  The precision guards are unchanged: duration statements ("Runs for 10
  minutes"), bare third-person conditionals ("Applies fixes if…"), incidental
  "when the user" outside a usage context, and negated usage all still earn
  nothing. Bare `on` remains deliberately unrecognized so "Operates on large
  files" cannot fire.
- **Independent navigator views**: acting in the WORKSPACE view no longer
  refreshes the FAVORITES, INSTALLED AGENTS, and OPENCODE SESSIONS views.
  - Adding or removing a workspace root folder re-fires VS Code's
    configuration-change event; the handler now refreshes a sidebar view only
    when the specific setting that view reads actually changed value. INSTALLED
    AGENTS tracks `navigator.additionalRoots` and OPENCODE SESSIONS tracks its
    `openCode.*` discovery settings, so a folder add/remove (which changes
    neither) leaves them untouched. FAVORITES and the WORKSPACE tree read no
    `skillMdInspector` setting and are no longer refreshed on configuration
    changes at all.
  - Workspace file operations (creating a folder/file, deleting, pasting,
    renaming) are routed only to the views that depend on the changed file — the
    WORKSPACE tree and the Skills analysis panel — while FAVORITES refreshes only
    when the changed file is itself a favorite (its missing/exists badge flips).
    INSTALLED AGENTS (discovered from agent roots outside the workspace) is never
    touched, and saving a `SKILL.md` now refreshes only the Skills panel.
  - The favorite-star indicator still updates across views when favorites are
    toggled.
  - Every sidebar view refresh now logs a `[view-refresh]` reason line to the
    SKILL.md Inspector output channel, and activation writes a session marker.
    This makes the remaining full-reload case recognizable: adding/removing the
    first workspace folder (or turning a single-folder window multi-root)
    makes VS Code restart the extension host per the `updateWorkspaceFolders`
    API contract — the output channel resets and the marker reappears — and
    every view in the window reloads, which no extension can prevent.
- **Scoring heuristics**: decimals and version numbers ("3.14", "1.20") no
  longer count as a file-extension artifact; an uppercase ambiguous acronym as
  the sole clause token ("Use for STEP.") earns full trigger credit like any
  other acronym; hyphenated vague terms (`general-purpose`) are matchable
  (the token path split them, so they could never fire); phrase markers match
  typographic apostrophes ("Don’t use when ..." no longer leaks its inner
  "use when" as a positive trigger).
- **Weight normalization** integerizes custom weights to sum exactly 100
  (largest-remainder), restoring the invariant that per-criterion points sum
  to the published score; the good-length band no longer inverts when a
  profile sets `minLength` above 500.
- **Collision features**: trigger/boundary markers match on word boundaries —
  "do not use for" no longer fires inside "do not use formatting", which
  corrupted boundary separation and the composite collision score; custom
  multi-word artifact phrases are regex-escaped ("c++ template" crashed);
  capability extraction folds custom verbs with their own registry's
  form→base map; collision risk is banded on the same rounded similarity the
  report displays (no more "0.80 / Medium").
- **Word forms**: custom action-verb `replace`/`remove` lists are authoritative
  (irregular verbs were injected unconditionally; `write`/`read` joined the
  default registry so default behavior is unchanged); the misspelled
  single-consonant forms of CVC verbs (`formating`, `debuged`) are no longer
  recognized; irregular plurals singularize correctly
  (`analyses`→`analysis`, `series`, `movies`, `buses`); verb-form indexes are
  memoized per registry.
- **Parsing/validation**: inline code inside a link is no longer scanned twice
  (duplicate diagnostics); body-section alias phrases match on token
  boundaries ("Counterexample usage" no longer satisfies Examples); fenced-code
  tracking pairs `with` and `~~~` with `~~~`; the placeholder scan covers
  headings and ignores real HTML with attributes; frontmatter fences tolerate
  trailing whitespace; duplicate-key ranges point at the last (effective)
  occurrence.
- `buildImprovedDescription` analyzes with the caller's custom dictionaries,
  so a custom trigger phrase suppresses the appended "Use when ..." template.

- **Trigger/boundary clause detection** now derives its marker vocabulary from
  the `triggerPhrases.ts` registries (single source of truth) instead of a
  duplicated inline list. This fixes three scoring bugs: the canonical
  "Use this skill when ..." and "Trigger when the user ..." forms earned no
  trigger credit, and a purely negative sentence such as "Not intended for X"
  was credited as a _positive_ trigger.
- Negative boundary phrases are stripped from a sentence before positive-trigger
  matching, so no fragment embedded in a negation ("use when" inside
  "do not use when", "intended for" inside "not intended for") can count as
  positive evidence.
- A scope clause whose tail names a single concrete artifact or acronym
  ("Use for SQL.") now counts as meaningful content; the vague-tail and
  stopword lists were expanded.
- Plain "Use when ..." at the start of a description now satisfies the
  front-loaded-intent check (previously only "Use this skill when ..." did),
  and vague words can no longer serve as the front-loaded "object".
- The vagueness penalty now scales with the configured criterion weight, and
  the public score is always an integer clamped to 0–100 under custom weights.

### Changed

- **Authoring quality** findings now carry a severity (`major` / `moderate` /
  `minor`) with weighted penalties, so an empty instruction body no longer
  costs the same as one unreferenced asset file. Empty-section detection is
  Markdown-aware (fenced code counts as content; a parent heading whose content
  lives in subsections is not empty), an unreferenced bundled script is
  reported as an undocumented script, and duplicate section headings are
  flagged.
- The static description benchmark corpus was re-curated: diverse hand-written
  cases with narrow score bands (≤ 25 points) replace the formulaic 0–100
  ranges, and the benchmark test now asserts the trigger, boundary,
  front-loaded, and language-limited expectations it previously ignored.
- Behavioral evaluation: suite loading rejects duplicate query ids and empty
  prompts; metric aggregation rejects duplicate or extra recorded runs instead
  of silently skewing counts.
- Legacy `triggerQualityScore` test files were renamed to
  `staticDescriptionQuality`, completing the terminology migration.

## 0.3.0 — MVP3 (Workspace Intelligence)

### Added

- **Workspace discovery** — recursively finds every `SKILL.md` (skipping
  `node_modules`, `.git`, and build output).
- **Skills tree view** in the Explorer showing each skill's status, Trigger
  Quality score, error/warning counts, profile, and resource graph.
- **Skill collision detection** using smoothed TF-IDF cosine similarity, with
  High/Medium/Low risk bands and shared-term reporting.
- **Workspace report webview** — collision matrix, portability matrix, and
  per-skill resource graphs.
- **Portability evaluation** across the `generic`, `vscode`, `claude`, and
  `codex` profiles, each with its own extra rules.
- **Resource graph** classifying resources as referenced/unreferenced/missing/
  remote/absolute and flagging scripts, binaries, and large files.
- **Export Skills Report Index** command that writes `skills.index.json`.
- Commands: Show Workspace Report, Export Skills Index, Refresh Skills.
- Unit tests for similarity, collision detection, workspace scanning, resource
  graph, portability, and workspace-report rendering.

## 0.2.0 — MVP2 (Description Quality Analyzer)

### Added

- **Static Description Quality Score (0–100)** for every `description`, computed across
  seven weighted criteria (action verb 20, usage trigger 20, concrete artifact
  15, boundary 15, front-loaded intent 10, low vagueness 10, good length 10),
  with `excellent`/`good`/`acceptable`/`weak`/`poor` labels.
- Score and a per-criterion breakdown (points earned/possible) in the Skill
  Report webview.
- Information diagnostics for a missing boundary (`skill.description.noBoundary`)
  and non-front-loaded intent (`skill.description.notFrontLoaded`) that explain
  lost points.
- **Improve Description Locally** command — deterministic, no-LLM rewrite that
  preserves existing wording and appends missing trigger/boundary clauses (or
  offers the full template for poor descriptions).
- Unit tests for scoring behavior and the local rewrite/suggestions.

## 0.1.0 — MVP1

Initial release: a deterministic linter for `SKILL.md` files.

### Added

- YAML frontmatter parsing with missing / not-at-top / malformed detection.
- `name` validation (required, ≤ 64 chars, kebab-case, folder-name match).
- `description` validation (required, ≤ 1024 chars, min length, vagueness,
  action-verb, and usage-trigger checks).
- Markdown link validation (missing relative links, absolute local paths,
  remote and suspicious URLs).
- Unreferenced resource detection for `references/`, `scripts/`, `assets/`,
  and `templates/`.
- Body/section checks (missing body, examples, and "When to use").
- Quick fixes: kebab-case name, rename parent folder, insert frontmatter /
  name / description, insert body template, add "Use when…" / "Do not use
  when…" clauses, create missing linked file, add resource link.
- Commands: Validate Current Skill, Validate Workspace Skills, Insert SKILL.md
  Template, Show Skill Report.
- Read-only Skill Report webview.
- Settings for enabling validation, run-on-save, profile selection, and the
  name/description length limits.
- Inert `experimental.llmReview.enabled` setting and `llm/` provider interface
  reserved for future work.

## Unreleased

- Renamed the deterministic **Trigger Quality** result to **Static Description Quality** and `confidence` to heuristic `coverage`; it does not measure agent selection accuracy.
- Folder/name mismatches in recognized `skills/<name>/SKILL.md` packages are specification errors.
- Added offline static benchmark fixtures and a separate behavioral-trigger metrics framework.
- Resolved heuristic dictionaries are now passed through description reports, local improvements, and collision feature extraction. Scope-clause evidence includes the selected source offset and clause text.
- Added deterministic low-signal artifact evidence, separator-aware artifact matching, and uppercase protection for ambiguous acronyms such as CAN and STEP.
- Skill reports now show independent instruction and resource authoring-quality results; these scores are never averaged with description discoverability.
