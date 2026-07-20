# Algorithm Quality and Robustness Evaluation

Date: 2026-07-20 · Baseline: `699c78f`, 725/725 tests passing

## Scope and method

This report evaluates the key algorithms of SKILL.md Inspector and their
implementations:

- **Static Description Quality** — the two-tier, dictionary-driven description scorer;
- **Instruction / resource authoring quality** — structural-hygiene detection in the body;
- **Validation registry and profiles** — the rule pipeline and severity policy;
- **Workspace collision and similarity** — the multi-metric overlap detector and portability matrix;
- **Parser and document model** — frontmatter, links, headings, path containment, resource discovery;
- **Offline token measurement** — `o200k_base` tokenization and file classification;
- **SSRF-protected remote-link checker** — the opt-in network availability probe;
- **OpenCode import pipeline and offline evaluation metrics** — tolerant JSON import and confusion-matrix math.

Method: six independent deep reviews (one per subsystem cluster) plus a hand
review of the core scoring, similarity, parser, and network code. Every finding
marked **VERIFIED** was reproduced by executing a scratch Vitest test against
this checkout, using the project's own injectable seams — no real network
requests. **PLAUSIBLE** findings come from code reading only. Scratch tests were
removed after execution; no production source was modified by this evaluation.
The four headline findings (P1, P3, and the two gaming cases) were additionally
re-verified by hand.

## Overall verdict

The engineering discipline here is well above typical for this class of tool.
The canonical pipeline really is deterministic and testable; core algorithms are
implemented correctly (the Levenshtein routine was cross-checked against a
reference on 500 random pairs; tokenizer usage, largest-remainder weight
normalization, and the confusion-matrix math are exact); the "not-scored instead
of a silent zero" principle is genuinely implemented for description quality; and
the SSRF defense survived a dedicated bypass hunt with **no bypass found**.

The weaknesses cluster into four recurring themes rather than being scattered
randomly:

1. **The no-throw pipeline contract is not enforced at its boundaries.** One
   unguarded YAML call can crash all analysis for a file; one throwing rule
   aborts the whole validation run.
2. **Per-item limits with unbounded aggregates.** Several algorithms are safe on
   realistic input but quadratic or uncapped along a dimension that adversarial —
   or merely unusual — input can inflate: marker-heavy descriptions, 1000-skill
   workspaces, multi-MB resources, malformed session exports.
3. **Presence-based heuristics are gameable upward and harsh downward.** Keyword
   stuffing can reach 100 / "excellent" while legitimate phrasings are capped two
   label bands below their semantically identical twins.
4. **Silent coverage loss where the project's own principle demands an explicit
   "not scored".** Non-ASCII collision analysis, UTF-16 resources, symlinked
   resources, and the portability matrix all under-report instead of surfacing
   reduced coverage.

None of these is fatal to the product; all are fixable without architectural
change. The SSRF checker needs essentially no correctness work. The description
scorer needs the most design attention, because its numbers are user-facing and
currently reward the wrong thing at the margins.

### Subsystem ratings

| Subsystem | Design | Implementation robustness |
| --- | --- | --- |
| Remote-link checker (SSRF) | Excellent — defense in depth, no bypass found | Strong; minor status-semantics nits |
| Parser & document model | Strong — pure, AST-precise, injectable | One HIGH crash path; encoding/symlink blind spots |
| Static Description Quality | Excellent transparency (two-tier score, coded ceilings) | Semantically brittle at edges; gameable; one perf hot spot |
| Collision & similarity | Sound multi-metric ensemble, correct math | O(n²) recomputation; boundary-semantics inversion; ASCII-only |
| Validation registry & authoring quality | Solid data-driven registry, type-enforced modes | No rule isolation; Markdown-scanner false positives; docs drift |
| Token measurement | Correct, offline, deterministic | No size caps; UTF-16/symlink exclusions are silent |
| OpenCode import & eval metrics | Tolerant-by-design; metrics exactly correct | Aggregate-bound gaps (stack overflow, quadratic pass) |

---

## Priority findings

The items that most change what to do next, in order.

### P1 — Unresolved YAML alias crashes the entire analysis pipeline (HIGH)

`src/parser/parseFrontmatter.ts:182` calls `doc.toJS()` unguarded. A value
beginning with `*` — e.g. `description: *required*`, a plausible
Markdown-emphasis-in-YAML typo — makes the `yaml` library throw
`ReferenceError: Unresolved alias (the anchor must be set before the alias)` from
`toJS()`. This error does **not** appear in `doc.errors`, so the fatal-error
early return at lines 172–180 never fires. Nested-alias bombs ("billion laughs")
throw `Excessive alias count` from the same call. Nothing up the stack catches
it: `DiagnosticsProvider.validate` (`src/diagnostics/diagnosticsProvider.ts:47`)
has no try/catch, so editor diagnostics silently stop updating on every
keystroke; in workspace validation the rejection aborts the `Promise.all`
mid-scan. **VERIFIED** (re-confirmed by hand: `parseFrontmatter` and
`analyzeSkill` in text-only mode both throw `ReferenceError`).

Fix: wrap `doc.toJS({ maxAliasCount: … })` in try/catch and emit
`FrontmatterInvalid`. A "parseFrontmatter never throws" property test is the
obvious missing companion to the existing property suite and would have caught
this immediately.

### P2 — No rule isolation in the validation registry (MEDIUM)

`src/validation/ruleRegistry.ts:63-68` runs each rule bare, and there is no
try/catch in `runAllValidations` or `DiagnosticsProvider.validate`. Any single
rule that throws — a custom rule injected through the exported `rules` parameter,
or a built-in meeting unexpected input — aborts the whole validation run and, in
the editor, leaves the previously published diagnostics stale. The registry's
"isolation" is therefore nominal. **VERIFIED** (a throwing rule inserted into the
registry made the whole run throw). Fix: wrap each `rule.run` in try/catch,
convert a throw into an internal diagnostic, and continue.

### P3 — Collision analysis is O(n²) with per-pair recomputation and is uncancellable (HIGH)

`src/workspace/detectSkillCollisions.ts:80-118` recomputes per-skill quantities
inside the pair loop: `charNgramSimilarity` rebuilds both n-gram frequency maps
every pair, and `boundarySeparation` re-runs `domainTokens`/`boundaryTokens`
(strip ~18 marker regexes + tokenize + normalize, both directions) every pair.
Measured wall-clock on realistic ~230-char descriptions: N=100 → 1.7 s, N=200 →
6.9 s, N=400 → 26.7 s, **N=1000 → 177 s**, a clean quadratic at ~355 µs/pair,
~83% of it recomputation. The phase runs synchronously on the extension host and
`analyzeWorkspace.ts:50-72` checks cancellation only in the per-file loop, so the
collision phase cannot be aborted — a 1000-skill workspace is a multi-minute
un-cancellable freeze. **VERIFIED** (timing harness). Fix: hoist per-skill n-gram
vectors and domain/boundary token sets to an O(n) pre-pass, and check the
cancellation token inside the pair loop.

### P4 — Description scoring is easy to game upward and harsh downward (HIGH design issue)

Every evidence signal is presence-based with near-zero content validation, so the
score reflects conformance to the dictionary's phrase templates as much as
description quality. Both directions are verified:

- **Bad → high.** `"Format PDF. Use when PDF. Do not use when PDF."` →
  **100 / excellent**, full marks on all seven criteria, because "≥1 non-stopword,
  non-vague token after a marker" counts as concrete scope. **VERIFIED** (hand
  re-confirmed).
- **Tokenizer artifact inflates further.** `tokenize` emits a stray `s` token from
  `it's`, and it survives the stopword/vague filters as "meaningful" content:
  `"Format PDF reports. Use when it's needed."` → **85**, while the semantically
  identical `"…Use when needed."` → **65** (and keeps its vague-trigger ceiling).
  **VERIFIED** (hand re-confirmed: 85 vs 65).
- **Good → low.** A gerund lead plus the hard 59 ceiling drops a clear description
  two label bands below its twin: `"Converting CSV exports into clean JSON
  tables. Use when a data file needs conversion. Do not use for binary formats."`
  → **59 / weak**, while the `"Convert…"` twin → **100 / excellent**. **VERIFIED**
  (hand re-confirmed: 59 vs 100). Word-order brittleness compounds it: `"Use only
  for …"` matches no trigger phrase (the restrictive `"only for"` claims the
  boundary instead), so a precise description is capped at 69 while its `"Only use
  for …"` twin scores 100.

These are design consequences, not a single bug: shallow correlated signals
saturate the additive score, and the coded ceilings turn single stylistic misses
into large drops. Recommended direction: require ≥2 *distinct* meaningful tokens
for scope content, drop the stray-`s` token, scan beyond the first sentence for a
capability verb before applying the 59 ceiling, and treat capability enumeration
separately from embedded procedure (see the instruction-heavy note below).

### P5 — Aggregate-bound crashes in the OpenCode importer (MEDIUM)

Three "bounded per-item, unbounded aggregate" gaps, each verified and each caught
at the two entry points (so they degrade to a skipped file or an error toast, not
an extension crash):

- `src/opencode/parseSessionExport.ts:42` spread-pushes uncapped diagnostics
  (`diagnostics.push(...validateSessionCompatibility(value))`); ~24,000 empty
  messages (~72 KB, far under the 25 MB size cap) overflow the call stack in a
  function whose contract is to *return* `{fatal:true}`. **VERIFIED.**
- Recursive `JSON.stringify` in preview generation
  (`src/opencode/util.ts:31-38`, reached from `buildTrajectory.ts:310`;
  same shape in `timelineViewModel.ts:536-545`) overflows on 100k-deep nested
  JSON that `JSON.parse` accepts. **VERIFIED.**
- `deriveParentTime` (`src/opencode/buildTrajectory.ts:370-383`) does `all.find`
  per child over all messages → O(messages²): 2k msgs = 109 ms, 8k = 1038 ms.
  **VERIFIED.** A nodes-by-id `Map` (one already exists at line 387) fixes it.

---

## Findings by subsystem

Severity: **H** high, **M** medium, **L** low. All are VERIFIED unless marked PLAUSIBLE.

### Static Description Quality (`src/quality/`)

- **H** — Keyword-salad → 100; stray-`s` token upgrades vague triggers (see P4).
- **M** — Word-order blindness: `"use only for"` is claimed by the boundary
  dictionary, so a precise trigger is capped (`descriptionHeuristics.ts:317-331`).
- **M** — Gerund lead + first-sentence-only capability scan + hard 59 ceiling
  under-scores common good phrasings (`descriptionHeuristics.ts:251-303`,
  `staticDescriptionQuality.ts:229-235`).
- **M** — Instruction-heavy trip-wire counts any verb-initial sentence as a
  workflow marker, so a long *descriptive* capability enumeration (four
  "Generate… Convert… Validate… Summarize…" sentences, 542 chars) is capped at 74
  (`descriptionHeuristics.ts:136-141`).
- **M** — File-extension regex `/\.(?!\d+\b)[a-z0-9]{2,4}\b/i` false-positives on
  missing-space typos (`"meetings.Use"`) and version suffixes (`"2.5b"`), granting
  high-signal artifact credit and lifting the missing-artifact ceiling
  (`descriptionHeuristics.ts:434`).
- **M** — Negation-exclusion window backs up only `negative.length + 2` chars, so
  a wrapped/indented negative phrase (realistic in a YAML block scalar) lets the
  *negated* clause earn positive-trigger credit and boundary credit at once
  (`descriptionHeuristics.ts:336-343`).
- **L/M** — O(n²) `nextMarker` computation with no input-size guard: a hostile
  marker-dense description of 528 KB blocks the host ~6.5 s (66 KB → 395 ms,
  264 KB → 2.9 s). Fix: sort occurrences once (`descriptionHeuristics.ts:346-353`).
- **L** — `vagueTerms` entry `"improves"` is stored inflected while matched
  form-exact, so only that surface form is flagged
  (`defaultHeuristicDictionaries.json:76`).
- **L** — `buildImprovedDescription('… reports!')` yields `"reports!. Use when…"`
  (double punctuation) (`improveDescription.ts:28`).
- **L** (PLAUSIBLE) — ASCII-only `\b` in `phraseRegex` can match markers glued to
  non-Latin letters; bare-verb boundary markers `"exclude"/"excluding"` claim
  boundary credit for ordinary capability sentences (`textMatch.ts:20`).

Design notes worth keeping: the two-tier `rawScore`→`adjustedScore` split with
coded, visible ceilings is genuinely well done; not-scored handling is principled;
morphology is correct for English within scope (every CVC verb in the default
registry — the `inflect()` routine lacks consonant doubling — carries explicit
forms, so `refactor`/`render` are the only registry gaps and both are non-CVC).

### Collision & similarity (`src/workspace/`)

- **H** — O(n²) uncancellable recomputation (see P3).
- **M** — Boundary-separation semantic inversion: `restrictiveBoundaryPhrases`
  includes `"limited to"`/`"only for"`, which declare *inclusion* scope, but the
  code treats the following clause as *excluded* scope — so two skills competing
  over the same artifact get their collision score *reduced*
  (`collisionFeatures.ts:109-117,159-169`). `"except/exclude"` entries are fine.
- **M** — Stopwords filtered before normalization: `"uses"/"skills"/"agents"`
  survive the raw-token filter, then normalize into stopwords `use`/`skill`/`agent`,
  inflating Jaccard/cosine and polluting `sharedTerms`
  (`similarity.ts:10-18` vs `detectSkillCollisions.ts:72-76`).
- **M** — Non-ASCII descriptions are invisible to every text metric: identical
  Russian descriptions score cosine=jaccard=charNgram=0 and yield no collision
  (`similarity.ts:15,130`).
- **M** — Portability matrix inconsistent with full validation: a skill failing a
  token-budget *error* shows `validationStatus: 'fail'` yet `pass` for all four
  profiles, because `evaluatePortability` composes only a subset of rules and
  never applies profile overrides (`portability.ts:33-71`).
- **L** — No Unicode NFC on name keys: NFC vs NFD `"café-helper"` escape
  hard-conflict detection and surface only as a weak "similar name"
  (`detectNameConflicts.ts:17`, `similarity.ts:115-121`).
- **L** — Collision options unvalidated: negative individual weights pass;
  `ngramSize: 0` yields charNgram = 1.0 for unrelated text; `threshold` /
  `boundarySeparationWeight` are unclamped from config
  (`detectSkillCollisions.ts:66-69,173-184`, `config.ts:103-115`).
- **L** — Comma is not a clause terminator, so `"Do not use for contracts, use it
  for invoices"` folds the skill's own positive scope into its exclusion zone
  (`collisionFeatures.ts:23`).
- **L** — `analyzeWorkspace.ts:62` sorts names with locale-sensitive
  `localeCompare` (no locale arg), so export/report order differs across machines
  despite the "deterministic output" goal. Pass `'en'` or use a code-unit compare.

The ensemble itself (Jaccard + smoothed TF-IDF cosine + char-3-gram cosine +
normalized Levenshtein, boundary-reduced) is standard, symmetric (property-tested),
and correctly implemented; weights/threshold/bands are brief-derived but not
empirically calibrated, and there is no collision benchmark corpus (there is one
for description quality).

### Validation registry & authoring quality (`src/validation/`, `src/authoring/`)

- **M** — No rule isolation (see P2).
- **M** — Unclosed-fence scanner accepts unlimited leading whitespace, so an
  indented (4-space) code block showing an opening fence is misread as a real
  unclosed fence — a max-severity finding that zeros the authoring score
  (`authoringQuality.ts:356-366`).
- **M** — Placeholder detection runs `\bTODO\b|\bFIXME\b` over prose and inline
  code, so a skill *about* TODO triage is always flagged (`authoringQuality.ts:197-208`);
  `isPurePlaceholder` at line 402 knows the right test but the finding doesn't use it.
- **M** (policy) — Only `kind === 'specification'` resists severity overrides, so
  `severityOverrides: { 'skill.link.escapesRoot': 'off' }` silently disables a
  directory-traversal **security error** with no opt-in flag
  (`src/validation/index.ts:69`). Consistent with the letter of the documented
  invariant, arguably not its intent.
- **L/M** — Fences inside blockquotes are invisible to the scanner (`^\s*` rejects
  `>`), so quoted code samples are scanned as prose (`authoringQuality.ts:359`).
- **L** — Empty-section dedup compares titles from two different parsers (mdast vs
  raw scanner), so an empty `## **Examples**` is reported twice (−30 for one
  defect) (`authoringQuality.ts:210-228`).
- **L** — Heading regex strips a trailing `#` without the CommonMark preceding
  space, so `## C#` parses as title `"C"` and collides with `## C`
  (`authoringQuality.ts:344`).
- **L** (judgment) — Repetition detection includes lines inside fenced code, so a
  large log/code sample trips "Repetitive instructions"
  (`authoringQuality.ts:415-433`). The algorithm is O(n) exact-line dedup — no
  n-gram, no O(n²).

Docs drift (`docs/rules.md` vs implementation): `skill.name.folderMismatch` is
documented warning/Quality but implemented **error**/specification (and thus
override-immune); `tooVerbose`/`overbroadTrigger`/`instructionHeavy` are grouped
under the docs' "Specification … these are errors" section but implemented as
quality warnings; `noVerb` sits under "Never fatal" yet is an error. The
token-budget rules, escapesRoot split, and metadata profile applicability all
match exactly. The severity policy's core invariant (specification errors resist
downgrade unless `allowSpecificationOverrides`) genuinely holds, including the
opt-in path.

### Parser & token measurement (`src/parser/`, `src/analysis/`)

- **H** — YAML `toJS()` crash (see P1).
- **M** — No size cap on resource read+tokenize: every eligible file is read and
  tokenized synchronously on every full analysis (~4 MB/s single-threaded; 1 MB ≈
  250–315 ms; nothing prevents buffering a 500 MB file). `sizeBytes` is already
  collected but never consulted (`tokenUsage.ts:169-184`).
- **M/L** — Symlinked resources (file, dir, dangling) are invisible to discovery,
  so token budgets and unreferenced-resource analysis are blind to files the agent
  runtime would load (`discoverResources.ts:56-59`).
- **M/L** — UTF-16 text files are classified binary and silently excluded from
  token totals with no "skipped" signal — the default `Out-File` encoding on
  Windows PowerShell 5 (`tokenUsage.ts:186-195`). A BOM sniff would fix it.
- **L/M** — Scheme URIs without `//` (`data:`, `javascript:`, `urn:`, `vscode:`)
  classify as `relative` and produce false "Linked file does not exist" errors
  (`parseMarkdownLinks.ts:166-174`).
- **L** — Resource-path diagnostic ranges inside code blocks are misplaced
  (off-by-one line / wrong column) (`parseMarkdownLinks.ts:119-139`).
- **L** — `isPlausibleLaterFrontmatter` misfires on prose after a thematic break
  (`Note:` matches the key regex), reporting `FrontmatterNotAtTop` instead of
  `FrontmatterMissing` (`parseFrontmatter.ts:32-40`).
- **NOTE** — Lone-CR (classic Mac) line endings are unsupported by `toLines`,
  yielding `FrontmatterMissing`; mildly inconsistent with `countTextLines`, which
  does split on lone `\r`.
- **NOTE** — `globMatch` deviates from standard glob: character classes are
  literal, in-segment `**` crosses separators, `*` matches dotfiles. Fine for the
  default excludes; user-supplied `[...]`/`{...}` patterns silently never match.

Genuinely strong here: text-only mode's no-filesystem guarantee is enforced by
construction and by tests; path containment is security-literate (decode-after
strip, `path.relative`-based, per-platform injectable); frontmatter diagnostics
are AST-precise with correct duplicate-key last-wins ranges; tokenization is exact
and offline with special-token strings correctly counted as plain text; every
individual filesystem syscall in the walker/reader/validator is guarded — the one
uncaught throw in the entire layer is the YAML `toJS()` call.

### Remote-link checker / SSRF (`src/online/`)

**No SSRF bypass found.** IP obfuscation (decimal `2130706433`, hex `0x7f000001`,
octal, short `127.1`, `%`-encoded), NAT64 / IPv4-mapped / IPv4-compatible
embeddings, and userinfo/backslash parser-confusion are all normalized-then-blocked
or tripped by the credential/host checks. Anti-rebinding is real: it connects to a
pre-validated IP and re-validates the connected peer *before* sending HTTP bytes,
and every redirect hop is independently re-resolved and re-classified. TLS is not
weakened (`rejectUnauthorized` never set false; SNI and `Host` preserve the
original hostname so certificate identity validation still applies despite the
connect-to-IP pattern). Header injection is impossible (WHATWG URL + Node guards
reject CRLF/control chars). All VERIFIED via the injectable fakes.

Correctness/robustness nits only:

- **L** — Transient/auth statuses (401, 408, 429, 503) are reported as
  `unavailable` **warnings** rather than indeterminate `information`, and 403 is
  accepted while 401 is not — flaky false positives for a linter
  (`remoteLinkChecker.ts:365-367,188-190,383-388`).
- **L** (security, minor) — No destination-port restriction: a malicious SKILL.md
  can make the editor open an HTTP preamble to an arbitrary port on a *public* host
  (`nodeRemoteLinkDependencies.ts:37`). Internal SSRF stays blocked.
- **L** (robustness) — The pure session imposes no independent timeout on the
  transport call (unlike DNS); correctness depends on the transport honoring
  `timeoutMs`. The shipped node transport does (`remoteLinkChecker.ts:215-223`).
- **INFO** — Success path destroys the response body immediately (good) but never
  `socket.destroy()`s; `AsyncLimiter.release()` re-enters `drain()` synchronously
  (accounting verified correct, but a fragility smell).

### OpenCode import & evaluation metrics (`src/opencode/`, `src/evaluation/`)

- **M** — Three aggregate-bound crash/hang paths (see P5).
- **L** — Attacker-controlled tool names hit object prototype keys in
  `actionSummary`: `__proto__` vanishes, `constructor` records garbage into the
  UI, `errors` conflates with the error counter (no actual prototype pollution)
  (`buildTrajectory.ts:407-412`). Use `Object.create(null)`/`Map`.
- **L** — Negative token/cost values pass through unclamped into rendered totals
  (`buildTrajectory.ts:485-497`).
- **L** — Skill recognition is exact `tool === 'skill'`, so `Skill`/`skills`
  silently become plain tools, and a `skill` part in a *user* message is counted
  inconsistently between `toolCallCount` and `skillCallCount`
  (`parseSessionExport.ts:130`).
- **L** — Timeline event list is never truncated (`large` is only a flag); the
  full model with per-event `searchText` is serialized over postMessage even
  though the browser caps the DOM at 200 rows (`timelineViewModel.ts:202`).
- **L** — Eval suite accepts `runsPerQuery: 1e9`; `metrics.ts:57-69` silently
  ignores decisions with unknown queryIds despite a docstring promising rejection.

The tolerant-parsing design is otherwise sound: **no prototype pollution anywhere
on the path** (verified end-to-end), source-order-only sequencing (timestamps
never reorder), real discovery limits (size/count/recursion enforced, symlinked
dirs excluded), a sound allow-listed webview trust boundary, and confusion-matrix
/ stability metrics that are exactly correct including zero-denominator and
run-bookkeeping edges.

---

## What is genuinely well done

- **A real deterministic core.** Pure, `vscode`-free analysis modules; stable
  sorts; normalized configuration; injectable filesystem/DNS/transport seams that
  make security-sensitive code unit-testable without a network.
- **Transparent, honest scoring.** Findings sum exactly to the score
  (property-enforced); ceilings are visible and coded rather than hidden
  deductions; missing/untrusted input becomes an explicit `not-scored` with a
  reason instead of a fake zero.
- **Correct fundamentals.** Levenshtein cross-checked on 500 pairs; exact offline
  `o200k_base` tokenization; largest-remainder weight normalization that keeps
  per-criterion points integral under arbitrary profile weights; standard,
  symmetric similarity metrics with NaN-free degenerate handling.
- **A serious SSRF defense.** Self-resolved DNS, all-answers-must-be-public,
  connect-to-validated-IP with peer re-validation before HTTP, per-hop redirect
  re-validation, preserved SNI/Host, no ambient proxy — and it held up under a
  dedicated bypass attempt.
- **Security-literate parsing.** Decode-after-strip path handling, `path.relative`
  containment, lexical-plus-realpath symlink-escape checks, and per-syscall
  guarding throughout the filesystem layer.

## Suggested order of work

1. **P1** — guard `toJS()` and add a "parseFrontmatter never throws" property
   test. Highest impact, smallest change; it removes a silent editor-wide failure.
2. **P2** — wrap rules in try/catch so one bad rule can't blank a file's
   diagnostics.
3. **P4** — tighten description scope-content (≥2 distinct meaningful tokens, drop
   the stray-`s` token, scan past the first sentence before the 59 ceiling); add
   the missing adversarial/gaming cases to the benchmark corpus.
4. **P3** — hoist collision per-skill computation to an O(n) pre-pass and honor
   cancellation in the pair loop.
5. **P5** and the remaining medium items — cap aggregate work in the OpenCode
   importer; add resource size caps and a UTF-16 BOM sniff; fix the boundary
   phrase inversion and add non-ASCII coverage signaling; reconcile `docs/rules.md`
   with the implemented kinds/severities.
