import { visit } from 'unist-util-visit';
import { parseMarkdownRoot } from './markdownAst';
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
  value?: string;
  identifier?: string;
  label?: string;
  children?: Array<{ type: string; value?: string; children?: unknown[] }>;
  position?: UnistPosition;
}

/**
 * A resource path written in prose or code: starts with a known resource folder,
 * has a path separator and a file extension, and is not a URL. Conservative on
 * purpose so ordinary prose and shell commands (`npm run build`) are not matched.
 */
const RESOURCE_PATH_RE =
  /(?<![\w./-])(?:\.\/)?(?:references|scripts|assets|templates)\/[\w./-]*\.\w+/g;

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
  const tree = parseMarkdownRoot(body);
  const links: SkillLink[] = [];

  visit(tree, (raw: unknown, _index: number | undefined, parent: unknown) => {
    const node = raw as LinkLikeNode;
    if (node.type === 'link' || node.type === 'image') {
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
      return;
    }

    // Reference-style definitions (`[id]: references/file.md`) carry the target
    // for every `[text][id]` / `[id]` reference in the body, so validating the
    // definition validates them all. The range spans the whole definition line
    // (mdast exposes no separate position for the URL).
    if (node.type === 'definition') {
      const url = (node.url ?? '').trim();
      if (isIgnorableTarget(url)) {
        return;
      }
      links.push({
        raw: url,
        text: node.label ?? node.identifier ?? '',
        kind: classifyLink(url),
        range: nodeRange(node, bodyStartLine),
      });
      return;
    }

    // Resource paths written in prose, inline code, or fenced code blocks
    // (brief §7.5). Skip a link/image's own text and inline code — the link is
    // already captured, and scanning its children would duplicate it.
    if (node.type === 'text' || node.type === 'inlineCode' || node.type === 'code') {
      const parentType = (parent as { type?: string } | null | undefined)?.type;
      if (
        (node.type === 'text' || node.type === 'inlineCode') &&
        (parentType === 'link' || parentType === 'image')
      ) {
        return;
      }
      collectResourcePaths(node, bodyStartLine, links);
    }
  });

  return links;
}

/** Extracts resource-like paths from a text/inlineCode/code node's value. */
function collectResourcePaths(node: LinkLikeNode, bodyStartLine: number, links: SkillLink[]): void {
  const value = node.value;
  if (typeof value !== 'string' || !node.position) {
    return;
  }
  const origin = valueOrigin(node, bodyStartLine);
  RESOURCE_PATH_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = RESOURCE_PATH_RE.exec(value)) !== null) {
    const raw = match[0];
    if (classifyLink(raw) === 'remote') {
      continue;
    }
    links.push({
      raw,
      text: raw,
      kind: classifyLink(raw),
      range: pathRange(origin, value, match.index, raw.length),
    });
  }
}

/** Document position of `node.value[0]`, accounting for code fences/backticks. */
function valueOrigin(
  node: LinkLikeNode,
  bodyStartLine: number,
): { line: number; character: number } {
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

/** Range of a match inside `value`, walking newlines from the value origin. */
function pathRange(
  origin: { line: number; character: number },
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
