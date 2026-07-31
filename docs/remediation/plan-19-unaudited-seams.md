# Plan 19 — The modules four evaluation rounds never opened

Source: round-4 completeness critique. Self-contained; no external report required.

**Independent of Plans 12–18** except where noted. Each item is small and they can ship
individually.

## Context

Four evaluation rounds drew their scope along *algorithm* lines — description scoring,
collision detection, the security scanner, the parser. Roughly 2,500 LOC never fell inside
any of those boundaries, and the defects concentrate at the **seams**: command → parser,
config → matcher, quality → collision. Everything below was reproduced by executing the
shipped modules.

**A. `validateBody` has no language gate, and `bodySections` is ASCII-only.**
`bodySections.ts:75` tokenizes headings with `normalized.split(/[^a-z0-9]+/)`.
`similarity.ts:34` and `descriptionHeuristics.ts:1133` both moved to `\p{L}\p{N}` with a
comment explaining that the ASCII class *erased non-Latin text entirely*; this module never
got the memo. Reproduced:

```
heading "Examples"              examples = true
heading "示例"                   all four section flags false
heading "Beispiele"             all false
heading "Entrées et sorties"    all false
```

The four English aliases could not match a foreign heading anyway, so the tokenizer is only
half of it. The real defect is that `validateBody.ts:66-84` applies an English-only
dictionary with **no equivalent of `language.ts`'s coverage escape**, and emits up to four
unactionable diagnostics per non-English skill. One module established "when the
dictionaries cannot judge this, say so"; its sibling ignores it. Pairs with Plan 15 Part F.

**B. `favoritesStore` canonicalization drops the URI authority.**
`favoritesStore.ts:14-21` returns `` `${parsed.protocol}//${parsed.pathname}` ``. So
`vscode-remote://ssh-remote+prod/skills/deploy/SKILL.md` and
`vscode-remote://ssh-remote+staging/skills/deploy/SKILL.md` collapse to the same key.
`addFavorite` (`:23`) refuses the second ("already favorited"); `removeFavorite` (`:32`)
removes **both** when the user unfavorites one. Same for two WSL distros, two dev
containers, or `file:` vs `vscode-vfs:`. Separately `isSkillUri` (`:7`) compares
`path.basename` of a *percent-encoded* pathname against the literal `SKILL.md`, so an
encoded filename is silently unfavoritable.

**C. `detectSanitizedExport` gives a confident answer when it gives up.**
`detectSanitizedExport.ts:6`: `if (found || visited++ > 10000) return;`. The node budget is
10,000 for exports supported up to 25 MB (`sessionDiscovery.ts:8`). A redaction marker past
the 10,000th node yields `'not-detected'` — the *confident* value — when the type already
provides `'unknown'` for exactly this case. `buildTrajectory.ts:77` gates its "this export
was redacted" notice on `'likely-sanitized'`, so a large sanitized export is presented to
the user as unsanitized.

**D. `evaluation/runner.ts:19` resolves through the prototype chain.**
`return this.decisions[prompt] ?? false;` — `decisions` is a plain object literal from
suite data. A query whose prompt is `constructor`, `toString` or `valueOf` returns a
function; `?? false` does not catch it, and the truthy value flows into
`TriggerDecision.triggered`, skewing the confusion matrix in the module the audit
otherwise rated its strongest code.

**E. `diagnostics/mapping.ts` — two issues, one of them the right place for Plan 14 Part C.**
`SEVERITY` (`:11-15`) is a plain record lookup, so an unvalidated override string yields
`undefined` at `:36` and `new vscode.Diagnostic(range, msg, undefined)` defaults to
**Error**. Plan 14 validates at the config seam; the defensive fallback belongs here too —
a lookup miss should fall back to the rule's own severity, not to the most severe value.

`isSkillFile` (`:8`) requires `document.uri.scheme === 'file'`. In github.dev, Remote
Repositories, or any virtual filesystem, the Skills tree and the Workspace navigator both
show skills (they use `vscode.workspace.fs` and are scheme-agnostic) and **zero diagnostics
are ever published**, with no message explaining why.

**F. `.svg` is classified binary, so SVG payloads are never scanned.**
`textFile.ts:22`'s `BINARY_EXTENSIONS` is documented as "shared by token measurement and
security resource scanning so both skip the same non-text files" — and it contains `.svg`.
SVG is XML text; it can carry prompt-injection prose and `<!-- -->` instructions that an
agent reading the package will see. `scanPlanFor` (`scanResources.ts:141`) returns
`undefined` for it, so `assets/logo.svg` containing a textbook injection produces zero
findings. A token-accounting decision silently defines security-scan coverage.

**G. The report path runs the entire workspace analysis twice.**
`analysis/workspaceAnalysis.ts:65-105`: after `computeWorkspaceAnalysis` has analyzed every
skill, `augmentAnalysisOnline` re-reads each `SKILL.md` with `fs.readFileSync` and calls
`analyzeSkill` in **full** mode again — re-walking every directory, re-BPE-encoding every
resource, with no `fileTokens` cache — purely to attach remote-link diagnostics. This is a
second instance of Plan 17 Part B and it compounds Plan 13 Part A: the worst-case encode
cost is paid twice per report.

**H. A locale-dependent comparison sits on the clause-selection path.**
`descriptionHeuristics.ts:807`: `a.marker.localeCompare(b.marker)` is the final tie-break
that decides **which trigger/boundary clause becomes `selected`** — inside the module
ARCHITECTURE.md calls "local, synchronous, and deterministic". Plan 17 Part D covers the
ordering leaks that affect exported artifacts; this one changes an analysis result. There is
no `Intl`-free comparator anywhere in the repo and no lint rule preventing the next one.

## Reproduce first

One focused test per item; all must fail before any fix:

- `bodySections` recognizes a `示例` / `Beispiele` heading, **or** `validateBody` suppresses
  its four section diagnostics when `isProbablyNonEnglish` holds.
- Two `vscode-remote://` URIs differing only in authority are two distinct favorites.
- A sanitized export whose marker sits past 10,000 nodes reports `'unknown'`.
- A suite query with prompt `constructor` yields `triggered: false`.
- An unknown severity string maps to the rule's default, not Error.
- `assets/logo.svg` containing `Ignore all previous instructions` produces a finding.
- `computeWorkspaceAnalysis` + online augmentation calls `analyzeSkill` once per skill.
- Clause selection is identical under `LC_ALL=en_US.UTF-8` and `LC_ALL=sv_SE.UTF-8`.

## Scope

- `src/validation/bodySections.ts` — use the shared tokenizer (Plan 18) and add a language
  gate to `src/validation/validateBody.ts` mirroring `staticDescriptionQuality`'s
  `languageLimited` handling.
- `src/navigator/favoritesStore.ts` — canonicalize with `uri.toString()` (authority
  included) or `protocol + authority + pathname`; decode the pathname before the basename
  comparison.
- `src/opencode/detectSanitizedExport.ts` — return `'unknown'` when the budget is exhausted
  without a decision; raise the budget in line with the supported file size.
- `src/evaluation/runner.ts` — `Object.prototype.hasOwnProperty.call` or a `Map`.
- `src/diagnostics/mapping.ts` — fall back to the rule's declared severity on a lookup
  miss; make `isSkillFile` scheme-agnostic (use the shared helper from Plan 18) or state
  in the UI why virtual-filesystem skills are not diagnosed.
- `src/analysis/textFile.ts` — remove `.svg` from `BINARY_EXTENSIONS`, or split the list
  into "cannot decode" (token counting) and "do not scan" (security) and keep `.svg` out
  of the second.
- `src/analysis/workspaceAnalysis.ts` — reuse the already-computed analyses; pass the
  caches if a re-analysis is genuinely required.
- `src/quality/descriptionHeuristics.ts:807` — replace with a locale-invariant comparator.
  Consider an ESLint rule banning bare `localeCompare` / `Intl.Collator(undefined, …)`
  under `src/quality`, `src/workspace`, `src/analysis`, `src/validation`.

**Non-goals.** No redesign of favorites, the OpenCode importer, or the evaluation runner.
No new section aliases for other languages — Part A only requires that the tool stop
asserting an English-only judgement on non-English content.

## Acceptance criteria

Each "Reproduce first" case passes, plus:

1. A non-English SKILL.md produces no unactionable `skill.body.*` diagnostics.
2. `.svg` is token-counted and security-scanned; genuinely binary assets still are not.
3. A workspace report with online checking enabled analyzes each skill exactly once
   (assert via a counting seam).
4. `npm test` passes identically under `LC_ALL=sv_SE.UTF-8`.

## Verification checklist

```
npm run check-types && npm run lint && npm test && npm run check:heuristic-dictionaries
LC_ALL=sv_SE.UTF-8 npm test
```
