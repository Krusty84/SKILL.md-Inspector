import { describe, it, expect } from 'vitest';
import { renderToc, slugify, type TocEntry } from '../src/ui/reportToc';

describe('slugify', () => {
  it('lowercases and hyphenates spaces and punctuation', () => {
    expect(slugify('Reference files')).toBe('reference-files');
    expect(slugify('Collision matrix')).toBe('collision-matrix');
    expect(slugify('Token usage (o200k_base)')).toBe('token-usage-o200k-base');
  });

  it('trims leading and trailing separators', () => {
    expect(slugify('  Duplicate names!  ')).toBe('duplicate-names');
  });
});

describe('renderToc', () => {
  const entries: readonly TocEntry[] = [
    { id: 'skills', label: 'Skills' },
    {
      id: 'token-usage',
      label: 'Token usage',
      children: [{ id: 'reference-files', label: 'Reference files' }],
    },
  ];

  it('renders a nav with one anchor link per entry', () => {
    const html = renderToc(entries);
    expect(html).toContain('class="report-toc"');
    expect(html).toContain('<a href="#skills">Skills</a>');
    expect(html).toContain('<a href="#token-usage">Token usage</a>');
  });

  it('nests child entries in a sub-list', () => {
    const html = renderToc(entries);
    // The child link appears inside a nested <ul>.
    expect(html).toContain('<a href="#reference-files">Reference files</a>');
    expect(html).toMatch(/<a href="#token-usage">Token usage<\/a><ul>/);
  });

  it('escapes labels and ids', () => {
    const html = renderToc([{ id: 'x', label: '<img src=x>' }]);
    expect(html).not.toContain('<img src=x>');
    expect(html).toContain('&lt;img src=x&gt;');
  });
});
