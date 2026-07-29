import type { SkillDiagnosticRange } from '../types/SkillDiagnostic';

/** Document position of a character (0-based line, 0-based column). */
export interface ValueOrigin {
  line: number;
  character: number;
}

/** The minimal shape {@link valueOrigin} needs from an mdast node. */
export interface ValueRangeNode {
  type: string;
  value?: string;
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

/**
 * Document position of `node.value[0]`, accounting for code fences and inline
 * backticks so a match offset inside the value maps to the right column.
 *
 * @param bodyStartLine 0-based line where the Markdown body begins in the whole
 *   document, so the returned origin is in document coordinates.
 */
export function valueOrigin(node: ValueRangeNode, bodyStartLine: number): ValueOrigin {
  const { start, end } = node.position!;
  const line = bodyStartLine + start.line - 1;
  if (node.type === 'code') {
    // Fenced block: content begins on the line after the opening fence, column 0.
    return { line: line + 1, character: 0 };
  }
  if (node.type === 'inlineCode' && start.line === end.line) {
    const backticks = Math.max(
      1,
      Math.floor((end.column - start.column - (node.value ?? '').length) / 2),
    );
    return { line, character: start.column - 1 + backticks };
  }
  // Plain text (and any fallback): the value starts exactly at the node position.
  return { line, character: start.column - 1 };
}

/**
 * Range of a `length`-character match that starts at `value[index]`, walking
 * newlines from the value origin so a match spanning into later lines of a
 * fenced block still resolves to the correct document line/column.
 */
export function offsetRange(
  origin: ValueOrigin,
  value: string,
  index: number,
  length: number,
): SkillDiagnosticRange {
  let line = origin.line;
  let character = origin.character;
  for (let i = 0; i < index; i++) {
    if (value.charCodeAt(i) === 10 /* \n */) {
      line += 1;
      character = 0;
    } else {
      character += 1;
    }
  }
  return {
    startLine: line,
    startCharacter: character,
    endLine: line,
    endCharacter: character + length,
  };
}
