# Plan 14 — Stop corrupting user files; validate user configuration

Source: round-4 algorithm evaluation. Self-contained; no external report required.

**Independent of Plans 12, 13 and 15–17.** Touches `src/parser/parseFrontmatter.ts`,
`src/validation/`, `src/workspace/detectSkillCollisions.ts`, and `src/config.ts`.

Part A is a data-loss bug in a quick fix and should ship on its own, first.

## Context

**A. A block-scalar `description` value range ends inside the *next key*, so the
`InsertUseWhenClause` quick fix destroys the frontmatter.**

`parseFrontmatter.ts:171` stores `item.value.range[1]` verbatim. For a YAML block scalar
that offset is *past the trailing newline*, i.e. column 0 of the following line. When the
block scalar is the last key that lands harmlessly at the closing fence — which is why
Plan 2's move to `frontmatterValueRanges` looked complete. When another key follows, it
does not. Measured:

```yaml
---
name: my-skill
description: |            → valueRange = 2:13 – 4:0   (line 4 is "license: MIT")
  Does a thing.
license: MIT
---
```

Appending at the value end produces:

```yaml
  Does a thing.
 Use when <describe when to use this skill>.license: MIT
```

Re-parsing that yields `skill.frontmatter.invalid` and **`frontmatter === null`** — every
key is lost. Controls that are correct today and must stay correct: a single-line plain
scalar (`2:13 – 2:26`), a quoted scalar, and a block scalar that is the last key.

**B. The kebab-case name quick fix can empty the field, and is marked `isPreferred`.**
`validateName.ts:81`. For `name: 文档助手`, `name: 🎉`, or `name: "___"` the slug is empty,
so the one-click preferred fix replaces the author's name with `name: ` and the next pass
reports `skill.name.missing`.

**C. `severityOverrides` values are never validated.** `validation/index.ts:88` casts the
user's string straight into `diagnostic.severity`. A plausible typo inverts the intent:

```
"skillMdInspector.severityOverrides": { "skill.description.vague": "warn" }
  → published to the Problems panel as a red Error (default was warning)
```

The bad value also poisons the severity counters and the sort comparator. Unknown *keys*
are silently dropped, and the "Configure Severity Overrides" UI then lists the dropped
key back to the user as a valid `quality` override, confirming a setting that does nothing.

**D. Collision numerics are unclamped.** `normalizeWeights`
(`detectSkillCollisions.ts:334`) guards `total === 0` but not `NaN`, negative, or
`Infinity`; the threshold is not guarded at all. Measured on two unrelated skills:

```
weights: { cosine: "high" }   → similarity: NaN reported, risk "Low"
weights: { cosine: NaN }      → similarity: NaN
weights: { scopeOverlap: -5 } → similarity: NaN
threshold: NaN                → EVERY pair reported (NaN < NaN is false)
```

At 500 skills a `NaN` threshold reports 124,750 collisions.

**E. Profile length settings are unclamped** (`config.ts:157`), unlike sibling settings in
the same file. `description.maxLength: 0` makes every skill in the workspace report
`skill.description.tooLong` — and that code is kind `specification`, so it is *protected
from* `severityOverrides` and cannot be switched off.

**F. `description.length` is UTF-16 code units** (`descriptionHeuristics.ts:102`), so 520
astral characters are reported as "1040 characters; the maximum is 1024" — a message that
is wrong in its own terms, on a protected error.

**G. `tooVerbose` is a third hard-coded copy of `500`** (`validateDescription.ts:11`),
decoupled from the profile-derived good-length band. With `description.minLength: 600`, a
550-character description gets both `tooShort` ("aim for at least 600") and `tooVerbose`
("aim for at most 500") on the same range.

## Reproduce first

- `test/parser/valueRangeIntegrity.test.ts` — for each of {plain, single-quoted,
  double-quoted, block literal, block folded, multiline plain} × {last key, followed by
  another key}: apply a synthetic append-at-value-end edit and assert the result
  re-parses with the same key set. Part A's case must fail.
- `test/config/userInputValidation.test.ts` — one failing case per Part C–G.

## Scope

- **`src/parser/parseFrontmatter.ts:171`** — trim the stored value end back over trailing
  newline/whitespace before converting to a range, so the range ends at the last content
  character of the value. This is the whole fix; no quick-fix code changes.
- **`src/validation/validateName.ts:81`** — when the slug is empty, do not offer the fix
  (or offer it non-preferred with a placeholder derived from the folder name).
- **`src/validation/index.ts`** — validate override values against the known severity set;
  drop invalid ones and report them through the output channel. Validate keys against
  `DiagnosticCode` and surface unknown keys in the configuration UI as `unknown`, not
  `quality`.
- **`src/workspace/detectSkillCollisions.ts`** — reject non-finite/negative weights and
  thresholds, falling back to the defaults with a warning; clamp `ngramSize` to 2–8.
- **`src/config.ts`** — clamp `minLength`/`maxLength` to sane bounds and swap them if
  inverted, matching how the neighbouring settings are already handled.
- **`src/quality/descriptionHeuristics.ts:102`** — measure length in code points
  (`[...trimmed].length`) and use that consistently in the message and the ceiling.
- **`src/validation/validateDescription.ts:11`** — derive the verbosity threshold from the
  profile band instead of a third literal `500`, and suppress it when it would contradict
  `tooShort`.

**Non-goals.** No change to what the rules mean, to the default thresholds, or to the
quick-fix catalogue beyond Part B.

## Acceptance criteria

1. Every scalar-style × position combination round-trips an append edit with the key set
   intact; Part A's exact fixture re-parses to `{name, description, license}`.
2. No quick fix can produce an empty `name:`.
3. `"warn"` is rejected with an output-channel message and the default severity is kept;
   an unknown key is listed as `unknown` in the override UI.
4. Malformed weights or threshold fall back to defaults; no `similarity: NaN` is ever
   emitted.
5. `maxLength: 0` is clamped; `minLength: 500, maxLength: 100` is corrected, not obeyed.
6. A 520-astral-character description reports 520, not 1040.
7. No input produces both `tooShort` and `tooVerbose`.

## Verification checklist

```
npm run check-types && npm run lint && npm test && npm run check:heuristic-dictionaries
```
