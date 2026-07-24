# Plan 2 — Description evidence extraction overhaul

The largest and highest-value plan. Do not split it across parallel sessions: all four
parts modify `src/quality/descriptionHeuristics.ts` and the benchmark corpus, and they
are calibrated together.

## Context

The Static Description Quality score (`src/quality/staticDescriptionQuality.ts`) is
architecturally sound — transparent findings, visible grade-limitation ceilings,
largest-remainder weight normalization. But the **evidence extractors** feeding it
(`src/quality/descriptionHeuristics.ts`) only recognize one house sentence template:
`<Base verb> <artifact>. Use when X. Do not use when Y.` Measured results against the
shipped code (these numbers are verified, not estimated):

| Input style | Example | Today |
|---|---|---|
| Gerund-led | "Formatting PDF invoices and expense reports into the standard accounting layout. Use when preparing month-end financial documents. Do not use for scanned images." | **59 / weak**, `missing-action-capability` cap, plus an **error**-severity `DescriptionNoVerb` diagnostic |
| Noun-phrase | "A skill that extracts tables from PDF reports and converts them to CSV. Use when the user needs tabular data out of PDF files. Do not use for scanned documents." | **59 / weak**, same cap and error |
| Verb in 2nd sentence | "For mechanical CAD teams. Converts STEP assemblies to lightweight JT previews. Use when reviewers need visual checks. Do not use for FEA meshes." | **59 / weak**, same cap |
| "whenever" | "Convert DWG drawings to PDF. Use this skill whenever the user shares CAD drawings. Do not use for STEP models." | **69**, trigger = none (`\buse this skill when\b` cannot match inside "whenever") |
| Passive trigger | "Extract structured data from CAN bus logs. This skill should be used when analyzing vehicle telemetry captures. It should not be used for simulated traces." | **65**, trigger = none, boundary = none |
| Anthropic-published pdf-skill style | "Comprehensive PDF manipulation toolkit for extracting text and tables, creating new PDFs, merging/splitting documents, and handling forms. When Claude needs to fill in a PDF form, or programmatically process, generate, or analyze PDF documents." | **30 / poor** |
| Anthropic-published docx-skill style | "Use this skill whenever the user wants to create, read, edit, or manipulate Word documents (.docx files). Triggers include any mention of Word doc, docx, or requests to produce professional documents with tables of contents and headings. Do not use for PDFs or spreadsheets." | **50 / weak** |
| Keyword-stuffed nonsense | "Format the format of formats formatting PDF. Use when invoice PDF report. Do not use when contract Word document." | **100 / excellent** |
| Unfilled placeholders (the extension's own improver output!) | "Extract tables from PDF reports. Use when \<trigger context\>. Do not use when \<boundary\>." | **100 / excellent** |
| Non-usage "when the user" | "Parse DBC files into JSON. The tool crashes when the user provides malformed frames." | **85 / good**, full trigger credit |

The ranking is inverted relative to real-world quality: production Anthropic
descriptions that trigger well in the wild score "poor"/"weak", while
template-conforming junk and unfilled placeholders score "excellent".

## Reproduce first

Before changing implementation code, add a new test file
`test/descriptionEvidenceRealWorld.test.ts` encoding the table above as assertions of
the **target** behavior (see Acceptance criteria). Run it, confirm the relevant cases
fail, then implement until green. Keep this file in the final commit — it is the
regression suite for this plan.

## Part A — Capability detection beyond the first-token base verb

`matchLeadingCapability()` in `src/quality/descriptionHeuristics.ts` inspects only the
first sentence, rejects gerunds at position 0 (`allowGerund=false` for the `direct`
position), and knows no "A skill that <verbs>…" frame. Because the action verb drives a
20-point criterion **and** a 59-point hard ceiling **and** an error diagnostic, a
stylistic choice is punished as an absent capability.

Changes:

1. Recognize a capability verb form (any inflection, gerunds included) **anywhere in
   the first two sentences** for the purposes of `actionVerb.found` (the 20-point
   criterion and the `missing-action-capability` ceiling). `analyzeDescription` already
   has `hasActionVerb` (all-token scan) to build on — but scope it to the first two
   sentences so a verb buried in sentence five still reads as "not stated up front"
   overall.
2. Add subject frames to the leading-capability matcher: `a/this (skill|tool|toolkit)
   that? <verb>`, and extend the existing `use …` frames with `the user wants to`
   (alongside the existing `needs to` / `asks to`).
3. Allow gerund-led openings ("Formatting PDF invoices…") to qualify as
   `capability-first` for **front-loaded intent** as well. Test the guard cases:
   "Running this skill on every commit…" may now match — decide whether that is
   acceptable (it names a capability, so it arguably is) and cover it with a test
   either way.
4. In `src/validation/validateDescription.ts`, downgrade `DescriptionNoVerb` from
   `error` to `warning`. Check `src/validation/ruleRegistry.ts` and
   `test/diagnosticKind.test.ts` / `test/ruleRegistry.test.ts` for the
   specification-vs-advisory classification of this code and keep it consistent
   (a warning must not remain classed as a protected specification error).

Keep `analyzeInstructionHeavy` (base-verb sentence starts) and the collision-layer
`extractCapabilities` untouched.

## Part B — Trigger/boundary marker grammar instead of an exact-phrase whitelist

`assessScopeClause()` matches markers only from literal phrase lists. Replace the
*built-in* marker source with a small pattern grammar while keeping the dictionary
lists as **additive** user configuration (do not break existing
`skillMdInspector.heuristics.dictionaryValues.*` settings):

- Positive triggers: `(use[ds]?|using|invoke[ds]?|apply|applies|trigger[s]?|run[s]?)
  … (when(ever)?|for|if)` within one sentence; `when (the user|claude|you|asked)`;
  `designed|intended|ideal|best|suitable|appropriate for`; `triggers? include`.
- Negative boundaries: `(do not|don't|never|should not|must not|not( to)? be)
  … use[d]? … (when(ever)?|for|if|on)`; keep the existing list entries
  (`not intended for`, `not suitable for`, …).
- The bare `when the user` / `when claude` markers get a **usage-context guard**
  (Part C below).

Implementation notes:

- The clause-extent logic (next marker / sentence terminator), the
  contraction-stripping, the vague-token scoring, and the excluded-window logic that
  stops "do not **use when**…" from registering as a positive trigger must keep
  working. Extend the excluded-window check to the new grammar (e.g. "should not be
  used when X" must never produce positive-trigger credit).
- `scopeContentEchoed` in `staticDescriptionQuality.ts` consumes
  `matchedPhrase` and compares it against `exclusiveTriggerPhrases` — make sure a
  grammar match still reports a usable `matchedPhrase` string.
- `collisionFeatures.ts` (`extractPositiveTriggers`, `extractNegativeBoundaries`,
  `stripClauses`) uses the same dictionary lists. Either route it through the same
  grammar or leave it list-based deliberately — state the choice in a code comment;
  do not let the two layers silently diverge in what they call a boundary.

## Part C — Two anti-gaming fixes

1. **Placeholder hole.** Angle-bracket placeholders (`<trigger context>`,
   `<boundary>`, and generally `<[^>]{1,60}>`) currently tokenize into "meaningful"
   scope tokens, so the extension's own `buildImprovedDescription()` output scores
   100/excellent with placeholders unfilled. Treat placeholder spans as
   **non-content** in `assessScopeClause` (marker may be found; `contentFound` must be
   false if the only content is placeholders). Verify `REWRITE_TEMPLATE` in
   `src/quality/improveDescription.ts` scores < 60 after the fix, and that the
   improver stays idempotent (it keys off `markerFound`, which still holds).
2. **Non-usage "when the user".** Bare `when the user` / `when claude` (without a
   preceding use/invoke/trigger verb in the same sentence) must only count as a
   trigger marker when the sentence is about *using the skill* — reuse the spirit of
   the `usageContext` regex in `analyzeOverbroadTrigger`, or require the marker
   sentence to start the clause. "The tool crashes when the user provides malformed
   frames" must stop earning full trigger credit; "Use this skill when the user asks
   for X" must keep it.

## Part D — Recalibrate the benchmark corpus

`benchmarks/static-description-quality/cases.json` currently contains almost only
house-style positives, so it structurally cannot catch the failures above.

1. Re-run `npm run benchmark:static` after Parts A–C; some existing cases will move
   (e.g. cases that previously asserted `trigger: "none"` for phrasings the grammar now
   matches). Update expectations **only** where the new behavior is the intended one
   per this plan; investigate anything else as a regression.
2. Add ≥ 10 new cases: the gerund-led, noun-phrase, second-sentence-verb, "whenever",
   passive-trigger, Anthropic-pdf-style, and Anthropic-docx-style inputs from the
   table (as positives with appropriate bands), and the keyword-stuffed, unfilled-
   placeholder, and non-usage-"when the user" inputs (as negatives with low/mid
   bands). Respect the harness rules: band width ≤ 25, corpus ≥ 45.

## Acceptance criteria

All measured via `computeStaticDescriptionQuality` with default options unless noted:

1. Gerund-led and noun-phrase examples (table rows 1–2): score ≥ 80, `actionVerb.found
   === true`, no `missing-action-capability` limitation.
2. Second-sentence-verb example: no `missing-action-capability` limitation; score ≥ 75.
3. "whenever" example: trigger clause `contentFound === true`; score ≥ 85.
4. Passive example: trigger **and** boundary `contentFound === true`; score ≥ 80.
5. Anthropic pdf-style: score ≥ 60, no action/trigger grade limitations (it may still
   lose points for missing boundary, vague "comprehensive", and front-loading — that is
   honest).
6. Anthropic docx-style: score ≥ 80.
7. Unfilled-placeholder input: trigger `contentFound === false`; overall label `poor`
   or `weak`; `REWRITE_TEMPLATE` itself scores < 60.
8. Non-usage "when the user" input: no full trigger credit (score drops below today's
   85; the `missing-usage-trigger` or `vague-usage-trigger` limitation applies).
9. "Do not use when X. Use when Y. …" (boundary-first ordering) no longer takes the
   `missing-action-capability` cap when a capability verb appears in the first two
   sentences.
10. Existing canonical positives (e.g. "Format inspection reports using standard
    rules. Use when standardizing reports. Do not use when handling invoices.") still
    score ≥ 90.
11. `DescriptionNoVerb` is `warning` severity; registry/kind tests agree.
12. Full verification checklist passes.

## Non-goals

- No LLM/semantic scoring; everything stays deterministic and offline.
- Do not restructure the scoring math (`CRITERION_POINTS`, weight normalization,
  ceilings mechanism) — only the evidence feeding it.
- Keyword-stuffing with *disjoint* trigger/boundary keyword sets will still score well;
  that is inherent to lexical analysis. Do not attempt grammar-correctness detection.
- Collision detection changes belong to Plan 4.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run benchmark:static
npm run check:heuristic-dictionaries   # required if you touched defaultHeuristicDictionaries.json
```
