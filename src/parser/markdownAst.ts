import { unified } from 'unified';
import remarkParse from 'remark-parse';
import type { Root } from 'mdast';

/**
 * One frozen processor for every Markdown parse. Rebuilding the unified
 * pipeline per call (`unified().use(remarkParse)`) re-runs plugin setup each
 * time; parsing is stateless, so a single frozen instance serves all callers.
 */
const processor = unified().use(remarkParse).freeze();

/**
 * A single analysis parses the same body for links, headings, and body
 * evidence; a small LRU collapses those into one parse. Keys are the body
 * strings themselves (the callers already retain them), so the entries add
 * only references.
 */
const AST_CACHE = new Map<string, Root>();
const AST_CACHE_MAX_ENTRIES = 8;

/**
 * Parses Markdown into an mdast Root, serving repeated parses of the same
 * content from the cache.
 *
 * The returned tree is SHARED between callers and across calls: consumers must
 * treat it as read-only and never mutate nodes or reorder children.
 */
export function parseMarkdownRoot(body: string): Root {
  const cached = AST_CACHE.get(body);
  if (cached !== undefined) {
    // Re-insert to keep eviction least-recently-used.
    AST_CACHE.delete(body);
    AST_CACHE.set(body, cached);
    return cached;
  }
  const root = processor.parse(body);
  if (AST_CACHE.size >= AST_CACHE_MAX_ENTRIES) {
    const oldest = AST_CACHE.keys().next().value;
    if (oldest !== undefined) {
      AST_CACHE.delete(oldest);
    }
  }
  AST_CACHE.set(body, root);
  return root;
}
