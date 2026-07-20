import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../src/parser/parseFrontmatter';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

describe('parseFrontmatter', () => {
  it('parses valid frontmatter and separates the body', () => {
    const content = [
      '---',
      'name: pdf-report-formatter',
      'description: Format reports.',
      '---',
      '',
      '# Body',
      'text',
    ].join('\n');
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

  it('exposes value ranges that span multi-line scalars (for safe quick-fix edits)', () => {
    // Quick fixes append to the *end of the value*; for a block or quoted scalar
    // that end is not on the key's line. The value range must reach the last line
    // of the value so an appended clause does not corrupt the YAML.
    const single = parseFrontmatter('---\nname: demo\ndescription: Format things.\n---\n# B');
    // `description` is on line 2 (0-based); value ends on the same line.
    expect(single.frontmatterValueRanges['description'].startLine).toBe(2);
    expect(single.frontmatterValueRanges['description'].endLine).toBe(2);

    const folded = parseFrontmatter(
      '---\nname: demo\ndescription: >\n  Formats things\n  across files.\n---\n# B',
    );
    // The folded value continues onto lines 3-4; the range must reach line 4,
    // not stop at the key line (2).
    expect(folded.frontmatterKeyRanges['description'].startLine).toBe(2);
    expect(folded.frontmatterValueRanges['description'].endLine).toBe(4);

    const quoted = parseFrontmatter(
      '---\nname: demo\ndescription: "Format things\n  across files"\n---\n# B',
    );
    expect(quoted.frontmatterValueRanges['description'].endLine).toBe(3);
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

  it('exposes top-level key ranges from the AST', () => {
    const content = ['---', 'name: demo', 'description: text', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatterKeyRanges['name'].startLine).toBe(1);
    expect(result.frontmatterKeyRanges['description'].startLine).toBe(2);
  });

  it('locates quoted keys correctly (Task 51)', () => {
    const content = ['---', '"name": demo', "'description': text", '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatter).toEqual({ name: 'demo', description: 'text' });
    expect(result.frontmatterKeyRanges['name'].startLine).toBe(1);
    expect(result.frontmatterKeyRanges['description'].startLine).toBe(2);
  });

  it('does not treat a nested key as a top-level key (Task 52)', () => {
    const content = ['---', 'metadata:', '  name: nested-name', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.frontmatterKeyRanges['metadata']).toBeDefined();
    expect(result.frontmatterKeyRanges['name']).toBeUndefined();
    expect(result.frontmatter?.name).toBeUndefined();
  });

  it('points a multiline value key range at the key line (Task 51)', () => {
    const content = ['---', 'name: n', 'description: >', '  line one', '  line two', '---'].join(
      '\n',
    );
    const result = parseFrontmatter(content);
    expect(result.frontmatterKeyRanges['description'].startLine).toBe(2);
    expect(typeof result.frontmatter?.description).toBe('string');
  });

  it('reports a duplicate top-level key at the duplicate (Task 50)', () => {
    const content = ['---', 'name: first', 'name: second', 'description: d', '---'].join('\n');
    const result = parseFrontmatter(content);
    const dup = result.errors.find((e) => e.code === DiagnosticCode.FrontmatterDuplicateKey);
    expect(dup).toBeDefined();
    expect(dup?.range?.startLine).toBe(2); // the second `name:` line
    // Still parses (last value wins) so the other rules can still run.
    expect(result.frontmatter).toEqual({ name: 'second', description: 'd' });
  });

  it('points the key range of a duplicated key at the last (effective) occurrence', () => {
    const content = ['---', 'name: first', 'name: second', 'description: d', '---'].join('\n');
    const result = parseFrontmatter(content);
    // toJS() keeps `second`, so key-targeted diagnostics must underline line 2.
    expect(result.frontmatterKeyRanges['name'].startLine).toBe(2);
    expect(result.frontmatterKeyRanges['description'].startLine).toBe(3);
  });

  it('reports a duplicate description key (Task 50)', () => {
    const content = ['---', 'name: n', 'description: a', 'description: b', '---'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.errors.some((e) => e.code === DiagnosticCode.FrontmatterDuplicateKey)).toBe(true);
  });
});

describe('frontmatter fence regression cases', () => {
  it('accepts fences with trailing whitespace', () => {
    const content = ['---  ', 'name: demo', 'description: Demo text.', '--- ', '# Body'].join('\n');
    const result = parseFrontmatter(content);
    expect(result.errors).toHaveLength(0);
    expect(result.frontmatter?.name).toBe('demo');
    expect(result.bodyStartLine).toBe(4);
    expect(result.body).toContain('# Body');
  });

  it('still rejects an indented opening fence', () => {
    const content = ['  ---', 'name: x', '---'].join('\n');
    expect(parseFrontmatter(content).errors[0].code).toBe(DiagnosticCode.FrontmatterMissing);
  });

  it('does not close on indented literal or folded scalar delimiters', () => {
    for (const indicator of ['|', '>']) {
      const parsed = parseFrontmatter(
        `---\nname: demo\ndescription: ${indicator}\n  First line.\n  ---\n  Second line.\n---\n# Body`,
      );
      expect(parsed.frontmatter?.name).toBe('demo');
      expect(parsed.body).toContain('# Body');
    }
  });
  it('treats a markdown thematic break as missing frontmatter', () => {
    expect(parseFrontmatter('# Demo\n\n---\n\nMore').errors[0].code).toBe(
      'skill.frontmatter.missing',
    );
  });
  it('detects plausible later frontmatter and preserves BOM and CRLF', () => {
    expect(
      parseFrontmatter('Leading\n---\nname: demo\ndescription: Demo\n---').errors[0].code,
    ).toBe('skill.frontmatter.notAtTop');
    expect(
      parseFrontmatter('\ufeff---\r\nname: demo\r\ndescription: Demo\r\n---').frontmatter?.name,
    ).toBe('demo');
  });
});
