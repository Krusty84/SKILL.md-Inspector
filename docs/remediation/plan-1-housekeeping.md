# Plan 1 — Green the test suite, glob brace support, documentation caveats

Run this plan **first**. Later plans use "the full suite passes" as an acceptance gate,
which requires the pre-existing failures fixed here.

## Part A — Reconcile the 5 failing `activationEvents` manifest tests

### Context

`npm test` currently fails 5 tests (807/812 pass), all asserting that `package.json`
`activationEvents` contains `onView:<viewId>` entries for the contributed views:

- `test/packageManifest.test.ts` — "declares the Select SKILLs Folder command and WORKSPACE welcome action"
- `test/packageManifest.test.ts` — "activates for the OpenCode view and command palette entry points"
- `test/navigator.test.ts` — "declares containers, views, commands, menus, and additional roots schema"
- `test/sidebarViews.test.ts` — "declares independent SKILL.md Inspector views and preserves the analysis panel"
- `test/sidebarViews.test.ts` — "activates before any contributed tree view requests its data provider"

`package.json` currently declares only `onLanguage:markdown` and
`workspaceContains:**/SKILL.md`. This is **valid**: since VS Code 1.74, activation
events for contributed views (and commands) are generated implicitly, and this
extension requires `"engines": { "vscode": "^1.90.0" }`. The tests encode the
pre-1.74 convention.

### Task

Decide the direction and make the suite honest:

- **Preferred:** update the tests to assert the *modern* contract — for every
  contributed view, either an explicit `onView:` entry exists **or** the engines
  requirement is ≥ 1.74 (implicit activation). Keep the tests' real purpose: catching a
  contributed view that could never activate the extension.
- Alternative (acceptable but redundant): restore the `onView:` entries to
  `package.json`. Explicit entries are harmless duplicates on modern VS Code.

Whichever direction you choose, say why in the commit message.

### Acceptance criteria

- `npm test` → 0 failures.
- No behavioral change to the extension at runtime.

## Part B — Brace alternation in the glob matcher

### Context

`src/parser/globMatch.ts` implements the matcher used for
`skillMdInspector.discovery.exclude` and `skillMdInspector.resources.exclude`. It
supports `**`, `*`, `?`, and literals — but **not brace alternation**. A user pasting a
standard VS Code-style pattern like `**/*.{png,jpg}` gets a silent no-match today: the
braces are treated as literal characters, the pattern matches nothing, and no error is
reported.

### Task

Add single-level brace alternation to `compile()` in `src/parser/globMatch.ts`:

- `{a,b,c}` compiles to a non-capturing alternation `(?:a|b|c)` where each alternative
  is itself compiled with the existing rules (so `*` and `?` work inside braces).
- No nesting required (`{a,{b,c}}` may be treated as literal or rejected — document the
  choice in the module docstring).
- An unclosed `{` must fall back to matching a literal `{` (current behavior), never
  throw.
- Keep the compiled-regex cache behavior.

### Acceptance criteria

- `matchesAnyGlob('assets/logo.png', ['**/*.{png,jpg}'])` → `true`.
- `matchesAnyGlob('assets/logo.gif', ['**/*.{png,jpg}'])` → `false`.
- `matchesAnyGlob('a{b', ['a{b'])` → `true` (unclosed brace stays literal).
- Alternation must not cross `/` unless the alternative contains `**`.
- New unit tests in `test/globMatch.test.ts` cover the above; all existing tests pass.

## Part C — Documentation caveats (small, no code)

1. **Token counts are a proxy.** The token budget checks
   (`src/validation/validateTokenBudgets.ts`) honestly label counts as `o200k_base`,
   but nothing tells the user *why that matters*: Claude's production tokenizer is not
   o200k, so counts near a threshold can differ by roughly ±10–20%. Add one short
   paragraph to the README's validation/token-budget section stating that budgets are
   measured with the open `o200k_base` encoding as a deterministic offline proxy and
   thresholds should be read with that tolerance.
2. Reproduce-first note: before writing Part A/B code, run `npm test` once and confirm
   exactly the 5 listed failures (no more, no fewer). If the set differs, stop and
   re-scope Part A to the actual failures.

## Non-goals

- Do not touch anything under `src/quality/`, `src/workspace/`, or the benchmark
  corpus — those belong to plans 2–4.
- Do not add a globbing dependency (minimatch etc.); extend the existing minimal
  matcher.

## Verification checklist

```
npm run check-types
npm run lint
npm test                      # 0 failures
npm run check:heuristic-dictionaries
```
