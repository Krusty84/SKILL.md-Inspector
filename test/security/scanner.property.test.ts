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
