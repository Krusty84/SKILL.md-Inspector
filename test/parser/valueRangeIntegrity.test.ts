import { describe, it, expect } from 'vitest';
import { parseFrontmatter } from '../../src/parser/parseFrontmatter';

/**
 * Plan 14 Part A. `frontmatterValueRanges` is what the `InsertUseWhenClause` and
 * "replace the whole entry" quick fixes edit against. If the stored end offset
 * reaches past the value's last content character — as it does for a YAML block
 * scalar, whose node range ends at column 0 of the *next* line — an append at the
 * value end lands inside the following key and the file stops parsing.
 *
 * These cases apply the same synthetic edit the quick fix applies and assert the
 * document still parses to the same key set afterwards.
 */

const CLAUSE = ' Use when <describe when to use this skill>.';

/** Splits on the same logical lines `parseFrontmatter` uses. */
function toLines(content: string): string[] {
  return content.split('\n');
}

/** Applies `text` at (line, character) exactly as `WorkspaceEdit.insert` would. */
function insertAt(content: string, line: number, character: number, text: string): string {
  const lines = toLines(content);
  const target = lines[line] ?? '';
  lines[line] = target.slice(0, character) + text + target.slice(character);
  return lines.join('\n');
}

/** Replaces the (line, character) span exactly as `WorkspaceEdit.replace` would. */
function replaceRange(
  content: string,
  start: { line: number; character: number },
  end: { line: number; character: number },
  text: string,
): string {
  const lines = toLines(content);
  const head = (lines[start.line] ?? '').slice(0, start.character);
  const tail = (lines[end.line] ?? '').slice(end.character);
  lines.splice(start.line, end.line - start.line + 1, head + text + tail);
  return lines.join('\n');
}

/**
 * Mirrors `SkillCodeActionProvider.appendToDescription`: quoted scalars are
 * rebuilt as a re-serialized entry (a raw append would land outside the quotes),
 * everything else takes a plain insert at the value end.
 */
function appendToDescription(content: string): string {
  const parsed = parseFrontmatter(content);
  const keyRange = parsed.frontmatterKeyRanges['description'];
  const valueRange = parsed.frontmatterValueRanges['description'];
  expect(valueRange, 'description must have a value range').toBeDefined();
  const firstChar = toLines(content)[valueRange.startLine]?.[valueRange.startCharacter];
  if (firstChar === '"' || firstChar === "'") {
    const combined = String(parsed.frontmatter?.description) + CLAUSE;
    return replaceRange(
      content,
      { line: keyRange.startLine, character: keyRange.startCharacter },
      { line: valueRange.endLine, character: valueRange.endCharacter },
      `description: ${JSON.stringify(combined)}`,
    );
  }
  return insertAt(content, valueRange.endLine, valueRange.endCharacter, CLAUSE);
}

interface Style {
  readonly label: string;
  /** The `description:` entry, as physical lines. */
  readonly entry: string[];
}

const STYLES: Style[] = [
  { label: 'plain', entry: ['description: Does a thing.'] },
  { label: 'single-quoted', entry: ["description: 'Does a thing.'"] },
  { label: 'double-quoted', entry: ['description: "Does a thing."'] },
  { label: 'block literal', entry: ['description: |', '  Does a thing.'] },
  { label: 'block folded', entry: ['description: >', '  Does a thing.'] },
  {
    label: 'multiline plain',
    entry: ['description: Does a thing', '  across several files.'],
  },
];

const POSITIONS = [
  { label: 'last key', trailing: [] as string[], keys: ['name', 'description'] },
  { label: 'followed by another key', trailing: ['license: MIT'], keys: ['name', 'description', 'license'] },
];

function build(style: Style, trailing: string[]): string {
  return ['---', 'name: my-skill', ...style.entry, ...trailing, '---', '', '# Body', ''].join('\n');
}

describe('frontmatter value range integrity (plan 14 part A)', () => {
  for (const style of STYLES) {
    for (const position of POSITIONS) {
      it(`${style.label} × ${position.label} survives an append-at-value-end edit`, () => {
        const original = build(style, position.trailing);
        const before = parseFrontmatter(original);
        expect(Object.keys(before.frontmatter ?? {})).toEqual(position.keys);

        const edited = appendToDescription(original);
        const after = parseFrontmatter(edited);

        expect(after.errors, `edited document must still parse:\n${edited}`).toHaveLength(0);
        expect(after.frontmatter).not.toBeNull();
        expect(Object.keys(after.frontmatter ?? {})).toEqual(position.keys);
        // The other keys keep their values — an edit that swallows `license: MIT`
        // into the description would still leave the key set intact if the fence
        // moved, so assert the values too.
        expect(after.frontmatter?.name).toBe('my-skill');
        for (const key of position.keys) {
          if (key === 'description') continue;
          expect(before.frontmatter?.[key]).toBe(after.frontmatter?.[key]);
        }
        expect(String(after.frontmatter?.description)).toContain('Use when');
      });
    }
  }

  it('ends a block-scalar value range on the last content line, not the next key', () => {
    const content = [
      '---',
      'name: my-skill',
      'description: |',
      '  Does a thing.',
      'license: MIT',
      '---',
      '',
    ].join('\n');
    const range = parseFrontmatter(content).frontmatterValueRanges['description'];
    // Line 3 is "  Does a thing."; the value must not reach line 4 ("license: MIT").
    expect(range.endLine).toBe(3);
    expect(range.endCharacter).toBe('  Does a thing.'.length);
  });

  it('keeps the single-line plain scalar range exact', () => {
    const content = ['---', 'name: demo', 'description: Format things.', '---', '# B'].join('\n');
    const range = parseFrontmatter(content).frontmatterValueRanges['description'];
    expect(range.startLine).toBe(2);
    expect(range.startCharacter).toBe(13);
    expect(range.endLine).toBe(2);
    expect(range.endCharacter).toBe('description: Format things.'.length);
  });
});
