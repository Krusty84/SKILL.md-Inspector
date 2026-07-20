import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { parseFrontmatter } from '../src/parser/parseFrontmatter';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

// parseFrontmatter documents a never-throw contract: every failure mode must be
// reported through `errors`, never raised. The regression this guards is the
// YAML layer resolving anchors/aliases lazily in `toJS()` and *throwing*
// (unresolved aliases, "billion laughs" expansion) rather than recording the
// error in `doc.errors`.
describe('parseFrontmatter never throws (P1 regression)', () => {
  // Lines that have historically pushed the YAML layer toward throwing, mixed
  // with fences and arbitrary text so the generator explores real documents.
  const line = fc.oneof(
    fc.string(),
    fc.constantFrom(
      '---',
      'name: x',
      'description: *required*',
      'description: *anchor',
      '<<: *missing',
      'a: &a [*a, *a]',
      'b: &b [*a, *a, *a, *a, *a]',
      ': :',
      '\t- broken',
      '"unterminated',
      '%YAML 1.2',
      '?',
    ),
  );

  it('returns a result for arbitrary line sequences without throwing', () => {
    fc.assert(
      fc.property(fc.array(line, { maxLength: 30 }), (lines) => {
        expect(() => parseFrontmatter(lines.join('\n'))).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });

  it('returns a result for arbitrary text blobs without throwing', () => {
    const blob = fc.oneof(
      fc.string(),
      fc.constantFrom(
        '',
        '﻿---\nname: x\n---\n',
        '📄 report 😀\n---\ndescription: *x\n---',
        '日本語\n---\nname: *missing\n---',
        'a\tb\r\nc\rd',
      ),
    );
    fc.assert(
      fc.property(blob, (content) => {
        expect(() => parseFrontmatter(content)).not.toThrow();
      }),
      { numRuns: 500 },
    );
  });
});

describe('parseFrontmatter reports alias failures as FrontmatterInvalid', () => {
  const expectInvalid = (raw: string): ReturnType<typeof parseFrontmatter> => {
    const result = parseFrontmatter(raw);
    expect(result.frontmatter).toBeNull();
    expect(result.errors.map((error) => error.code)).toContain(DiagnosticCode.FrontmatterInvalid);
    return result;
  };

  it('handles an unresolved alias from a Markdown-emphasis typo', () => {
    // `description: *required*` looks like Markdown emphasis but parses as a YAML
    // alias with no matching anchor — the exact input that used to crash analysis.
    const result = expectInvalid(
      ['---', 'name: demo', 'description: *required*', '---', '# Body'].join('\n'),
    );
    // The diagnostic points inside the frontmatter block, not at line 0.
    const invalid = result.errors.find(
      (error) => error.code === DiagnosticCode.FrontmatterInvalid,
    );
    expect(invalid?.range).toBeDefined();
    expect(invalid?.range?.startLine ?? 0).toBeGreaterThanOrEqual(1);
  });

  it('handles an unresolved merge-key alias', () => {
    expectInvalid(['---', '<<: *missing', 'name: demo', '---', ''].join('\n'));
  });

  it('handles excessive alias expansion ("billion laughs")', () => {
    expectInvalid(
      [
        '---',
        'a: &a [x, x, x, x, x, x, x, x, x, x]',
        'b: &b [*a, *a, *a, *a, *a, *a, *a, *a, *a, *a]',
        'c: &c [*b, *b, *b, *b, *b, *b, *b, *b, *b, *b]',
        'd: &d [*c, *c, *c, *c, *c, *c, *c, *c, *c, *c]',
        'e: [*d, *d, *d, *d, *d, *d, *d, *d, *d, *d]',
        '---',
        '# Body',
      ].join('\n'),
    );
  });

  it('still parses a well-formed anchor/alias pair that resolves', () => {
    // A resolvable alias must remain valid — the guard only catches genuine
    // failures, it does not reject all anchor/alias use.
    const result = parseFrontmatter(
      ['---', 'name: demo', 'description: &d Format PDF reports.', 'summary: *d', '---', ''].join(
        '\n',
      ),
    );
    expect(result.errors.map((error) => error.code)).not.toContain(
      DiagnosticCode.FrontmatterInvalid,
    );
    expect(result.frontmatter).toMatchObject({
      name: 'demo',
      description: 'Format PDF reports.',
      summary: 'Format PDF reports.',
    });
  });
});
