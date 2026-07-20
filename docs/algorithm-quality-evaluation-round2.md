# Algorithm Quality and Robustness Evaluation — Second Pass

Date: 2026-07-20 · Baseline: `d5c9a6d` (four fixes landed since the first pass), 748/748 tests passing

This re-evaluates the project after the four priority fixes from
[the first pass](algorithm-quality-evaluation.md) (P1–P4) landed. It does three
things: (1) puts fresh adversarial eyes on the newly-changed code, including the
fixes themselves; (2) re-verifies which original findings still reproduce; and
(3) sweeps subsystems the first pass covered lightly (quick fixes, templates,
config, report rendering, navigation, extension wiring).

Method is unchanged: every **VERIFIED** finding was reproduced by executing a
scratch test against this checkout; **PLAUSIBLE** is code-reading only. The two
headline new findings (echo-cap bypass, quick-fix YAML corruption) were also
re-confirmed by hand. No production source was modified by this evaluation.

## Headline

The core is still well-engineered and three of the four fixes are a net
improvement, but this pass changes the risk picture in four ways:

1. **Two new HIGH-severity issues the first pass missed.** (a) The description
   quick fixes corrupt multi-line YAML values — a one-click "Add Use when…" fix
   can turn a valid `SKILL.md` invalid. (b) The `RenameParentFolder` quick fix has
   no path-containment check, so a malicious `name: ../../evil` in an untrusted
   `SKILL.md` yields a one-click folder rename to an arbitrary filesystem
   location. Both actively damage or endanger the user's files.
2. **The P4 fix is not just weak — it introduced a regression.** The
   keyword-stuffing cap is a point defense a scorer-aware author escapes with one
   word, AND its two halves interact destructively: dropping single-character
   tokens erases digit distinguishers, so a legitimate `"Python 2 … Python 3"`
   description now false-fires the echo cap and drops from 100 to 69. The gerund
   sub-fix also admits the noun phrases it was meant to reject when an artifact
   word is nearby.
3. **Everything else from the first report is still open.** All 17 previously
   unfixed findings reproduce unchanged on the current tree; the collision
   boundary inversion, portability-matrix inconsistency, non-ASCII invisibility,
   uncapped resource reads, and OpenCode aggregate-bound crashes are all live.
4. **The always-on editor path has correctness gaps** the first pass never
   examined: config settings that throw or escalate severity to Error on typos, a
   resource watcher scoped to the wrong directories, and ghost diagnostics left
   after close/delete.

On the positive side, a dedicated XSS/HTML-injection sweep of all three report
renderers and the script-enabled OpenCode webview found **no exploitable
injection** — escaping is disciplined and the interactive webview is built
entirely from DOM APIs.

---

## Status of the four landed fixes

| Fix | Verdict | Notes |
| --- | --- | --- |
| P1 — YAML `toJS()` guard | **Solid** | Only yaml call site in the repo; correct diagnostic + range; property-tested; billion-laughs and unresolved-alias both caught. No issues found. |
| P2 — rule isolation | **Solid, two small holes** | Works for realistic throws. But a non-stringifiable throw re-escapes the catch, and the new `internal` kind is itself silenceable. |
| P3 — collision O(n²) pre-pass | **Solid** | Bit-for-bit identical to the old path (`Object.is`-exact over 121 pairs + full-output equivalence); row-level cancellation works. Two minor edges. |
| P4 — description de-gaming | **Weak + regressive** | The echo cap is bypassable and, combined with the single-char-token drop, false-caps a legitimate `"Python 2/3"` description (regression). The gerund sub-fix admits noun phrases. |

### P2 holes

- **Non-stringifiable throw re-escapes isolation (LOW).**
  `ruleFailureDiagnostic` (`src/validation/ruleRegistry.ts:83`) calls
  `String(error)`. A rule throwing `Object.create(null)` or an object whose
  `toString` throws makes the catch block itself throw, so `runRules` throws
  again — the exact blank-all-diagnostics failure P2 fixed. Reachable only
  through the exported custom-rule API. **VERIFIED.** Fix: build the message
  defensively (`try { String(error) } catch { '<unstringifiable>' }`).
- **The new `internal` kind is silenceable (LOW, defeats the fix's intent).**
  Only `kind === 'specification'` resists severity overrides, so
  `severityOverrides: { 'skill.internal.ruleError': 'off' }` hides the
  rule-crash diagnostic — defeating "coverage loss is never silent." **VERIFIED.**
  (Same root cause as the still-open security-override hole below.)
- **Portability still calls validators bare (PLAUSIBLE).**
  `src/workspace/portability.ts:37-44` invokes the validators directly, outside
  the isolated `runRules`, and `toWorkspaceSkill` wraps only `readFileSync`. A
  throwing validator would still abort the whole workspace scan. No crafted input
  found that makes a built-in validator throw, so latent, not live.

### P3 edges

- **Complete result can be mislabeled `cancelled` (MINOR).**
  `src/workspace/analyzeWorkspace.ts:71-73` re-reads the cancel token *after*
  `detectCollisions` returns; a token that flips at that moment marks a fully
  complete result `cancelled: true`. Conservative direction, but "partial never
  presented as complete" became "complete presented as partial."
- **`detectSimilarNames` is still uncancellable O(n²) (MED, companion to P3).**
  P3 made `detectCollisions` cancellable but the sibling `detectSimilarNames`
  runs right after with the same pairwise Levenshtein shape and no cancel check
  (~2.3 s / ~500k pairs at n=1000 similar names). **VERIFIED.**

### P4: the echo cap is a point defense

`scopeContentEchoed` requires the trigger and boundary clauses' meaningful token
sets to be *exactly identical* (same tokens, no stemming — despite `singularize`
existing). Every trivial perturbation escapes it. **VERIFIED** (hand-confirmed):

| Description | Score |
| --- | --- |
| `Format PDF. Use when PDF. Do not use when PDF.` (the benchmarked salad) | **69** (capped) |
| `Format PDF. Use when PDF files. Do not use when PDF.` (superset) | **100** |
| `Format PDF. Use when PDF. Do not use when PDFs.` (plural) | **100** |
| `Format PDF. Use when files. Use when PDF. Do not use when PDF.` (decoy clause) | **100** |

Closing this properly needs normalized-token subset/overlap logic (fold plurals
and verb forms via the existing `wordForms` utilities) and comparison against all
clause candidates, not just the two selected clauses. As shipped, it only catches
the exact string in the benchmark.

**Regression — the echo cap and the single-char drop interact destructively
(HIGH).** Dropping single-character scope tokens erases the digit that
distinguishes two legitimately different scopes, and the echo cap then treats the
now-identical clauses as stuffing:

> `Convert Python 2 code to Python 3. Use for Python 2 code. Do not use for Python 3 code.`
> → trigger tokens `[python, code]` == boundary tokens `[python, code]` (the `2`/`3`
> were dropped) → **`echoed-scope-content`, adjusted 69** (was ~100 before P4).

Spelling the versions out (`Python two … Python three`) restores 100, confirming
the digit drop is the sole cause. **VERIFIED** by hand. This is a real
regression: a correct, well-scoped description is now penalized. The single-char
filter should keep digits (and short tokens that are the *only* content), or the
echo comparison should run on the full pre-filter tokens.

**The gerund sub-fix admits noun phrases (MED).** The 2-token object window
(`tokens.slice(1,3)`) accepts a gerund-headed noun phrase or gerund subject
whenever an artifact word is nearby — the exact thing the parallel
`"Formatting rules"` case is denied. `"Formatting JSON guidelines for authors."`
→ `actionVerb {found:true, matched:'formatting'}`, front-loaded — because "JSON"
sits in the window. **VERIFIED.** This both over-credits noun phrases and gives a
new upward-gaming vector (`"<Gerund> <artifact>…"` dodges the missing-capability
ceiling). The window should require the artifact to be the gerund's *direct
object* (immediately adjacent), not merely nearby.

Two smaller P4 items:

- **`markerSpansOverlap` span-length bug (LOW).**
  `src/quality/staticDescriptionQuality.ts:352-354` computes a marker span as
  `matchedOffset + matchedPhrase.length`, but `matchedPhrase` is the *dictionary*
  phrase while `phraseRegex` matches `\s+` between words. With ≥9 whitespace
  characters inside an exclusive marker (`Only          use when …`, reachable
  via a YAML literal block), the inner "use when" no longer registers as
  overlapping, so a legitimate exclusive trigger is falsely capped at 69.
  **VERIFIED.** Root cause: the clause machinery records the dictionary phrase,
  not `match[0]` — a structurally lossy offset that will bite any future
  span-based logic.
- **Stray-token collateral (LOW).**
  Dropping single-character scope tokens also drops a legitimately single-letter
  domain: `… Use when R.` went 85 → 70 (the "R" language token is now dropped).
  Narrow; `C`/`v2`-style cases are unaffected.

---

## New findings this pass (not in the first report)

### N1 — Description quick fixes corrupt multi-line YAML values (HIGH)

`src/codeActions/skillCodeActions.ts:205-224`. `appendToDescription` inserts the
clause at `document.lineAt(keyRange.startLine).range.end`, but
`frontmatterKeyRanges['description'].startLine` is the **key token's** line, not
the value's last line. For a folded/literal/quoted multi-line scalar the clause
lands on the wrong line:

- A valid skill with `description: >` / `  Formats things…` / `  across files.`
  that lacks a trigger clause is offered "Add Use when…" (`InsertUseWhenClause`).
  Applying it produces `description: > Use when <trigger context>.` → **the whole
  frontmatter re-parses as invalid** (`skill.frontmatter.invalid`; name and
  description now both read as missing). **VERIFIED** by hand: `parseFrontmatter`
  of the edited content returns `frontmatter === null`.
- A quoted multi-line description gets the clause spliced mid-sentence.
- `InsertDoNotUseClause` and the name fixes (`replaceKeyLine`,
  `descriptionInsertPosition`) share the root cause: every edit assumes
  single-line frontmatter values.

Multi-line block scalars are a YAML-recommended pattern for long descriptions, so
this is reachable on realistic files. A linter's quick fix must never turn a valid
file invalid. Fix: compute the edit position from the value node's end
(available via the YAML AST) rather than the key line.

### N1b — `RenameParentFolder` quick fix has no path-containment check (HIGH, security)

`src/validation/validateName.ts:63-74` emits the `folderMismatch` diagnostic with
`data: { expected: <raw frontmatter name> }` whenever the parent folder differs
from the `name` value — including when that name is not a valid kebab-case slug.
`renameFolder` (`src/codeActions/skillCodeActions.ts:174-189`) then does
`path.join(path.dirname(skillDoc.directory), expected)` with **no containment
check**. A malicious `SKILL.md` from an untrusted repository can therefore drive a
one-click rename of the skill folder to an arbitrary filesystem location:

> `name: ../../evil` in `/ws/skills/demo/SKILL.md` → `folderMismatch` diagnostic
> with `data.expected === '../../evil'` and the `fix.name.renameFolder` quick fix.
> **VERIFIED** (diagnostic + data reproduced by hand).

Every other file-operation quick fix (`createLinkedFile`) and the whole navigator
layer guard with `isPathInsideDir` / `safeRelative`; `renameFolder` is the one
that does not. Fix: reject `expected` unless it matches `NAME_PATTERN`, or apply
`isPathInsideDir` to the joined result. This is the only security-relevant
finding in the whole evaluation.

### N2 — Kebab-case name fix can produce an empty `name:` (MED)

`src/validation/validateName.ts:59` + `src/codeActions/skillCodeActions.ts:74`.
`toKebabCase` strips all non-ASCII-alphanumerics and returns `''` for a name with
no `[a-z0-9]` (CJK, Cyrillic, emoji). That empty string becomes `data.suggestion`,
and the **preferred** (auto-applicable) fix writes `name: ` — immediately
triggering `NameMissing`. The `suggestName()` path guards with
`kebab || 'skill-name'`; this path does not. **VERIFIED**
(`toKebabCase('日本語') === ''`). Fix: apply the same fallback.

### N3 — Collision numeric settings are not clamped in code (MED)

`src/config.ts:102-109`. Only `onlineCheckMaxConcurrency` is clamped;
`collision.ngramSize`, `threshold`, and `nameSimilarityThreshold` are read via
raw `cfg.get<number>` and trusted to the settings-schema `minimum`/`maximum`,
which VS Code does **not** enforce at runtime. `ngramSize: 0` makes `charNgrams`
emit only empty grams, so `cosineNormed` returns **1.0 for every pair** — with
n-gram-weighted settings, `detectCollisions` manufactures a similarity-1.0
High-risk collision between totally unrelated skills (invoice parsing vs sourdough
baking). Negative individual weights also pass (only the sum is checked).
**VERIFIED.** This is the config-layer source of still-open finding #5/#12.

### N4 — Malformed `severityOverrides` fall through to Error (MED)

`src/validation/index.ts:80` + `src/config.ts:81-82`. `applyProfileOverrides`
does `{ ...diagnostic, severity: override }` without validating
`override ∈ {error,warning,information,off}`. A natural typo
(`"skill.description.tooShort": "warn"`) passes through, and the VS Code mapping
(`src/diagnostics/mapping.ts`) then falls back to **Error** for the unknown
severity — the opposite of the intended downgrade. Inconsistently, specification
codes accidentally reject the same typo. **VERIFIED** (pass-through);
Error-fallback is PLAUSIBLE (vscode-runtime half).

### N5 — `createLinkedFile` can prepend a heading to an existing file (LOW)

`src/codeActions/skillCodeActions.ts:247-248`. `createFile(..., {ignoreIfExists:
true})` followed by an unconditional `insert(uri, (0,0), '# name\n')`. If the
target exists when the fix is applied (TOCTOU, or two missing links share one
target), the create no-ops but the insert still prepends to existing content.
**PLAUSIBLE.** Fix: pass the heading via `createFile`'s `contents` option.

### N6 — Editor-path robustness gaps (MED/LOW)

From the sweep of `config.ts` / `diagnosticsProvider.ts` / `extension.ts`:

- **`readConfig` throws on a mistyped array setting (MED, PLAUSIBLE).** A string
  `skillMdInspector.resources.directories` makes `config.ts:90-98` `.map` throw a
  TypeError *before* analysis; call sites are `void provider.validate(...)` with
  no catch, so diagnostics silently die (and `validateWorkspace` rejects its whole
  `Promise.all`). The dictionaries and templates paths validate `unknown`
  properly; the three `resources`/`discovery` array settings are the unhardened
  stragglers.
- **Resource watcher scoped to the wrong directories (MED, VERIFIED-by-reading).**
  `extension.ts:137-139` watches only `**/{references,scripts,assets,templates}/**`,
  but `resources.directories` is configurable *and* `discoverResources` walks
  every file in the skill directory. So creating/deleting a resource in a
  configured `docs/` dir, or any file next to `SKILL.md`, leaves stale discovery
  and stale unreferenced/missing-resource diagnostics until a config change or
  restart. The same watcher also fires unthrottled full revalidations for those
  folder names anywhere in the workspace.
- **Ghost diagnostics after close/delete (LOW, PLAUSIBLE).** `onDidClose` clears
  diagnostics but does not cancel the pending debounce timer, so a keystroke then
  close within 300 ms re-validates the closed document and republishes
  diagnostics nothing will clear; and `skillWatcher.onDidDelete` refreshes trees
  but never calls `provider.clear`, leaving Problems entries for deleted files.
- **"Superseded" reported as "disabled" (LOW, VERIFIED).** A stale/superseded
  validation resolves `undefined`, the same value as validation-disabled, so
  `validateCurrentSkill` tells the user "validation is disabled in settings" when
  the run was merely superseded by a concurrent one.
- **Template replacement-pattern injection (LOW, latent).** `renderPlaceholders`
  uses `replaceAll('{{name}}', context.name)`, whose replacement string interprets
  `$&`/`` $` ``/`$'`. Unreachable today because the only caller derives `name`/
  `title` through `toKebabCase` (which strips `$`); harden with a function
  replacer to close it structurally.

### N7 — Report defense-in-depth gaps (LOW, not exploitable today)

From the XSS sweep (which found no live injection): `renderWorkspaceReport.ts:188`
interpolates `node.flags.join(', ')` without `escapeHtml` (safe only because
`flags` is a closed enum with literal-only producers); CSP nonces use
`Math.random()` (safe only because those panels disable scripts); tree-provider
emitters in `extension.ts:61,63` are never disposed (reclaimed at host teardown);
`renderOpenCodeSessionReport.ts` is dead code (no `src/` caller). Harden the
escaping and disposal for future-proofing.

---

## Still-open findings from the first pass (all re-confirmed on this tree)

Every one of the 17 previously-unfixed findings reproduces unchanged. Grouped,
with the highest-impact five marked ★:

**Collision / similarity**
- ★ Boundary-separation **inversion**: "only for"/"limited to" tokens land in the
  *exclusion* set, so two skills targeting the same artifact get their score
  *reduced* (`boundarySeparation` = 0.2 for two PDF skills). `collisionFeatures.ts`.
- ★ **Stopword pollution**: "uses/skills/agents" normalize into stopwords that are
  never re-filtered → `sharedTerms=['use','skill','agent']`, jaccard 0.6 on
  unrelated skills. `detectSkillCollisions.ts:77-81`.
- ★ **Non-ASCII invisible**: identical Cyrillic/CJK descriptions → all text metrics
  0, no collision. `similarity.ts:15,162`.
- Unvalidated options (N3 above); no NFC on name keys; locale-sensitive sort.

**Parser / tokens**
- ★ **Uncapped resource read+tokenize**: multi-MB files read fully and
  synchronously; `sizeBytes` never consulted. `tokenUsage.ts:169-184`.
- Symlinked resources invisible; UTF-16 silently excluded; scheme-URI links
  (`data:`/`javascript:`) → false `LinkMissing` errors.

**Validation / authoring**
- ★ **Portability matrix lies**: a skill that *fails* full validation on a
  token-budget error is exported `profileCompatibility: pass` for every profile.
  `portability.ts:47-53`.
- Security-kind override hole (now also covers the P2 `internal` kind);
  authoring-scanner false positives (indented/blockquoted fences → score 0,
  TODO-triage prose, `## C#`); `docs/rules.md` folderMismatch drift.

**Online / OpenCode / eval**
- SSRF transient statuses (401/408/429/503) reported as broken warnings; three
  OpenCode aggregate-bound issues (spread-push stack overflow, recursive-stringify
  overflow, quadratic `deriveParentTime`); prototype-key tool names; unclamped
  negative token/cost; eval-lib accepts `runsPerQuery: 1e9` and ignores unknown
  query IDs.

**Description scoring**
- The O(n²) `nextMarker` hot spot in `assessScopeClause` is unchanged (P4 touched
  the file but not this loop); "Use only for X" word-order remains capped at 69
  (deliberately deferred in the P4 commit as entangled with the boundary-phrase
  inversion above).

A note on performance numbers: the *complexity shapes* (quadratic scaling,
uncapped reads) all reproduce exactly, but absolute millisecond constants run
~2.4–3.5× the first report's figures on this machine — timings are
machine-dependent; treat the shapes, not the constants, as the finding.

---

## Suggested order of work

1. **N1b (HIGH, security)** — add a containment/format guard to `renameFolder`;
   a one-click path traversal driven by untrusted frontmatter is the most serious
   item on the board.
2. **N1 (HIGH)** — fix the multi-line-YAML quick-fix corruption; a fix that
   damages a valid file. Compute edit positions from the YAML value node, not the
   key line.
3. **P4 regression + weakness** — this is code from this evaluation's own prior
   pass. Keep digits in scope tokens (fixes the `Python 2/3` false cap), tighten
   the gerund window to the direct object, and either close the echo cap properly
   (normalized-token overlap over all candidates) or drop it; as shipped it
   regresses a valid case and implies a protection that isn't there.
4. **★ collision correctness trio** — boundary inversion, stopword pollution, and
   option clamping (N3) all corrupt the headline collision score in different
   directions; fix together.
5. **★ portability matrix** — stop exporting "portable everywhere" for a skill
   that fails validation.
6. **★ uncapped resource read** — consult `sizeBytes` before reading; the
   always-on token pass is the most-run code with an unbounded input.
7. Remaining medium items — N2/N4/N6 editor-path hardening, P2 holes,
   `detectSimilarNames` cancellation, OpenCode aggregate guards, non-ASCII
   coverage signaling, docs drift.

## What remains genuinely strong

- **No XSS/HTML-injection** anywhere — three renderers escape every
  attacker-controlled field; the script-enabled webview uses DOM APIs only, with
  an allow-listed message channel and layered CSP.
- **P1, P2 (core), P3** are correct fixes: the YAML guard is complete, rule
  isolation contains realistic throws, and the collision pre-pass is provably
  score-identical with working cancellation.
- **Path-traversal and clobber defenses** in the code-action layer are layered and
  hold (in-root checks, `path.relative` containment, `ignoreIfExists`).
- **Dictionary resolution and the static/online merge** degrade safely: malformed
  dictionaries fall back to frozen defaults; stale online results are discarded on
  version/request/cancellation checks.
