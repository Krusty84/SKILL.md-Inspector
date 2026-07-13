import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';

export interface SkillHeading {
  /** Heading text with original case preserved, trimmed. */
  text: string;
  /** Heading level 1–6 (setext headings are depth 1 or 2). */
  depth: number;
}

interface HeadingNode {
  type: string;
  depth?: number;
  children?: unknown[];
}

/**
 * Collects Markdown headings from the body via the AST, so both ATX (`#`) and
 * setext (underlined) headings are detected while headings inside fenced code
 * blocks are ignored (code is a distinct node type, never `heading`).
 */
export function extractHeadings(body: string): SkillHeading[] {
  const tree = unified().use(remarkParse).parse(body);
  const headings: SkillHeading[] = [];
  visit(tree, 'heading', (node: unknown) => {
    const heading = node as HeadingNode;
    const text = collectText(heading.children).trim();
    if (text) {
      headings.push({ text, depth: heading.depth ?? 1 });
    }
  });
  return headings;
}

function collectText(children: unknown): string {
  const parts: string[] = [];
  const walk = (nodes: unknown): void => {
    if (!Array.isArray(nodes)) {
      return;
    }
    for (const child of nodes as Array<{ value?: unknown; children?: unknown }>) {
      if (typeof child.value === 'string') {
        parts.push(child.value);
      }
      if (Array.isArray(child.children)) {
        walk(child.children);
      }
    }
  };
  walk(children);
  return parts.join('');
}
