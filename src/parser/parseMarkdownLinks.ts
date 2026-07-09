import { unified } from 'unified';
import remarkParse from 'remark-parse';
import { visit } from 'unist-util-visit';
import type { SkillLink, SkillLinkKind } from '../types/SkillDocument';
import type { SkillDiagnosticRange } from '../types/SkillDiagnostic';

interface UnistPosition {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

interface LinkLikeNode {
  type: string;
  url?: string;
  alt?: string | null;
  children?: Array<{ type: string; value?: string; children?: unknown[] }>;
  position?: UnistPosition;
}

/**
 * Extracts file-referencing Markdown links and images from the body. Anchors,
 * `mailto:`/`tel:` links, and empty targets are ignored — they never point at a
 * resource file, so the link validator should not flag them.
 *
 * @param body Markdown text (frontmatter already stripped).
 * @param bodyStartLine 0-based line where `body` begins in the whole document,
 *   so returned ranges are in document coordinates.
 */
export function parseMarkdownLinks(body: string, bodyStartLine = 0): SkillLink[] {
  const tree = unified().use(remarkParse).parse(body);
  const links: SkillLink[] = [];

  visit(tree, (raw: unknown) => {
    const node = raw as LinkLikeNode;
    if (node.type !== 'link' && node.type !== 'image') {
      return;
    }
    const url = (node.url ?? '').trim();
    if (isIgnorableTarget(url)) {
      return;
    }
    links.push({
      raw: url,
      text: node.type === 'image' ? (node.alt ?? '') : collectText(node),
      kind: classifyLink(url),
      range: nodeRange(node, bodyStartLine),
    });
  });

  return links;
}

export function classifyLink(url: string): SkillLinkKind {
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(url) || url.startsWith('//')) {
    return 'remote';
  }
  if (url.startsWith('/') || /^[a-zA-Z]:[\\/]/.test(url)) {
    return 'absoluteLocal';
  }
  return 'relative';
}

function isIgnorableTarget(url: string): boolean {
  if (url === '' || url.startsWith('#')) {
    return true;
  }
  return /^(mailto:|tel:)/i.test(url);
}

function collectText(node: LinkLikeNode): string {
  const parts: string[] = [];
  const walk = (children?: Array<{ type: string; value?: string; children?: unknown[] }>): void => {
    if (!children) {
      return;
    }
    for (const child of children) {
      if (typeof child.value === 'string') {
        parts.push(child.value);
      }
      if (Array.isArray(child.children)) {
        walk(child.children as Array<{ type: string; value?: string; children?: unknown[] }>);
      }
    }
  };
  walk(node.children);
  return parts.join('');
}

function nodeRange(node: LinkLikeNode, bodyStartLine: number): SkillDiagnosticRange | undefined {
  if (!node.position) {
    return undefined;
  }
  const { start, end } = node.position;
  return {
    startLine: bodyStartLine + start.line - 1,
    startCharacter: Math.max(0, start.column - 1),
    endLine: bodyStartLine + end.line - 1,
    endCharacter: Math.max(0, end.column - 1),
  };
}
