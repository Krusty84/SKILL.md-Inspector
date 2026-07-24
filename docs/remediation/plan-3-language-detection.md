# Plan 3 — Language detection for Latin-script languages

Small, sharply scoped plan. Run after Plan 1 (green suite); running after Plan 2 is
recommended because both append benchmark cases.

## Context

`src/quality/language.ts` decides whether a description can be analyzed by the English
heuristic dictionaries:

```ts
export function isProbablyNonEnglish(text: string): boolean {
  // latin-letter ratio < 0.5 → non-English
}
```

This only detects **non-Latin scripts** (Cyrillic, CJK, …). German, French, Spanish,
Italian, Portuguese descriptions pass as "English", get scored ~35/"poor" with
full-confidence findings, and never receive the language-limited flag. Verified
against the shipped code:

| Description | `isProbablyNonEnglish` | Score | `partial` flag |
|---|---|---|---|
| "Formatiert PDF-Rechnungen in das Standardlayout. Verwenden bei der Monatsabrechnung. Nicht verwenden für gescannte Bilder." (de) | `false` | 35 / poor | **missing** |
| "Extrait les tableaux des rapports PDF et les convertit en CSV. À utiliser pour les données tabulaires. Ne pas utiliser pour les documents scannés." (fr) | `false` | 35 / poor | **missing** |
| "Genera informes PDF a partir de facturas de clientes. Usar cuando se procesan facturas. No usar para imágenes escaneadas." (es) | `false` | 35 / poor | **missing** |
| "Форматирует PDF-счета в стандартный формат. Использовать при обработке счетов." (ru) | `true` | 35 / poor | present ✓ |

Meanwhile the `skillMdInspector.description.language` setting promises: *"auto detects
a non-English description and marks its quality score as language-limited."* The
behavior contradicts the documentation, and a German author is told their description
is objectively poor rather than unanalyzable.

## Reproduce first

Extend `test/language.test.ts` with the four inputs above asserting the **target**
behavior (de/fr/es → `true`, ru → `true`), plus English controls that must stay
`false` (include short English strings, English with code identifiers like
"Convert `.dwg` files via ODA SDK", and English with heavy digits/punctuation). Confirm
the de/fr/es cases fail, then implement.

## Task

Replace the body of `isProbablyNonEnglish` with a two-stage, dependency-free check in
`src/quality/language.ts` (keep the module import-free — it is a leaf):

1. **Script stage (keep):** if Latin letters make up < 50% of letters → non-English.
2. **Stopword-profile stage (new):** for Latin-script text, compare hit rates of
   language-marker function words. Embed small constant word sets (~20–30 words each)
   for English and for the major Latin-script languages (de, fr, es, it, pt at
   minimum), counting whole-word, case-insensitive matches over the tokenized text.
   Declare non-English when a foreign profile clearly beats the English profile.
   Include high-precision markers, e.g.:
   - de: `der die das und für nicht mit von bei werden wird verwenden eine einen ist`
   - fr: `le la les des une pour pas avec dans est sont utiliser ne du au aux`
   - es: `el la los las una para con cuando desde usar no se por es son`
   - it: `il lo la gli le una per con quando usare non di da è sono`
   - pt: `o os as um uma para com quando usar não de da do é são`
   - en: `the a an and for with when to use not of in on is are do`

Design constraints:

- **Precision over recall.** A false "non-English" on an English description would
  wrongly suppress real findings. Require a clear margin (e.g. foreign hits ≥ 2 and
  foreign hit-rate > English hit-rate) before flagging; when in doubt return `false`.
  Note the diacritics asymmetry: accented forms (`für`, `é`, `não`) are high-precision
  signals; ambiguous cross-language words (de `bei` vs en "Beijing" tokenization, es
  `no`) must only count as whole tokens.
- Very short texts (< ~5 tokens) stay `false` (undecidable).
- Keep the function name, signature, and export unchanged — call sites
  (`staticDescriptionQuality.ts`) need no edits.
- Deterministic, no dependencies, no Unicode tables beyond what `\p{Script=Latin}`
  already uses.

Then:

3. Update the `skillMdInspector.description.language` setting description in
   `package.json` to state what "auto" actually detects (non-Latin scripts plus
   common Latin-script languages via stopword profiles; other languages may still be
   scored as English).
4. Add 2–3 Latin-script non-English cases to
   `benchmarks/static-description-quality/cases.json` with `"language"` set to the
   real language code — the benchmark harness already asserts `partial === true` and
   `coverage === 'low'` for every case whose `language !== 'en'`.

## Acceptance criteria

1. The de/fr/es probe strings above → `isProbablyNonEnglish === true`, and
   `computeStaticDescriptionQuality` marks the result `partial: true`,
   `coverage: 'low'`, with the language-support finding present.
2. The ru control keeps working.
3. English controls (≥ 10 varied strings, including all existing English benchmark
   descriptions run in bulk) → `false` for every one. Zero English false positives is
   a hard gate: add a test iterating every `language === 'en'` case in
   `benchmarks/static-description-quality/cases.json`.
4. Setting description matches actual behavior.
5. Full verification checklist passes.

## Non-goals

- No scoring changes: a non-English description still gets its structural score; only
  the language-limited flagging changes.
- No external language-detection library.
- No translation of the dictionaries; analyzing German content in German is out of
  scope.

## Verification checklist

```
npm run check-types
npm run lint
npm test
npm run benchmark:static
```
