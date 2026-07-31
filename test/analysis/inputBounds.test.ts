import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { countO200kTokens, warmUpO200kTokenizer } from '../../src/analysis/o200kTokenizer';
import { analyzeSkill } from '../../src/analysis/analyzeSkill';
import { countResourceTokens } from '../../src/analysis/tokenUsage';
import { matchesAnyGlob, globConfigurationWarnings } from '../../src/parser/globMatch';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { resolveProfile } from '../../src/profiles';
import { validateSecurity } from '../../src/validation/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/validation/security/settings';

/**
 * Plan 13. Four hot paths were superlinear in input size with no guard, three of
 * them on the 250 ms debounced while-typing path. The worst measured case was a
 * 200,000-character single-line body: 48.7 minutes of frozen extension host.
 *
 * Sizes here are kept just past the cliff so the suite stays fast; the shapes,
 * not the magnitudes, are what these assert.
 */

// Decoding the o200k ranks is a one-off ~200 ms that would otherwise land on
// whichever assertion runs first and be read as a failure of that path.
warmUpO200kTokenizer();

function elapsed(fn: () => void): number {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

function skillSource(body: string): string {
  return `---\nname: demo\ndescription: Does a thing. Use when a thing is needed.\n---\n\n${body}\n`;
}

function skillWithBody(body: string) {
  return parseSkillFile('/skills/demo/SKILL.md', skillSource(body));
}

describe('A — the tokenizer is bounded in the length of one unbroken run', () => {
  it('counts 16,000 CJK ideographs in under 500 ms', () => {
    const ms = elapsed(() => countO200kTokens('文'.repeat(16_000)));
    expect(ms).toBeLessThan(500);
  });

  it.each([
    ['lowercase letters', 'a'.repeat(16_000)],
    ['uppercase letters', 'A'.repeat(16_000)],
    ['punctuation', '#'.repeat(16_000)],
    ['brackets', '['.repeat(8_000) + ']'.repeat(8_000)],
    ['zero-width spaces', '​'.repeat(16_000)],
    ['non-breaking spaces', ' '.repeat(16_000)],
  ])('counts 16,000 %s in under 2 s', (_label, text) => {
    expect(elapsed(() => countO200kTokens(text))).toBeLessThan(2_000);
  });

  it('analyzes a 200,000-character single-line body in under 2 s (text-only)', () => {
    // text-only is the 250 ms debounced while-typing path.
    const source = skillSource('a'.repeat(200_000));
    const ms = elapsed(() => {
      analyzeSkill('/skills/demo/SKILL.md', source, resolveProfile(), { mode: 'text-only' });
    });
    expect(ms).toBeLessThan(2_000);
  });

  it('leaves ordinary prose counts exact', () => {
    // 500 KB of prose is the control: it was already fast (488 ms measured), so
    // the guard must not perturb it. Chunking only ever applies to runs the
    // budget could not afford, and ordinary words never reach that.
    const prose = 'The quick brown fox jumps over the lazy dog. '.repeat(11_364);
    expect(countO200kTokens(prose)).toBe(113_641);
    expect(countO200kTokens('Extract line items from PDF invoices into a CSV spreadsheet.')).toBe(
      11,
    );
  });

  it('leaves a long URL exact — it fits the exact-run budget', () => {
    const url = 'https://github.com/Krusty84/SKILL.md-Inspector/blob/main/docs/rules.md#security';
    expect(countO200kTokens(url)).toBe(22);
  });
});

describe('B — token counting has a byte cap like every other file-reading path', () => {
  it('skips a resource above the cap instead of encoding it', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmd-tokens-'));
    try {
      const file = path.join(dir, 'big.md');
      fs.writeFileSync(file, 'a '.repeat(600_000)); // 1.2 MB
      expect(countResourceTokens(file, undefined, { maxBytes: 1_000_000 })).toBeUndefined();
      expect(countResourceTokens(file, undefined, { maxBytes: 4_000_000 })).toBeGreaterThan(0);
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('C — the glob compiler rejects patterns it cannot bound', () => {
  it.each([
    '**/**/**/**/**/**/**/x',
    '{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}X',
  ])('rejects %s in under 10 ms instead of compiling it', (glob) => {
    const target = 'a'.repeat(121);
    const ms = elapsed(() => matchesAnyGlob(target, [glob]));
    expect(ms).toBeLessThan(10);
    expect(globConfigurationWarnings([glob])).toHaveLength(1);
  });

  it('still compiles the shipped exclusion patterns', () => {
    expect(matchesAnyGlob('node_modules/x/y.md', ['**/node_modules/**'])).toBe(true);
    expect(matchesAnyGlob('a/b/c.png', ['**/*.{png,jpg}'])).toBe(true);
    expect(globConfigurationWarnings(['**/node_modules/**', '**/*.{png,jpg}'])).toHaveLength(0);
  });
});

describe('D — the invisible-Unicode scan is linear in the body size', () => {
  it('scans a 224 KB body with 8,000 zero-width characters in under 200 ms', () => {
    const filler = 'Ordinary sentence about formatting reports for a team. '.repeat(4_000);
    const doc = skillWithBody(`${filler}\n${'​'.repeat(8_000)}`);
    const ms = elapsed(() => {
      validateSecurity({
        doc,
        settings: { ...DEFAULT_SECURITY_SETTINGS, enabled: true },
        skipFilesystem: true,
      });
    });
    expect(ms).toBeLessThan(200);
  });
});
