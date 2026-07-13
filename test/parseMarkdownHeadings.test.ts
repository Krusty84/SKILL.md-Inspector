import { describe, it, expect } from 'vitest';
import { extractHeadings } from '../src/parser/parseMarkdownHeadings';

describe('extractHeadings (Task 53)', () => {
  it('detects ATX headings', () => {
    const headings = extractHeadings('# Title\n\n## When to use\n\ntext');
    expect(headings.map((h) => h.text)).toEqual(['Title', 'When to use']);
  });

  it('detects setext headings', () => {
    const headings = extractHeadings('Examples\n--------\n\nUsage\n=====\n');
    expect(headings.map((h) => h.text)).toEqual(expect.arrayContaining(['Examples', 'Usage']));
  });

  it('ignores headings inside fenced code blocks', () => {
    const body = ['# Real heading', '', '```', '# not a heading', '```', ''].join('\n');
    const headings = extractHeadings(body);
    expect(headings.map((h) => h.text)).toEqual(['Real heading']);
  });
});
