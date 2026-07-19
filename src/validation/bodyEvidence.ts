import type { Code, Heading, RootContent } from 'mdast';
import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { SkillHeading } from '../parser/parseMarkdownHeadings';
import { phraseRegex } from '../quality/textMatch';
import { EXAMPLES_SECTION, matchesSection } from './bodySections';

export interface BodyEvidence {
  headings: SkillHeading[];
  hasExampleEvidence: boolean;
  emptyExampleHeadings: string[];
}

interface MarkdownSection {
  heading: Heading;
  title: string;
  children: RootContent[];
}

/** Parses shared structural evidence once for body diagnostics and scoring. */
export function analyzeBodyEvidence(body: string): BodyEvidence {
  const root = unified().use(remarkParse).parse(body);
  const children = root.children as RootContent[];
  const sections = collectSections(children);
  const exampleSections = sections.filter((section) =>
    matchesSection(section.title, EXAMPLES_SECTION),
  );
  const hasQuickStart = sections.some(
    (section) =>
      phraseRegex('quick start').test(section.title) && hasFencedCode(section.children, body),
  );
  const hasMinimalReproduction = sections.some(
    (section) =>
      phraseRegex('minimal reproduction').test(section.title) &&
      (hasFencedCode(section.children, body) || hasExplicitPair(section.children)),
  );

  return {
    headings: sections.map(({ heading, title }) => ({ text: title, depth: heading.depth })),
    hasExampleEvidence:
      exampleSections.length > 0 ||
      hasQuickStart ||
      hasMinimalReproduction ||
      hasPairedInputOutputFences(children, body),
    emptyExampleHeadings: exampleSections
      .filter((section) => section.children.length === 0)
      .map((section) => section.title),
  };
}

/** True only for recognized, concrete example structures in the Markdown AST. */
export function hasExampleEvidence(body: string): boolean {
  return analyzeBodyEvidence(body).hasExampleEvidence;
}

function collectSections(children: RootContent[]): MarkdownSection[] {
  const sections: MarkdownSection[] = [];
  for (let index = 0; index < children.length; index++) {
    const node = children[index];
    if (node.type !== 'heading') continue;

    const title = collectText(node).trim();
    if (!title) continue;

    let end = index + 1;
    while (end < children.length) {
      const next = children[end];
      if (next.type === 'heading' && next.depth <= node.depth) break;
      end += 1;
    }
    sections.push({ heading: node, title, children: children.slice(index + 1, end) });
  }
  return sections;
}

function hasFencedCode(nodes: RootContent[], body: string): boolean {
  return nodes.some((node) => node.type === 'code' && isFencedCode(node, body));
}

function isFencedCode(node: Code, body: string): boolean {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return false;
  return /^\s*(?:`{3,}|~{3,})/.test(body.slice(start, end));
}

function hasExplicitPair(nodes: RootContent[]): boolean {
  const text = nodes.map(collectText).join('\n');
  return [
    ['fails', 'passes'],
    ['input', 'output'],
    ['before', 'after'],
  ].some(([first, second]) => wordRegex(first).test(text) && wordRegex(second).test(text));
}

function hasPairedInputOutputFences(nodes: RootContent[], body: string): boolean {
  let hasInput = false;
  let hasOutput = false;

  for (let index = 0; index < nodes.length; index++) {
    const node = nodes[index];
    if (node.type !== 'code' || !isFencedCode(node, body)) continue;

    const previous =
      index > 0 && nodes[index - 1].type !== 'heading' ? collectText(nodes[index - 1]) : '';
    const context = `${previous}\n${node.value}`;
    hasInput ||= /(?:^|\n)\s*input\s*:\s*(?:$|\n)/i.test(context);
    hasOutput ||= /(?:^|\n)\s*output\s*:\s*(?:$|\n)/i.test(context);
  }

  return hasInput && hasOutput;
}

function wordRegex(word: string): RegExp {
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${word}(?=$|[^\\p{L}\\p{N}])`, 'iu');
}

function collectText(node: unknown): string {
  if (!node || typeof node !== 'object') return '';
  const candidate = node as { value?: unknown; children?: unknown[] };
  const own = typeof candidate.value === 'string' ? candidate.value : '';
  const nested = candidate.children?.map(collectText).join('') ?? '';
  return `${own}${nested}`;
}
