import { describe, it, expect } from 'vitest';
import { parseMarkdownLinks, classifyLink } from '../src/parser/parseMarkdownLinks';

describe('classifyLink', () => {
  it('classifies relative, absolute, and remote targets', () => {
    expect(classifyLink('./references/style.md')).toBe('relative');
    expect(classifyLink('scripts/run.js')).toBe('relative');
    expect(classifyLink('/etc/hosts')).toBe('absoluteLocal');
    expect(classifyLink('C:\\Users\\x')).toBe('absoluteLocal');
    expect(classifyLink('https://example.com/a')).toBe('remote');
    expect(classifyLink('//cdn.example.com/a')).toBe('remote');
  });
});

describe('parseMarkdownLinks', () => {
  it('extracts links and images with document-relative ranges', () => {
    const body = ['See [guide](./references/g.md).', '', '![logo](assets/logo.png)'].join('\n');
    const links = parseMarkdownLinks(body, 4);

    expect(links).toHaveLength(2);
    expect(links[0]).toMatchObject({ raw: './references/g.md', text: 'guide', kind: 'relative' });
    expect(links[0].range?.startLine).toBe(4); // body line 0 -> document line 4
    expect(links[1]).toMatchObject({ raw: 'assets/logo.png', text: 'logo', kind: 'relative' });
  });

  it('ignores anchors, mailto, and empty targets', () => {
    const body = '[a](#section) [b](mailto:x@y.com) [c]()';
    expect(parseMarkdownLinks(body)).toHaveLength(0);
  });
});
