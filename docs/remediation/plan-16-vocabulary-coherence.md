# Plan 16 — Make the vocabulary tables and the tokenizers agree

Source: round-4 algorithm evaluation. Self-contained; no external report required.

**Depends on Plan 10** (which introduced the synonym-group tables). Shares
`defaultHeuristicDictionaries.json` with Plans 9 and 15 — run it alone.

Plan 10 added capability and artifact synonym groups and widened `similarity.ts` to
Unicode. Both changes are half-applied: a fifth of the group members can never be
reached, and the module that consumes them still tokenizes ASCII-only.

## Context

Measured by executing the shipped dictionaries and `collisionFeatures` under node.

**A. 54 synonym-group members are dead configuration.** `capabilityGroupOf` and
`artifactGroupOf` are only ever applied to terms that `extractCapabilities` /
`extractArtifacts` already emitted, and those only emit members of `actionVerbs` /
`artifactHints` / `multiWordArtifacts` / `acronyms`.

```
artifactSynonymGroups   members not extractable: 25 / 123
  code, function, module, dataset, record, doc, document, letter, manuscript, plot,
  endpoint, openapi, service agreement, chat, notification, post, tsv, brand, swatch,
  assertion, integration test, smoke test, branch, browser, site

capabilitySynonymGroups members not in actionVerbs: 29 / 130
  benchmark, grade, score, draft, make, populate, emit, output, save, schedule,
  condense, digest, document, label, outline, harvest, ingest, load, open, pull,
  scrape, amend, change, correct, patch, remediate, deserialize, encode, port
```

`synonymGroupConflicts` checks that no member is in *two* groups; nothing checks that a
member is in the source vocabulary at all.

**B. Dual-membership terms are never disambiguated, and one mis-grouping kills a true
positive.** `test` is in both `actionVerbs` and `artifactHints`, with no part-of-speech
guard, and `spec` is grouped under `interface` (the OpenAPI sense) rather than `test`:

```
A: "Create unit tests for a source file. Use when the user asks for tests."
B: "Generate spec files covering a module's behaviour. Use when the user wants specs written."

extractCapabilities(A) = ["create", "test"]     ← "tests" the noun read as the verb
capabilityGroups: A = {author, assess}, B = {author}   → capabilityOverlap 0.5, not 1.0
artifacts:        A = {test},           B = {interface} → artifactOverlap 0
scopeOverlap = 0  →  composite 0.04, ranked below four DISTINCT pairs
```

**C. `contentWords` is still ASCII-only.** `collisionFeatures.ts:407` is
`/[a-z0-9]+/g` while `similarity.ts:34` was widened to `[\p{L}\p{N}]+/gu` in Plan 10
Part D. Scope overlap carries weight **0.70** — the leading term — and it is blind:

```
english  capabilities=["extract"]  artifacts=["invoice","pdf","spreadsheet"]
german   capabilities=[]           artifacts=["pdf"]
french   capabilities=[]           artifacts=["pdf"]
spanish  capabilities=[]           artifacts=["pdf"]      'cálculo' → ["c","lculo"]
russian  capabilities=[]           artifacts=["pdf"]
chinese  capabilities=[]           artifacts=[]
```

It does not only affect non-Latin scripts — the ASCII class shreds accented Latin into
fragments, so the Latin-script profiles `language.ts` already detects are also affected.

**D. Acronyms are the only dictionary never singularized.**
`descriptionHeuristics.ts:840` filters `acronyms` through `acronymMatches` (a
`\b`-anchored regex) while `artifactHints` go through `tokenize` + `singularize`:

```
"Validate JWT payloads."  → matched ['jwt']      "Validate JWTs."   → []
"Check URL redirects."    → matched ['url']      "Check URLs."      → []
"Track KPIs."             → []
```

A plural acronym loses the 15-point artifact criterion and trips the 59-point
`missing-concrete-artifact` ceiling.

**E. No Unicode normalization anywhere.** `tokenize("naïve")` returns `['naïve']` in NFC
and `['nai','ve']` in NFD, so the same visible word matches or does not depending on how
the author's editor encoded it. This flips language detection too: the German markers in
`"Konvertiert PDF-Dateien für Berichte, nicht für Tabellen."` are found in NFC and lost in
NFD. `detectNameConflicts` has the same gap — two skills both named `café-tool`, one NFC
one NFD, are reported as merely "confusingly similar" instead of a hard name conflict.

**F. `singularize` is wrong on 4 of 20 real plurals**: `cookies→cooky`, `species→specy`,
`statuses→statuse`, `news→new`. Low impact (none are domain terms), cheap to fix.

## Reproduce first

- `test/quality/dictionaryCoherence.test.ts` — assert that **every** synonym-group member
  is present in the corresponding source vocabulary, and that no term appears in both
  `actionVerbs` and `artifactHints` without an explicit entry in a new
  `dualRoleTerms` allowlist. Both must fail today.
- `test/workspace/scopeTokenization.test.ts` — the Part C table.
- Add the Part D and F cases to the existing morphology tests.

## Scope

- **`src/quality/defaultHeuristicDictionaries.json`** — for each dead member, either add
  it to the source vocabulary or remove it from the group. Move `spec` from the
  `interface` group to `test`. Decide `test`, `document`, `draft`, `patch`, `label`,
  `plot` explicitly (each is both a verb and a noun) and record the decision inline.
- **`src/quality/wordForms.ts`** — add a `dualRoleTerms` guard so a term that is both a
  verb and an artifact is resolved by position, not by whichever extractor runs first;
  fix the four `singularize` cases via `irregularSingularForms`.
- **`src/workspace/collisionFeatures.ts:407`** — widen `contentWords` to
  `/[\p{L}\p{N}]+/gu`, matching `similarity.ts`. Re-run `npm run benchmark:collisions` and
  record the shift.
- **`src/quality/descriptionHeuristics.ts:840`** — run acronyms through the same
  singularization path as `artifactHints`, keeping the uppercase-only guard.
- **Add NFC normalization** at the three entry points that tokenize user text
  (`descriptionHeuristics.tokenize`, `similarity.tokenizeContent`,
  `workspace/detectNameConflicts`). One `.normalize('NFC')` per entry point.
- Add the coherence assertion from "Reproduce first" to
  `npm run check:heuristic-dictionaries` so a future dead entry cannot be added silently.

**Non-goals.** No growth of `actionVerbs`/`artifactHints` beyond what Part A requires. No
change to the collision weights or threshold — Plan 10 calibrated those, and Part C will
move the measured numbers, so re-record rather than re-tune.

## Acceptance criteria

1. `check:heuristic-dictionaries` fails on any synonym-group member missing from its
   source vocabulary; the shipped tables pass.
2. `test-writer` / `spec-generator` scores above the 0.30 default threshold.
3. The Part C table shows a non-empty `capabilities` for German, French, Spanish, Russian
   and Chinese; `cálculo` tokenizes as one token.
4. `"Validate JWTs."` and `"Check URLs."` match their acronyms.
5. NFC and NFD spellings of the same description produce identical tokens, identical
   language detection, and identical scores; NFC/NFD name twins are a hard conflict.
6. `npm run benchmark:collisions` precision does not fall below its recorded value; the
   recall figure is re-recorded with the shift stated in the commit message.

## Verification checklist

```
npm run check-types && npm run lint && npm test
npm run check:heuristic-dictionaries && npm run sync:heuristic-dictionaries
npm run benchmark:static && npm run benchmark:collisions
```
