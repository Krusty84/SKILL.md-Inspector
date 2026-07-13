import * as path from 'node:path';
import { discoverResources } from './discoverResources';
import type { SkillResource } from '../types/SkillDocument';

/**
 * Caches discovered resources per skill directory so repeated full analyses do
 * not rescan the filesystem (Task 59). Invalidate on file create/delete/rename
 * (via {@link invalidateFile}) and on relevant configuration changes (via
 * {@link clear}). Keyed by directory; the exclusion globs are a workspace-wide
 * setting, so a config change clears the whole cache.
 */
export class ResourceCache {
  private readonly cache = new Map<string, SkillResource[]>();

  /** Returns cached resources for `skillDir`, discovering and memoizing on a miss. */
  discover(skillDir: string, exclude?: readonly string[]): SkillResource[] {
    const cached = this.cache.get(skillDir);
    if (cached) {
      return cached;
    }
    const resources = discoverResources(skillDir, exclude);
    this.cache.set(skillDir, resources);
    return resources;
  }

  /** Drops the cache entry for a specific skill directory. */
  invalidateDir(skillDir: string): void {
    this.cache.delete(skillDir);
  }

  /** Drops every cached directory that contains `filePath`. */
  invalidateFile(filePath: string): void {
    for (const dir of [...this.cache.keys()]) {
      if (isInside(dir, filePath)) {
        this.cache.delete(dir);
      }
    }
  }

  /** Clears the entire cache (e.g. when the exclusion configuration changes). */
  clear(): void {
    this.cache.clear();
  }

  /** Number of cached directories (for tests/diagnostics). */
  get size(): number {
    return this.cache.size;
  }
}

function isInside(dir: string, filePath: string): boolean {
  const rel = path.relative(dir, filePath);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}
