import * as path from 'node:path';
import { parseFrontmatter } from './parseFrontmatter';
import { parseMarkdownLinks } from './parseMarkdownLinks';
import { canonicalizeLocalPath } from './linkPaths';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';

/**
 * Parses SKILL.md text into the normalized document model. Pure: depends only
 * on the file path (for the directory) and the content string — no filesystem
 * access — so it can be unit-tested without a workspace. `resources` is empty;
 * attach discovered resources with {@link withResources}.
 */
export function parseSkillFile(filePath: string, content: string): SkillDocument {
  const fm = parseFrontmatter(content);
  const links = parseMarkdownLinks(fm.body, fm.bodyStartLine);

  return {
    uri: filePath,
    directory: path.dirname(filePath),
    fileName: 'SKILL.md',
    frontmatter: fm.frontmatter,
    frontmatterRange: fm.frontmatterRange,
    frontmatterRaw: fm.frontmatterRaw,
    frontmatterKeyRanges: fm.frontmatterKeyRanges,
    body: fm.body,
    bodyStartLine: fm.bodyStartLine,
    links,
    resources: [],
    parseErrors: fm.errors,
  };
}

/**
 * Returns a copy of the document with discovered resources attached and each
 * resource's `referenced` flag set from the document's relative links. Pure:
 * the resources are supplied by the caller (see `discoverResources`).
 */
export function withResources(doc: SkillDocument, resources: SkillResource[]): SkillDocument {
  const referenced = new Set(
    doc.links
      .filter((link) => link.kind === 'relative')
      .map((link) => canonicalizeLocalPath(doc.directory, link.raw)),
  );
  const withFlags = resources.map((resource) => ({
    ...resource,
    referenced: referenced.has(canonicalizeLocalPath(doc.directory, resource.absolutePath)),
  }));
  return { ...doc, resources: withFlags };
}

/** Convenience for locating the first YAML line for key-range lookups. */
export function frontmatterStartLine(doc: SkillDocument): number {
  return doc.frontmatterRange?.startLine ?? 0;
}
