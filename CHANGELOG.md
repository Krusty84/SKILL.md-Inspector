# Changelog

## Unreleased

### Added

- **`skill.link.caseMismatch`** (warning, compatibility): a relative link that
  matches a bundled file except for letter case is reported with the on-disk
  path — it resolves on macOS/Windows but breaks on case-sensitive systems.
  The mismatched resource still counts as referenced, so no spurious
  unreferenced-resource warning piles on.
- Reference-style Markdown links (`[text][id]` with `[id]: references/file.md`)
  are now extracted and validated: missing definition targets are reported and
  existing ones count as referencing bundled resources.

### Fixed

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
  tracking pairs ``` with ``` and `~~~` with `~~~`; the placeholder scan covers
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
  was credited as a *positive* trigger.
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
- **Export Skills Index** command that writes `skills.index.json`.
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
