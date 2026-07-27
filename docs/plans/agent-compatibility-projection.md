# Plan: per-agent compatibility projection (Claude Code, Codex, OpenCode)

Status: ready to implement · Baseline: `0d9bbc8` · Written: 2026-07-26

This plan is self-contained: a session with no prior context can implement it
end to end. Read it fully before changing code. The companion research
document `docs/body-validation-best-practices.md` (same branch) holds the
full sourced catalog behind the facts embedded here; this plan embeds every
fact the implementation needs, so no web research is required.

## 1. Feature definition

One `SKILL.md` is parsed and validated **once**, exactly as today. A new,
separate projection layer then evaluates the parsed skill against a table of
verified per-agent behavior and reports, **per agent**, a verdict and a list
of findings. The end user sees, in the single-skill report and the workspace
report, a section like:

| Agent | Verdict | Findings |
| --- | --- | --- |
| Spec (`skills-ref`) | issues | `context` is an unexpected field — the reference validator errors on it |
| Claude Code | compatible with notes | `allowed-tools` grants tools without prompting; review the grant |
| Codex | compatible with notes | `compatibility` is not in Codex's allowed field set; no Codex discovery path contains this skill |
| OpenCode | compatible | unknown fields are ignored by design |

Agents in scope for v1: **spec baseline (`skills-ref`), Claude Code, Codex,
OpenCode**. The table design must make adding Copilot/VS Code later a pure
data change (non-goal for this plan).

## 2. History constraint — read before designing

Commit `17baff3` (PR #57, 2026-07-22) **deleted** a previous vendor-profile
system: per-vendor validation profiles, a `skillMdInspector.profile` setting,
a profile-metadata rule engine (`skill.metadata.*` diagnostics), and a
workspace-report compatibility matrix (`src/workspace/portability.ts`). Do
not resurrect that code or that design. It failed for two reasons this plan
must not repeat:

1. **The old profiles were guesses.** The deleted `claudeProfile.ts` says
   verbatim: "Best-effort placeholder — reconcile with the live Claude Agent
   Skills spec." This plan replaces guesses with a sourced, dated capability
   table (§5) — every fact carries a source URL and a verified-on date, and a
   structural test enforces that.
2. **The old system forked validation.** Users picked one profile and
   validation itself changed. In this plan, validation stays single and
   generic — the projection is a **read-only layer on top of the already
   validated document**. It emits **no diagnostics** in v1: nothing in the
   Problems panel, no interaction with severity overrides, no change to
   validation status.

## 3. Scope

### New files

- `src/types/AgentCompatibility.ts` — types (§4).
- `src/compat/agentCapabilities.ts` — the capability table (data, §5).
- `src/compat/projectCompatibility.ts` — the projection function (§6).
- `test/agentCapabilities.test.ts`, `test/projectCompatibility.test.ts`,
  plus report-rendering assertions in the existing report tests.
- `docs/` note: extend `ARCHITECTURE.md` (quality-signals section) and
  `README.md` (features + "Understand the results"), add a `CHANGELOG.md`
  entry. No new entries in `docs/rules.md` — no new diagnostic codes exist.

### Modified files

- `src/ui/reportModel.ts` — carry the projection in the report model.
- `src/ui/renderReport.ts` — per-agent section in the single-skill report.
- `src/ui/renderWorkspaceReport.ts` — verdict matrix (skills × agents).
- `src/workspace/analyzeWorkspace.ts` + `src/types/Workspace.ts` — attach
  projections to per-skill records.
- `src/workspace/buildSkillsIndex.ts` — export projections; bump
  `schemaVersion` 6 → 7.
- Existing tests that pin schema version 6 (at least
  `test/notScoredQuality.test.ts` — "serializes the explicit state in skills
  index schema version 6" — and any index tests) must be updated to 7 in the
  same commit as the bump.

### Non-goals (do not do these)

- No new diagnostics, no Problems-panel output, no severity-override
  interaction. (The `skill.frontmatter.unknownField` / `toolSpecificField`
  diagnostics from the research doc are a separate follow-up; when built,
  they must read this same capability table.)
- No `skillMdInspector.profile`-style mode setting. No per-agent validation.
- No Copilot/VS Code column (data-ready, not shipped).
- No network access, no `vscode` imports anywhere under `src/compat/`.
- No behavior change to any existing rule, score, or benchmark. All three
  benchmark gates must pass untouched.

## 4. Types

```ts
export type AgentId = 'spec' | 'claude-code' | 'codex' | 'opencode';

export type CompatibilityVerdict =
  | 'compatible'
  | 'notes'        // works, but behavior differs in ways the author should know
  | 'issues'       // documented behavior says something is rejected/broken here
  | 'not-evaluated'; // input insufficient (e.g. frontmatter unparseable)

export interface CompatibilityFinding {
  agent: AgentId;
  level: 'issue' | 'note';
  /** Stable machine id, e.g. 'field-rejected', 'field-ignored',
   *  'no-discovery-path', 'dynamic-context-executes', 'substitution-applies',
   *  'name-dir-mismatch-enforced'. */
  kind: string;
  message: string;
  /** Frontmatter key or body feature the finding is about, when applicable. */
  subject?: string;
}

export interface AgentProjection {
  agent: AgentId;
  label: string;              // 'Spec (skills-ref)', 'Claude Code', …
  verdict: CompatibilityVerdict;
  findings: CompatibilityFinding[];
  notEvaluatedReason?: string;
}

export interface CompatibilityReport {
  projections: AgentProjection[]; // stable order: spec, claude-code, codex, opencode
  /** The capability table's verification date, e.g. '2026-07-26'. */
  verifiedOn: string;
}
```

Every capability fact in the table carries provenance:

```ts
interface CapabilityFact<T> {
  value: T;
  sourceUrl: string;
  verifiedOn: string; // ISO date
  confidence?: 'verified' | 'reported'; // default 'verified'
}
```

## 5. The capability table (the data — embed exactly this)

All facts below were verified on **2026-07-26** by fetching the cited source
or its published source repository. Facts marked `confidence: 'reported'`
came from a research summary of a fetched file rather than a verbatim quote —
keep them in the table but do not word report messages as certainties for
them.

### 5.1 Spec baseline (`skills-ref`)

Source: `https://agentskills.io/specification` (repo
`agentskills/agentskills`, `docs/specification.mdx`) and the reference
validator `skills-ref/src/skills_ref/validator.py`.

- Allowed frontmatter fields, exactly:
  `name, description, license, compatibility, metadata, allowed-tools`.
  The validator reports anything else as **"Unexpected fields"** (an error).
- `name`: 1–64 chars, lowercase letters/digits/hyphens, no leading/trailing
  hyphen, no consecutive `--`, **must match the parent directory name**
  (Unicode-normalized comparison).
- `description`: non-empty, ≤1024 chars. `compatibility`: ≤500 chars.
- `allowed-tools`: space-separated string, marked "Experimental".
- Body: "There are no format restrictions." Recommended ≤500 lines / <5000
  tokens (already covered by existing token rules — the projection must NOT
  duplicate those findings).

### 5.2 Claude Code

Source: `https://code.claude.com/docs/en/skills` (fetched directly).

- Accepts the spec fields **plus** (all optional): `when_to_use`,
  `argument-hint`, `arguments`, `disable-model-invocation`, `user-invocable`,
  `allowed-tools`, `disallowed-tools`, `model`, `effort`, `context` (`fork`),
  `agent`, `background`, `hooks`, `paths`, `shell`. Unknown fields are
  tolerated; malformed YAML degrades to "body with empty metadata".
- `name` is optional, defaults to the directory name, display-only for
  non-plugin skills → a name/directory mismatch is a **note** here, not an
  issue.
- `allowed-tools` is honored: tools it names run **without a permission
  prompt** during the invoking turn → presence is always a `note`
  ("review the grant"), never silent.
- Body substitutions (verified semantics): `$ARGUMENTS`, `$ARGUMENTS[N]`,
  `$N`, `$name` for names declared in `arguments:`; substitution runs once
  over the original file **including fenced code**; a declared name with no
  matching argument expands to an **empty string**; unmatched `$N` stays
  literal; escape is `\$` and only before a digit, `ARGUMENTS`, or a declared
  name. → If the body contains `$ARGUMENTS`/`$N`/declared `$name` tokens,
  emit a `note` for Claude Code ("substituted at invocation") and a `note`
  for other agents ("stays literal text").
- Dynamic context: `` !`command` `` (only at line start or after whitespace)
  and ```` ```! ```` fenced blocks execute **at load time, before the model
  reads the content**; `disableSkillShellExecution` disables. → `note` on
  Claude Code, phrased as load-time execution to review; `note` on other
  agents ("inert text").
- Discovery: project `.claude/skills/<name>/SKILL.md`, personal
  `~/.claude/skills/`, plugins.

### 5.3 Codex

Sources: `github.com/openai/codex`,
`codex-rs/core-skills/src/loader.rs` (constants verbatim) and the bundled
skill-creator validator
`codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py`.

- Limits (verbatim constants): `MAX_NAME_LEN = 64`,
  `MAX_QUALIFIED_NAME_LEN = 128`, `MAX_DESCRIPTION_LEN = 1024`. Missing
  frontmatter / missing `description` are load errors. `name` defaulting to
  the directory name is `confidence: 'reported'`.
- Bundled validator's allowed set:
  `name, description, license, allowed-tools, metadata` — **no
  `compatibility`** → a `compatibility` field is a `note` for Codex
  ("outside Codex's validated field set"), not an issue (the loader
  tolerates it; only their validator flags it).
- Codex convention: `metadata.short-description` (verified in OpenAI's own
  published skill). Never flag `metadata` contents for any agent.
- Discovery: repo `.agents/skills/` scanned from cwd up to the repository
  root; `~/.agents/skills/`; legacy `$CODEX_HOME/skills`; admin
  `/etc/codex/skills`. Filename constant is exactly `SKILL.md`.

### 5.4 OpenCode

Source: `https://opencode.ai/docs/skills` (repo `anomalyco/opencode`,
`packages/web/src/content/docs/skills.mdx`).

- `name` rules verbatim-match the spec (1–64, lowercase alphanumeric with
  single hyphen separators, no leading/trailing `-`, no `--`, must match the
  containing directory). `description` 1–1024.
- Optional fields: `license`, `compatibility`, `metadata` (string map).
- **Unknown frontmatter fields are ignored** → unknown fields are at most a
  `note` for OpenCode.
- `allowed-tools` is **not read**; permissions live host-side in
  `opencode.json` → if `allowed-tools` is present, `note`: "ignored;
  OpenCode permissions are configured in opencode.json".
- Discovery: project `.opencode/skills/`, `.claude/skills/`,
  `.agents/skills/` (walking up to the git worktree); global
  `~/.config/opencode/skills/`, `~/.claude/skills/`, `~/.agents/skills/`.

### 5.5 Discovery-path matrix (derived from the above)

Match on path segments of the skill's directory (pure string matching on the
already-known skill path; no filesystem access):

| Path contains | spec | claude-code | codex | opencode |
| --- | --- | --- | --- | --- |
| `.claude/skills/` | n/a | yes | no | yes |
| `.agents/skills/` | n/a | no | yes | yes |
| `.opencode/skills/` | n/a | no | no | yes |
| `.github/skills/`, bare `skills/` | n/a | no | no | no |

"No" here means: no verified documentation says the agent scans that
location — word the finding as "no documented <agent> discovery path
contains this skill", `level: 'note'` (the user may install it elsewhere).
The spec column is n/a: the spec does not define discovery. When the skill
path contains none of the known segments, emit the note for every agent
rather than guessing.

## 6. Projection logic

`projectCompatibility(doc: SkillDocument, capabilities): CompatibilityReport`
— pure, deterministic, synchronous, no I/O. Inputs it may use: parsed
frontmatter keys and values, the body text, the skill file path, and the
already-parsed links. It must not re-run validation and must not read files.

Per agent:

1. **Frontmatter fields.** For each present top-level key, classify against
   that agent's field table: rejected-by-validator (`issue` for `spec` only,
   since `skills-ref` errors), ignored (`note`), honored-with-consequence
   (`note`, e.g. `allowed-tools` on Claude Code), honored silently (no
   finding). Never inspect inside `metadata`.
2. **Name/directory relationship.** Mismatch → `issue` for `spec` and
   `opencode` (both document the requirement), `note` for `claude-code`
   (name is display-only there), `note` for `codex` (directory-default is
   `reported`-confidence). Do not re-implement the comparison — reuse the
   existing mismatch signal if exposed, else the same normalized comparison
   the validator uses.
3. **Discovery path.** §5.5.
4. **Body features.** Detect `` !`…` `` (line start/whitespace rule) and
   ```` ```! ```` blocks; `$ARGUMENTS`/`$ARGUMENTS[N]`/`$N` tokens; declared
   `arguments:` names appearing as `$name`. Emit the per-agent notes from
   §5.2. Detection must ignore ordinary fenced code for the dynamic-context
   inline form only when `!` follows a non-whitespace character (that is the
   verified non-trigger case).
5. **Verdict.** `issues` if any `issue`-level finding; else `notes` if any
   finding; else `compatible`. If `doc.frontmatter === null` → every agent
   `not-evaluated` with reason "frontmatter could not be parsed" (mirror the
   wording style of the existing not-scored states).

Determinism requirements: stable agent order (spec, claude-code, codex,
opencode), stable finding order (frontmatter findings in document key order,
then name, discovery, body), stable messages.

## 7. Report rendering

- **Single-skill report**: new "Agent compatibility" section — the table from
  §1, one row per agent, findings as an escaped list. Footer line, verbatim
  requirement: *"Based on documented behavior verified on {verifiedOn}. This
  is a static projection, not a runtime test — it does not prove an agent
  will select or correctly execute the skill."* Renders through the existing
  escaped, script-disabled HTML path; anchors join the existing TOC.
- **Workspace report**: a matrix (rows = skills, columns = the four agents,
  cells = verdict). Cells for `not-evaluated` must render as text
  "not evaluated", never as an empty/zero-like cell (house rule).
- **Skills index**: per-skill `compatibility` object (projections without
  the label strings), `schemaVersion: 7`.

## 8. Reproduce first (write these failing tests before implementation)

House discipline: tests first, then code. Suggested concrete cases:

1. **Table integrity**: every agent present; every fact has non-empty
   `sourceUrl` and ISO `verifiedOn`; spec allowed-field set is exactly the
   six fields of §5.1 (guards against casual edits without sources).
2. **Field classification**: a skill with `context: fork` →
   spec `issues` (finding kind `field-rejected`), claude-code no finding for
   that key, codex `note`, opencode `note` (ignored).
3. **`allowed-tools` semantics**: present → claude-code `note`
   (grant review), opencode `note` (ignored, host-side), codex no finding,
   spec no finding (experimental but allowed).
4. **Name mismatch**: `name: alpha` in directory `beta/` → `issue` for spec
   and opencode, `note` for claude-code and codex.
5. **Discovery**: path containing `.opencode/skills/` → notes for
   claude-code and codex, none for opencode; unconventional path → notes for
   all three tools.
6. **Dynamic context**: body line `` !`git status` `` → claude-code note
   mentioning load-time execution; codex/opencode notes "inert text";
   `` KEY=!`cmd` `` (mid-token) → no finding anywhere.
7. **Not-evaluated**: unparseable frontmatter → all four agents
   `not-evaluated`, and the workspace matrix renders the words
   "not evaluated".
8. **Determinism**: projecting the same document twice yields deeply equal
   results; agent and finding order stable.
9. **Schema**: `buildSkillsIndex` emits `schemaVersion: 7` and the
   `compatibility` block; update the existing version-6 assertions.

## 9. Acceptance criteria

- All §8 tests pass; the full suite, all three benchmark gates,
  `check-types`, `lint`, `check:heuristic-dictionaries`, and `build` pass.
- No new diagnostic codes exist; `git grep 'skill\.' src/types/DiagnosticCode.ts`
  is unchanged.
- The single-skill report of `demo_skills/skills/pdf-form-filler/` shows the
  new section with four rows and the verbatim footer line of §7.
- No file under `src/compat/` imports `vscode`, `fs`, `http`, or reads the
  clock (`grep -rn "from 'vscode'\|require('fs')\|Date.now" src/compat/`
  returns nothing) — `verifiedOn` comes from the data table, not the clock.
- `README.md` "Understand the results" gains a paragraph stating what the
  projection is and is not (reuse the footer sentence); `ARCHITECTURE.md`
  documents the layer and the PR #57 history constraint; `CHANGELOG.md`
  entry added.

## 10. Verification checklist

```bash
npm run check-types && npm run lint && npm test && npm run benchmark \
  && npm run check:heuristic-dictionaries && npm run build
```

Repo mechanics the implementing session must know: `src/quality/`,
`src/workspace/`, `src/analysis/`, `src/validation/` (and now `src/compat/`)
are deliberately `vscode`-free and deterministic; `npm run lint` covers
`src/` only; dictionary defaults in `package.json` are generated — this plan
does not touch dictionaries, so no sync step is needed; benchmark corpora
must not be edited to make anything pass.

## 11. Follow-ups explicitly out of scope

Recorded so they are not accidentally pulled in: the
`skill.frontmatter.unknownField` / `toolSpecificField` diagnostics (research
doc, Tier 1 — must consume this table when built); a Copilot/VS Code column;
surfacing projections in tree tooltips; any refresh of the capability data
itself (when refreshed, update `verifiedOn` per fact and re-run the table
integrity test).
