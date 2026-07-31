import { valueOrigin, offsetPosition, type ValueRangeNode } from '../../parser/valueRanges';
import type { SkillDiagnosticRange } from '../../types/SkillDiagnostic';

/**
 * Rendered prose, reassembled across inline Markdown markup.
 *
 * The injection catalog matches phrases — `ignore\s+(?:all\s+)?previous\s+
 * instructions` — but the scanner ran them over one mdast text node at a time,
 * and mdast splits a paragraph at every emphasis, strong, link and inline-code
 * boundary. So one pair of asterisks defeated all fourteen injection rules:
 *
 *   Ignore all previous instructions.      → ignore-previous
 *   Ignore all *previous* instructions.    → nothing
 *
 * The two render identically, and an agent reads the rendered text. A block's
 * `text` is that rendered text; `segments` maps every offset in it back to the
 * source node it came from, so a finding still points at real source columns.
 */
export interface ProseSegment {
  readonly node: ValueRangeNode;
  /** Offset of this node's value within the block's joined text. */
  readonly start: number;
  readonly length: number;
}

export interface ProseBlock {
  readonly text: string;
  readonly segments: readonly ProseSegment[];
}

interface TreeNode extends ValueRangeNode {
  children?: readonly unknown[];
}

/**
 * Block-level containers of phrasing content in the CommonMark mdast that
 * `parseMarkdownRoot` produces. Their descendants are joined into one string;
 * anything else keeps the per-node behaviour.
 */
const PROSE_BLOCK_TYPES = new Set(['paragraph', 'heading']);

/** Node types whose `value` is part of the rendered prose. */
const PROSE_VALUE_TYPES = new Set(['text', 'inlineCode']);

/**
 * Splits a parsed Markdown tree into blocks of rendered prose. A `text` or
 * `inlineCode` node outside any prose block becomes a block of its own, so no
 * text is dropped if the parser ever produces one somewhere unexpected.
 */
export function collectProseBlocks(tree: unknown): ProseBlock[] {
  const blocks: ProseBlock[] = [];

  const append = (target: { text: string; segments: ProseSegment[] }, node: TreeNode): void => {
    const value = node.value ?? '';
    target.segments.push({ node, start: target.text.length, length: value.length });
    target.text += value;
  };

  const walk = (node: TreeNode, current: { text: string; segments: ProseSegment[] } | null): void => {
    if (PROSE_BLOCK_TYPES.has(node.type)) {
      const block = { text: '', segments: [] as ProseSegment[] };
      for (const child of node.children ?? []) {
        walk(child as TreeNode, block);
      }
      if (block.segments.length > 0) {
        blocks.push(block);
      }
      return;
    }
    if (PROSE_VALUE_TYPES.has(node.type) && typeof node.value === 'string' && node.position) {
      if (current) {
        append(current, node);
      } else {
        const block = { text: '', segments: [] as ProseSegment[] };
        append(block, node);
        blocks.push(block);
      }
      return;
    }
    for (const child of node.children ?? []) {
      walk(child as TreeNode, current);
    }
  };

  walk(tree as TreeNode, null);
  return blocks;
}

/**
 * Document range of `block.text[index .. index+length)`. The start and end are
 * resolved in whichever segments contain them, so a phrase interrupted by
 * emphasis still produces a range that spans the real source text.
 */
export function proseRange(
  block: ProseBlock,
  bodyStartLine: number,
  index: number,
  length: number,
): SkillDiagnosticRange | undefined {
  const startSegment = segmentAt(block, index);
  const endSegment = segmentAt(block, Math.max(index, index + length - 1));
  if (!startSegment || !endSegment) {
    return undefined;
  }
  const start = offsetPosition(
    valueOrigin(startSegment.node, bodyStartLine),
    startSegment.node.value ?? '',
    index - startSegment.start,
  );
  const end = offsetPosition(
    valueOrigin(endSegment.node, bodyStartLine),
    endSegment.node.value ?? '',
    index + length - endSegment.start,
  );
  return {
    startLine: start.line,
    startCharacter: start.character,
    endLine: end.line,
    endCharacter: end.character,
  };
}

function segmentAt(block: ProseBlock, index: number): ProseSegment | undefined {
  for (const segment of block.segments) {
    if (index >= segment.start && index < segment.start + segment.length) {
      return segment;
    }
  }
  return block.segments[block.segments.length - 1];
}
