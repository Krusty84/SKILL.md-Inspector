/**
 * The shared Markdown parse cache: one analysis parses the same body for
 * links, headings, and body evidence, and these tests pin that the cache
 * collapses those into one tree without changing any consumer's output.
 */
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { parseMarkdownRoot } from '../src/parser/markdownAst';
import { parseMarkdownLinks } from '../src/parser/parseMarkdownLinks';
import { extractHeadings } from '../src/parser/parseMarkdownHeadings';
import { analyzeBodyEvidence } from '../src/validation/bodyEvidence';

describe('parseMarkdownRoot', () => {
  it('returns the same tree for repeated parses of the same content', () => {
    const body = '# Title\n\nSome [link](references/a.md).\n';
    const first = parseMarkdownRoot(body);
    expect(parseMarkdownRoot(body)).toBe(first);
    // Value equality is what counts: a re-built string with the same content
    // (a fresh document snapshot) must also hit.
    expect(parseMarkdownRoot(`# Title\n\nSome [link](references/a.md).\n`)).toBe(first);
  });

  it('parses distinct content into distinct trees', () => {
    expect(parseMarkdownRoot('# One\n')).not.toBe(parseMarkdownRoot('# Two\n'));
  });

  it('evicts the least recently used entry once full', () => {
    const first = parseMarkdownRoot('# lru-probe\n');
    for (let index = 0; index < 32; index++) {
      parseMarkdownRoot(`# filler ${index}\n`);
    }
    expect(parseMarkdownRoot('# lru-probe\n')).not.toBe(first);
  });

  it('serves every consumer identical results from cached and fresh parses', () => {
    fc.assert(
      fc.property(fc.string({ maxLength: 400 }), (body) => {
        // Freshly composed content (miss) followed by a cached parse: link,
        // heading, and evidence extraction must not depend on which one ran.
        const fresh = {
          links: parseMarkdownLinks(body),
          headings: extractHeadings(body),
          evidence: analyzeBodyEvidence(body),
        };
        const cached = {
          links: parseMarkdownLinks(body),
          headings: extractHeadings(body),
          evidence: analyzeBodyEvidence(body),
        };
        expect(cached).toEqual(fresh);
      }),
      { numRuns: 60 },
    );
  });
});
