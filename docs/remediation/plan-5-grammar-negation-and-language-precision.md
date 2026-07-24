# Plan 5 — Scope-grammar negation symmetry + trigger/language precision

Follow-up to Plans 2–3, based on an adversarial re-evaluation of the merged
implementation. Requires Plans 1–4 merged (current `main`). Everything below was
verified by executing the shipped modules; the "today" values are measured.

Priority inside this plan: **Part A is the one that matters** — it inverts meaning.
Parts B and C are precision polish.

## Part A — Negated usage verbs are read as positive triggers (high)

### Context

In `src/quality/descriptionHeuristics.ts`, `POSITIVE_USAGE_GRAMMAR` matches the full
`USAGE_VERB` alternation (`use|using|invoke|apply|trigger|run…`) before a scope
conjunction, but `NEGATIVE_USAGE_GRAMMAR` — which does double duty as (a) the
negated-span *exclusion* for trigger detection and (b) the *boundary* grammar source —
only recognizes `use[ds]?` as the negated verb. Every negated usage verb other than
"use" therefore leaks through as a **positive trigger** while the **boundary goes
undetected**. Measured today (defaults):

| Sentence in description | Read as | Score |
|---|---|---|
| "Convert DWG drawings to PDF exports. **Do not run** this skill **when** the repository is offline." | positive trigger `run this skill when`, boundary none | 85 |
| "Generate release notes from commits. **Never invoke for** merge commits." | positive trigger `invoke for`, boundary none | 85 |
| "Generate BOM tables from CAD assemblies. **Do not trigger when** the assembly is checked out." | positive trigger `trigger when`, boundary none | 85 |
| "Normalize sensor telemetry into CSV. **Don't apply for** binary waveform captures." | positive trigger `apply for`, boundary none | 85 |
| "Migrate database schemas safely. **Never run if** a backup is missing." | positive trigger `run if`, boundary none | 85 |
| control: "…**Do not use when** the assembly is checked out." | boundary full ✓ | 69 |

This is worse than a missed marker: a well-written boundary sentence is scored as its
semantic opposite, and rewards the description (85 > the 69 it would earn with the
boundary correctly detected but no separate trigger). Related partial miss, currently
*not* inverted but also not captured: "**Avoid running when** meshes exceed 2 GB" →
no trigger, no boundary.

### Task

1. Factor one shared negated-verb alternation and widen `NEGATIVE_USAGE_GRAMMAR` from
   `use[ds]?` to the same usage-verb family the positive grammar knows, **plus the
   gerunds** (`using|invoking|applying|running|triggering`) so "avoid running when…"
   style phrasings are coverable. Because `NEGATIVE_USAGE_GRAMMAR` is both the
   negated-span exclusion and the boundary grammar source, this single change fixes
   the inversion *and* the missed boundary together.
2. Extend the `NEGATION` alternation with `avoid(?:s|ed|ing)?` (so "avoid running
   when…" becomes a boundary) — keep the existing dictionary phrases
   (`avoid using for` …) working unchanged.
3. Re-verify the span-overlap exclusion still permits a genuine positive *after* a
   negated clause in the same sentence, e.g. "Do not use for scans but run for
   digital exports" — the positive `run for` starts after the negated span and must
   keep its credit. Add this as a test.

### Reproduce first

Extend `test/descriptionEvidenceRealWorld.test.ts` (or add
`test/scopeGrammarNegation.test.ts`) with the six table rows asserting the **target**
behavior; confirm the five inversions fail today, then implement.

### Acceptance criteria (Part A)

1. All five inversion rows: `triggerClause.contentFound === false` **and**
   `boundaryClause.contentFound === true` with the excluded context in
   `clauseText` (e.g. "a backup is missing").
2. Control row unchanged; "avoid running when meshes exceed 2 GB" now yields a
   boundary.
3. Positive grammar regressions ruled out: "Use when standardizing reports",
   "Should be used when decoding CAN captures", "Use this skill whenever…",
   "Run this skill when reviewers ask" (imperative, non-negated) all keep full
   trigger credit.
4. The same-sentence positive-after-negation case keeps its trigger credit.

## Part B — Duration/conditional behavior statements read as triggers (moderate)

### Context

The `verb … (when|for|if)` grammar has no notion of *what follows the conjunction*
or *who the subject is*, so behavior descriptions qualify as usage scope. Measured:

- "Cleans stale build caches from CI runners. **Runs for 10 minutes** on large
  repos." → full trigger credit (marker `runs for`), 85.
- "Lint YAML pipelines. **Applies fixes if** the schema check passes." → full trigger
  credit (marker `applies fixes if`), 85.

### Task

Two targeted guards; calibrate against the fixtures, do not over-engineer:

1. **Duration/quantity guard:** a `for`-conjunction match is rejected when `for` is
   directly followed by a quantity/duration/size expression —
   `for\s+(?:up\s+to\s+|about\s+|around\s+)?\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|ms|kb|mb|gb|tb|files?|rows?|pages?|items?)\b`
   (case-insensitive). "Use for PDF reports" is unaffected.
2. **Third-person subject guard:** a *bare third-person* usage verb (`runs`,
   `applies`, `invokes`, `uses`, `triggers`) followed by a conjunction only counts
   when the sentence carries usage context (reuse `USAGE_CONTEXT_PATTERN`, which
   already includes `trigger(s) when`) — imperative/base forms ("Run when…",
   "Apply for…") and passives ("used when/for") stay unguarded. Note the built-in
   consequence: "Triggers when the user mentions invoices" keeps its credit because
   `triggers when` is itself usage context.

### Acceptance criteria (Part B)

1. The two fixtures above: no full trigger credit (marker may be absent or the
   clause not counted); overall score drops below today's 85.
2. Kept-credit controls: "Use for PDF reports…", "Use when standardizing reports",
   "Use this skill whenever…", "Should be used when…", "Triggers when the user
   mentions invoices", "Run this skill when reviewers ask".
3. Re-run `npm run benchmark:static`; reconcile only intended movements (any
   benchmark case that legitimately used a bare third-person verb as its only
   trigger evidence needs a deliberate decision, recorded in the case's `notes`).

## Part C — Language profiles trip on cross-language homographs (low)

### Context

`src/quality/language.ts` foreign profiles contain words that are common in English
technical prose, and the clear-margin rule (`hits > englishHits`) degenerates when
terse English contains no English function words at all. Measured false positives
(all flagged `isProbablyNonEnglish === true` today):

- "Renders **para**-virtualized VM images. **No** console output. **No** GUI."
  (Spanish profile: `para`, `no`×2)
- "Inspect **die** casting molds **von** Bosch. Compare **die** wear patterns across
  lots." (German profile: `die`×2, `von`)
- "Map **Los** Angeles transit data. **No** API key required. **Se** habla support
  available." (Spanish profile: `los`, `no`, `se`)

Consequence is mild — only the language-limited flag flips; the score is unchanged —
but the Plan 3 zero-English-false-positive gate is violated in spirit (the bulk gate
passed because benchmark English is article-rich).

### Task

1. Split each foreign profile into **unique markers** (diacritic-bearing or
   English-rare: `für nicht werden wird verwenden ist`; `pour pas avec dans ne aux`;
   `cuando usar imágenes según`; `perché gli usare`; `não são usar quando`) and
   **homograph markers** (`no die von los se la le para es da do…`). Flag only when
   at least one **unique** marker hits; homographs may then add supporting weight.
   Removing homographs from the profiles entirely is an acceptable simpler variant if
   the existing non-English fixtures still pass.
2. Keep the existing thresholds (≥3 hits, ≥2 distinct, > English hits) on top.

### Acceptance criteria (Part C)

1. The three probe strings above → `false`.
2. Existing positives stay `true`: the German/French/Spanish/Russian fixtures already
   in `test/language.test.ts` and every `language !== 'en'` benchmark case.
3. The bulk English gate (every `language === 'en'` benchmark case → `false`) still
   passes, plus the three new strings added to it.
4. Dutch remains unflagged (documented gap — adding a Dutch profile is out of scope:
   Dutch "de/het/een" are homograph-heavy and need their own precision work).

## Non-goals

- No return to phrase-whitelist-only matching; the grammar stays, it gets symmetric.
- No changes to scoring math, ceilings, weights, or the collision layer.
- Keyword stuffing with disjoint scopes remains out of scope (inherent to lexical
  analysis, documented).
- No new language profiles.
- `artifactHints` domain coverage (e.g. terraform/kubernetes terms) is a separate
  dictionary-content discussion, not part of this plan.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run benchmark:static
npm run check:heuristic-dictionaries   # only if dictionaries were touched
```
