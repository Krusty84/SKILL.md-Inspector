import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { validateSecurity } from '../../src/validation/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/validation/security/settings';

function docFrom(body: string) {
  return parseSkillFile(
    '/skills/demo/SKILL.md',
    `---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n\n${body}\n`,
  );
}

/**
 * The default `fc.string()` generates roughly 0-10 characters from the full
 * alphabet, which cannot reach a superlinear pattern's blow-up range. These
 * characters are the ones the command and URL patterns treat as fresh match
 * positions, and the length is where quadratic behavior becomes visible.
 */
const adversarialText = fc.string({
  unit: fc.constantFrom(...'a.- /$*|:@'.split('')),
  maxLength: 4096,
});

/** Scanning must stay interactive: this runs on a debounced keystroke. */
const SCAN_BUDGET_MS = 250;

describe('security scanner robustness (property)', () => {
  it('never throws on arbitrary body text', () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        expect(() =>
          validateSecurity({
            doc: docFrom(body),
            settings: DEFAULT_SECURITY_SETTINGS,
            skipFilesystem: true,
          }),
        ).not.toThrow();
      }),
      { numRuns: 300 },
    );
  });

  it('stays within budget on adversarial single-line input', () => {
    fc.assert(
      fc.property(adversarialText, (body) => {
        const doc = docFrom(body);
        const started = performance.now();
        validateSecurity({ doc, settings: DEFAULT_SECURITY_SETTINGS, skipFilesystem: true });
        const elapsed = performance.now() - started;
        expect(elapsed, `${body.length} characters took ${elapsed.toFixed(0)}ms`).toBeLessThan(
          SCAN_BUDGET_MS,
        );
      }),
      { numRuns: 100 },
    );
  });

  it('scans a 256KB single line within budget', () => {
    const body = 'a.b-c'.repeat(52429).slice(0, 256 * 1024);
    const doc = docFrom(body);
    const started = performance.now();
    validateSecurity({ doc, settings: DEFAULT_SECURITY_SETTINGS, skipFilesystem: true });
    const elapsed = performance.now() - started;
    expect(elapsed, `256KB line took ${elapsed.toFixed(0)}ms`).toBeLessThan(SCAN_BUDGET_MS);
  });

  it('never emits a range outside the document', () => {
    fc.assert(
      fc.property(fc.string(), (body) => {
        const doc = docFrom(body);
        const lineCount =
          `---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n\n${body}\n`.split(
            '\n',
          ).length;
        const diagnostics = validateSecurity({
          doc,
          settings: DEFAULT_SECURITY_SETTINGS,
          skipFilesystem: true,
        });
        for (const d of diagnostics) {
          if (!d.range) continue;
          expect(d.range.startLine).toBeGreaterThanOrEqual(0);
          expect(d.range.startLine).toBeLessThanOrEqual(lineCount);
          expect(d.range.startCharacter).toBeGreaterThanOrEqual(0);
          expect(d.range.endCharacter).toBeGreaterThanOrEqual(d.range.startCharacter);
        }
      }),
      { numRuns: 300 },
    );
  });

  it('markdown special characters in code fences do not break scanning', () => {
    fc.assert(
      fc.property(fc.string(), (inner) => {
        const body = `\`\`\`bash\n${inner}\n\`\`\``;
        expect(() =>
          validateSecurity({
            doc: docFrom(body),
            settings: DEFAULT_SECURITY_SETTINGS,
            skipFilesystem: true,
          }),
        ).not.toThrow();
      }),
      { numRuns: 200 },
    );
  });
});
