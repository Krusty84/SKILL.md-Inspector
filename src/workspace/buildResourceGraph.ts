import * as fs from 'node:fs';
import type { SkillDocument } from '../types/SkillDocument';
import type { ResourceGraph, ResourceNode, ResourceFlag } from '../types/Workspace';
import { resolveRelativeLinkPath, cleanLinkTarget, canonicalizeLocalPath } from '../parser/linkPaths';

export interface ResourceGraphOptions {
  /** Files at or above this size are flagged `large`. */
  largeBytes?: number;
}

const SCRIPT_EXT = /\.(js|ts|mjs|cjs|sh|bash|py|rb|ps1|bat|cmd)$/i;
const BINARY_EXT =
  /\.(png|jpe?g|gif|webp|bmp|ico|pdf|zip|gz|tar|exe|dll|bin|woff2?|ttf|otf|mp4|mov)$/i;

/**
 * Builds the per-skill resource graph (brief §13.5): resource files (referenced
 * or not), links to missing files, remote/absolute links, plus flags for
 * scripts, binaries, and large files.
 */
export function buildResourceGraph(
  doc: SkillDocument,
  options: ResourceGraphOptions = {},
): ResourceGraph {
  const largeBytes = options.largeBytes ?? 256 * 1024;
  const nodes: ResourceNode[] = [];

  for (const resource of doc.resources) {
    const flags: ResourceFlag[] = [];
    if (resource.category === 'scripts' || SCRIPT_EXT.test(resource.relativePath)) {
      flags.push('script');
    }
    if (BINARY_EXT.test(resource.relativePath)) {
      flags.push('binary');
    }
    if (resource.sizeBytes >= largeBytes) {
      flags.push('large');
    }
    nodes.push({
      path: resource.relativePath,
      kind: resource.referenced ? 'referenced' : 'unreferenced',
      category: resource.category,
      sizeBytes: resource.sizeBytes,
      flags,
    });
  }

  const knownResourcePaths = new Set(
    doc.resources.map((r) => canonicalizeLocalPath(doc.directory, r.absolutePath)),
  );

  for (const link of doc.links) {
    if (link.kind === 'remote') {
      nodes.push({ path: link.raw, kind: 'remote', flags: ['remote'] });
      continue;
    }
    if (link.kind === 'absoluteLocal') {
      nodes.push({ path: link.raw, kind: 'absolute', flags: [] });
      continue;
    }

    // relative link
    const target = resolveRelativeLinkPath(doc.directory, link.raw);
    if (knownResourcePaths.has(canonicalizeLocalPath(doc.directory, link.raw))) {
      continue; // already represented as a (referenced) resource node
    }
    if (fileExists(target)) {
      nodes.push({ path: cleanLinkTarget(link.raw), kind: 'referenced', flags: [] });
    } else {
      nodes.push({ path: cleanLinkTarget(link.raw), kind: 'missing', flags: [] });
    }
  }

  return { nodes };
}

function fileExists(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}
