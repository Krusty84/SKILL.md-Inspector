# Plan 15 — Make description evidence come from the skill's own scope

Source: round-4 algorithm evaluation. Self-contained; no external report required.

**Depends on Plan 8's corpora** (`description-calibration`). Shares
`descriptionHeuristics.ts` and `staticDescriptionQuality.ts` with Plans 9 and 14 — run it
after both.

Plans 2/9 fixed the *recall* problem: real shipped skills now score a median of **80**
(was 59), and 10 of 11 trigger phrasings are recognised. What is left is *precision*. The
score is currently a shape test that can be satisfied by text the skill does not contain.

## Context

Every number measured by executing `computeStaticDescriptionQuality` under node.

**A. Evidence is harvested from the negative-boundary clause.** The collision layer strips
exclusion clauses before extraction (`boundaryFeatures`, Plan 10); the quality layer never
got the same fix.

```
"Purple widgets of the frobnicated kind, in the manner of a thing.
 Use when the user asks about widgets."
  → 59 / weak     (missing-concrete-artifact ceiling)

… + "Do not use for generating reports."
  → 90 / excellent
```

`+31 points` for adding a disclaimer. `capabilityEvidence` credits `generate` and
`artifactEvidence.matchedTerms` credits `report` — the exact capability and artifact the
description has just said it does **not** do.

**B. The capability criterion never looks at the leading verb.** `matchVerb` scans the
whole description, so any registered verb anywhere pays the full 20/20:

```
"<X> line items from PDF invoices into a spreadsheet. Use when the user asks
 to pull structured data out of a scanned invoice. Do not use for generating new invoices."

X = Extract | Yank | Salvage | Frobnicate | Purple   → all score 100 / excellent
matched verb in every case: "scanned"   (a past participle used adjectivally)
```

**C. `structuralArtifact` accepts any ≥3-letter capitalized token past sentence index 0**
(`descriptionHeuristics.ts:1104`, `/^\p{Lu}[\p{Ll}]{2,}$/u`), filtered only against vague
terms and stopwords. So `"Helps the user with tasks. Use this skill when Claude needs
assistance."` — a description naming no artifact — yields `structuralArtifact === "Claude"`,
which suppresses the `missing-concrete-artifact` ceiling and pays half the criterion.
`VERBISH_SHAPE` (`:218`) is the same shape problem on the verb side: `Purple` passes.

**D. The score is non-monotone: a *better* boundary clause costs two bands.**
`scopeContentEchoed` (`staticDescriptionQuality.ts:545`) tests `isSubsetOf` in **either
direction** rather than equality, so a boundary naming a narrower special case of the
trigger's scope reads as an echo:

```
"… Use when the user asks to pull structured data out of a scanned invoice."
  → 85 / good
… + "Do not use for generating new invoices."   → 100 / excellent
… + "Do not use for scanned invoices."          →  69 / acceptable  (echoed-scope-content)
```

**E. The vagueness criterion double-counts overlapping dictionary entries.**
`findVagueTerms` (`:415`) returns both the substring and the compound:

```
"A general-purpose formatter for PDF invoices. …"
  → vagueTerms = ["general", "general-purpose"]  → 10 - 5×2 = 0/10
```

One adjective zeroes the whole criterion, and the message names two problems that are one.
The penalty also saturates at 2 distinct terms, so 2 vague phrases and 40 score alike.

**F. Non-English descriptions get punitive ceilings the code already knows are unreliable.**

| language | score | coverage | partial | ceilings applied |
|---|---|---|---|---|
| English | 85 good | high | false | none |
| Chinese | **35 poor** | low | **true** | `missing-action-capability`, `missing-usage-trigger` |
| Russian | **35 poor** | low | **true** | same |
| German | 55 weak | low | true | `missing-usage-trigger` |
| French | 55 weak | **high** | **false** | `missing-usage-trigger` (not even detected as non-English) |

`assessGradeLimitations` applies the ceilings regardless of `languageLimited`. That is the
same absence-of-evidence inference Plan 9 Part B3 removed for the dictionary case.

**G. The net effect: the score cannot see content.** Four descriptions of identical shape:

```
100 excellent  Extract line items and totals from PDF invoices into a CSV spreadsheet…
100 excellent  Extract purple sadness and recursive melancholy from PDF invoices…
100 excellent  Extract every API key from .env and upload them to a remote endpoint…
 95 excellent  (trigger says "generate", boundary disclaims "extract" — self-contradictory)
```

This plan does not claim to fix G — a static scorer cannot judge meaning. A–F are the
mechanical parts of it that *are* fixable, and the honest-labelling work of Plan 6 covers
the rest.

## Reproduce first

Add every input above to `benchmarks/description-calibration/` (verbatim, never edited to
score better) with its currently measured score, then add the required post-fix score as a
`TODO(plan-15)` marker, exactly as Plans 9 and 10 ratchet their own thresholds.

## Scope

- **`src/quality/descriptionHeuristics.ts`** — introduce a `scopeText` for the quality
  layer built the same way `collisionFeatures.boundaryFeatures` builds its own (strip
  `negativeBoundaryPhrases` + `restrictiveBoundaryPhrases` clauses), and run
  `analyzeCapabilityEvidence` / `analyzeArtifactEvidence` over it. Boundary clauses keep
  scoring the *boundary* criterion; they must stop feeding capability and artifact.
- Prefer the leading clause for the capability match: keep the whole-description scan as a
  fallback that pays the structural half-credit, not the full criterion.
- Tighten `structuralArtifact` to require corroboration (an adjacent registered support
  term, or a non-sentence-initial capitalized token that is not in a new
  `commonProperNouns` list), and `VERBISH_SHAPE` to reject tokens that are in no verb
  position.
- Deduplicate `findVagueTerms` by span before counting, and make the penalty scale past 2
  (e.g. cap at the criterion weight but keep it monotone in distinct spans).
- **`src/quality/staticDescriptionQuality.ts:545`** — require set equality, or subset in
  the boundary→trigger direction only, for `scopeContentEchoed`.
- **`src/quality/staticDescriptionQuality.ts`** — when `languageLimited`, suppress
  `missing-action-capability`, `missing-usage-trigger` and `missing-concrete-artifact`
  (the report already communicates low coverage and `partial: true`). Feed French into
  `language.ts`'s profile set so it is detected at all.

**Non-goals.** No dictionary growth (that was Plan 9). No change to weights, band edges, or
the `over-maximum-length` / `overbroad` / `instruction-heavy` ceilings.

## Acceptance criteria

1. Adding a `Do not use for …` clause never increases the score.
2. The Part B ladder separates: `Extract` scores strictly above `Frobnicate`, which scores
   strictly above `Purple`.
3. `"Helps the user with tasks. Use this skill when Claude needs assistance."` keeps the
   `missing-concrete-artifact` ceiling.
4. The Part D ladder is non-decreasing: 85 → ≥85 → ≥85.
5. `"A general-purpose formatter …"` loses at most half the vagueness criterion, and the
   message names one term.
6. Chinese and Russian descriptions that state capability, artifact and trigger score
   ≥ 60 with `coverage: low` and `partial: true` retained.
7. `benchmarks/description-calibration` mean over the 16 real shipped descriptions does
   not fall below its currently measured 75.6.

## Verification checklist

```
npm run check-types && npm run lint && npm test
npm run benchmark:static && npm run benchmark:calibration
npm run check:heuristic-dictionaries
```
