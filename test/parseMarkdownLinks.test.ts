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

describe('parseMarkdownLinks resource-path detection', () => {
  it('detects a resource path written in prose', () => {
    const links = parseMarkdownLinks('Run scripts/extract.py.');
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ raw: 'scripts/extract.py', kind: 'relative' });
  });

  it('detects a resource path in inline code with an accurate range', () => {
    const links = parseMarkdownLinks('Run `scripts/extract.py` now.');
    expect(links).toHaveLength(1);
    expect(links[0].raw).toBe('scripts/extract.py');
    expect(links[0].range).toMatchObject({ startLine: 0, startCharacter: 5, endCharacter: 23 });
  });

  it('detects a resource path in a fenced code block with an accurate range', () => {
    const body = ['```bash', 'node scripts/process.js', '```'].join('\n');
    const link = parseMarkdownLinks(body).find((l) => l.raw === 'scripts/process.js');
    expect(link).toBeDefined();
    expect(link?.range).toMatchObject({ startLine: 1, startCharacter: 5, endCharacter: 23 });
  });

  it('detects other resource extensions and folders', () => {
    expect(parseMarkdownLinks('See references/style-guide.md.')[0]?.raw).toBe(
      'references/style-guide.md',
    );
    expect(parseMarkdownLinks('Icon: assets/icon.svg here.')[0]?.raw).toBe('assets/icon.svg');
  });

  it('does not treat commands or ordinary prose as file paths', () => {
    expect(parseMarkdownLinks('Run `npm run build` to compile.')).toHaveLength(0);
    expect(parseMarkdownLinks('This tool formats reports and documents.')).toHaveLength(0);
  });

  it('does not double-count a markdown link as a prose mention', () => {
    expect(parseMarkdownLinks('See [guide](./references/guide.md).')).toHaveLength(1);
  });
});
