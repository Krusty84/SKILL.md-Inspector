# Plan 18 — One definition per shared concept

Source: round-4 completeness critique. Self-contained; no external report required.

**Run after Plans 12–17** — it touches many of the same files, and several of their fixes
are local instances of the divergences catalogued here. This plan is the structural
follow-up: each item is a concept the codebase defines in more than one place, where the
copies have already drifted.

## Context

The modules in this repo are pure, well-commented and individually defensible. They also
each define their own version of every cross-cutting concept. The comments are the
giveaway — `similarity.ts:12` documents *why* the Unicode character class matters and
`bodySections.ts:75` and `collisionFeatures.ts:407` never got the memo;
`renderTemplate.ts:20` guards `toKebabCase` returning empty and `validateName.ts:81` does
not; `skillCodeActions.ts:196` explains why value ranges are needed for multi-line scalars
and `improveDescription.ts:60` uses `lineAt` anyway. This codebase knows all the right
things, in the wrong number of places.

**A. "Resource directory" has six definitions; the configurable one reaches one rule.**

| definition | location | value |
|---|---|---|
| user setting `resources.directories` | `config.ts:175` | configurable, 4 defaults |
| resource *category* assignment | `discoverResources.ts:15` | hard-coded 4 |
| bare-path reference regex | `parseMarkdownLinks.ts:29` | hard-coded 4 |
| token bucketing | `tokenUsage.ts:148` | hard-coded **3** (`templates` missing) |
| watcher / cache invalidation glob | `extension.ts:210` | hard-coded 4 |
| user-visible label | `validateTokenBudgets.ts:91` | hard-coded **3** |

Only `validateResources.ts:14` reads the setting. A user who adds `docs` gets
unreferenced-file warnings for `docs/**` that **cannot be silenced by referencing the
file**, because `RESOURCE_PATH_RE` does not know `docs`; edits under `docs/` never fire the
watcher, so `ResourceCache` goes stale; and the files are bucketed as "Other text files".
This is the root cause of Plan 17 Part C — the invalidation glob is narrower not only than
`discoverResources` but than the setting. The same decoupling drives the `scanResources`
category gating in Plan 12: `scanPlanFor` (`scanResources.ts:144`) keys command scanning on
`category === 'scripts'`, and `category` comes from the hard-coded list, so renaming your
script directory downgrades every script in it to the text plan.

**B. "Word" has three definitions, inside two modules that feed one metric.**
`descriptionHeuristics.tokenize:1133` and `similarity.tokenizeContent:34` use
`/[\p{L}\p{N}]+/gu`; `collisionFeatures.contentWords:407` uses `/[a-z0-9]+/g`. So *within
`collisionFeatures`*, `domainTokens` is Unicode-aware and `extractCapabilities` /
`boundaryTokens` are not. Reproduced with registered custom verbs:

```
"überprüfen"   collision capabilities []          quality actionVerb.found = true
"pre-process"  collision capabilities []          quality structuralTerm = "pre-process"
"re-format"    collision capabilities ['format']  quality matched = "format"   ← wrong verb
```

Plan 16 Part C fixes the regex. This plan's job is the invariant that stops it recurring.

**C. The dictionary write contract is wider than any read contract — the quick fix is
non-idempotent.** `REGISTRABLE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'-]{0,40}$/u` exists three
times: `validateDescription.ts:23`, `skillCodeActions.ts:182`, and a **second literal
copy** at `addHeuristicDictionaryWord.ts:21`. It admits hyphens and apostrophes; no
matcher can match such an entry, because `matchDescriptionVerb` compares against
`tokenize()` output, which splits on `-` and `'`. Reproduced end to end:

```
"Pre-process invoice PDFs."
  → info diagnostic: '"pre-process" reads like a capability verb but is not in the
     configured vocabulary. Add it to score the capability criterion fully.'
  → user clicks AddActionVerbToDictionary; 'pre-process' is written to actionVerbs
  → actionVerb.found still false, capabilityEvidence.dictionary still false,
    the diagnostic reappears unchanged, the criterion still scores 0. Forever.
```

The artifact side survives by accident: `analyzeArtifactEvidence` also runs
`phraseMatchesNormalized`, which folds `-` to a space.

**D. Two weight tables, two scoring regimes.** `CRITERION_POINTS`
(`staticDescriptionQuality.ts:65`) is 20/20/15/15/10/10/10 and the module's doc comment
calls it the spec; `genericProfile.description.weights` (`genericProfile.ts:14`) is
20/20/**20**/**5**/10/10/**15** and is what every production path passes. Callers that
omit weights — `buildImprovedDescription` (`improveDescription.ts:19`) and
`buildDescriptionSuggestions` (`:47`) — silently grade boundary clauses at **3×** the
production weight.

**E. `toKebabCase` can return empty; one caller guards it.** `renderTemplate.ts:20` has
`|| 'skill-name'`; `validateName.ts:81` does not. `toKebabCase('___')` and
`toKebabCase('日本語')` both return `''`. That is Plan 14 Part B; the guard already exists
and simply did not propagate.

**F. Smaller duplicates.** `500` appears in five decoupled places
(`staticDescriptionQuality.ts:76`, `descriptionHeuristics.ts:183`,
`validateDescription.ts:11`, `authoringQuality.ts:72`, `validateTokenBudgets.ts:16`) — the
first three all mean "description length" and are independent. `escapeHtml` is copied four
times with **two different contracts**: `renderReport.ts:502` and
`renderWorkspaceReport.ts:360` escape `& < > " '`; `reportToc.ts:17` and
`openCodeSessionReportWebview.ts:159` omit the apostrophe. (Not exploitable today — all
attribute values are double-quoted and the report CSP is `default-src 'none'` — but
`metricDefinitions.ts:19` documents that its strings are inlined into `title="…"`
*unescaped* and that translated bundles must respect that, an invariant on external
translation data enforced by nothing.) "Binary file" has three definitions
(`textFile.BINARY_EXTENSIONS` ~90, `buildResourceGraph.BINARY_EXT` ~20,
`scanResources.CODE_EXTENSIONS`), and "skill file" has three
(`mapping.isSkillFile` — `file:` scheme only, `favoritesStore.isSkillUri` — any scheme,
`discoverSkills.walk:43` — name equality).

## Reproduce first

`test/architecture/sharedConcepts.test.ts` — assertions that fail today and that a future
divergence re-fails:

1. Every module that enumerates resource directories imports the same exported constant.
2. Every user-text tokenizer in `src/quality`, `src/workspace` and `src/validation` uses
   the shared tokenizer (assert by grepping for character-class literals, or by exporting
   one `tokenizeWords` and asserting no module defines its own).
3. Any string accepted by `REGISTRABLE_WORD` is matchable: for a sample of accepted words,
   adding it to `actionVerbs` makes `matchDescriptionVerb` find it.
4. `CRITERION_POINTS` and `genericProfile.description.weights` agree, or the constant is
   deleted.
5. `escapeHtml` is defined once.

## Scope

- **`src/types/` or a new `src/shared/`** — export one `RESOURCE_DIRECTORIES` resolver
  (taking the config value, defaulting to the four), one `tokenizeWords`, one
  `REGISTRABLE_WORD`, one `escapeHtml`, one `BINARY_EXTENSIONS`, one `isSkillFile`, and one
  description-length constant. Replace every copy with an import.
- **Resource directories** must be threaded from configuration into
  `discoverResources` (category assignment), `parseMarkdownLinks` (`RESOURCE_PATH_RE`,
  built per-call from the resolved list), `tokenUsage.tokenGroupFor`, and the
  `extension.ts` watcher glob. Decide `templates/` explicitly and make all six agree.
- **Narrow `REGISTRABLE_WORD`** to what the matchers can actually match (no `-`, no `'`),
  or widen the matcher; whichever is chosen, criterion 3 above must hold. Delete the
  duplicate literal at `addHeuristicDictionaryWord.ts:21`.
- **Delete `CRITERION_POINTS` or make it equal the profile weights**, and give the two
  default-weight callers the production profile.
- Add the `toKebabCase` fallback at the one unguarded call site.

**Non-goals.** No behavior change is intended beyond making the copies agree — but they
*have* drifted, so some behavior will change. Every such change must be recorded in the
commit message with a before/after, not smoothed over. Do not reconcile `escapeHtml`'s two
contracts by dropping the apostrophe: take the stricter one.

## Acceptance criteria

1. Adding `docs` to `resources.directories` makes bare `docs/guide.md` mentions count as
   references, fires the watcher for `docs/**`, and buckets the files consistently.
2. A verb registered through the quick fix is matched on the next analysis pass — the
   diagnostic disappears and the capability criterion pays.
3. `buildImprovedDescription` with default options scores identically to the production
   path.
4. `grep -c 'function escapeHtml'` returns 1; the same for the tokenizer, the binary list
   and `REGISTRABLE_WORD`.
5. The five `500`s are one named constant per distinct meaning, with the meanings stated.

## Verification checklist

```
npm run check-types && npm run lint && npm test
npm run check:heuristic-dictionaries && npm run benchmark:static && npm run benchmark:collisions
```
