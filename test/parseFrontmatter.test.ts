import { describe, it, expect } from 'vitest';
import { parseFrontmatter, locateFrontmatterKey } from '../src/parser/parseFrontmatter';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and separates the body', () => {
    const content = ['---', 'name: pdf-report-formatter', 'description: Format reports.', '---', '', '# Body', 'text'].join('\n');
    const result = parseFrontmatter(content);

    expect(result.errors).toHaveLength(0);
    expect(result.frontmatter).toEqual({
      name: 'pdf-report-formatter',
      description: 'Format reports.',
    });
    expect(result.body.trim()).toBe('# Body\ntext');
    expect(result.bodyStartLine).toBe(4);
  });

  it('reports missing frontmatter when there is no fence', () => {
    const result = parseFrontmatter('# Just a heading\n\nSome text.');
    expect(result.frontmatter).toBeNull();
    expect(result.errors[0].code).toBe(DiagnosticCode.FrontmatterMissing);
  });

  it('reports frontmatter that is not at the top of the file', () => {
    const content = ['Leading text', '---', 'name: x', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.errors[0].code).toBe(DiagnosticCode.FrontmatterNotAtTop);
  });

  it('treats a leading blank line before the fence as not-at-top', () => {
    const content = ['', '---', 'name: x', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.errors[0].code).toBe(DiagnosticCode.FrontmatterNotAtTop);
  });

  it('reports unterminated frontmatter', () => {
    const content = ['---', 'name: x', 'description: y'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.errors[0].code).toBe(DiagnosticCode.FrontmatterInvalid);
  });

  it('reports malformed YAML with a range', () => {
    const content = ['---', 'name: "unterminated', 'description: y', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toBeNull();
    expect(result.errors[0].code).toBe(DiagnosticCode.FrontmatterInvalid);
    expect(result.errors[0].range).toBeDefined();
  });

  it('treats an empty frontmatter block as an empty mapping', () => {
    const content = ['---', '---', '# Body'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.errors).toHaveLength(0);
    expect(result.frontmatter).toEqual({});
  });

  it('locates a frontmatter key line for ranges', () => {
    const content = ['---', 'name: demo', 'description: text', '---'].join('\n');
    const result = parseFrontmatter(content);
    const range = locateFrontmatterKey(result.frontmatterRaw, result.yamlStartLine, 'description');
    expect(range?.startLine).toBe(2);
  });
});
