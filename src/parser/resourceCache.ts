import * as fs from 'node:fs';
import * as path from 'node:path';
import { discoverResources } from './discoverResources';
import { isPathInsideDir } from './linkPaths';
import type { SkillResource } from '../types/SkillDocument';

/**
 * Caches discovered resources per skill directory so repeated full analyses do
 * not rescan the filesystem (Task 59).
 *
 * Entries are validated on read against a cheap directory signature, the way
 * `FileTokenCache` validates against mtime and size. Keying on the directory
 * alone was not enough: the watcher globs cover
 * `references|scripts|assets|templates`, but `discoverResources` walks the
 * *whole* skill directory, so creating `my-skill/notes.md` or deleting
 * `my-skill/data/spec.md` fired no matching event and the next `validate()` —
 * on save included — was served a stale list.
 *
 * Still invalidated explicitly on watched file events and on configuration
 * changes; the signature is the backstop for what the watcher cannot see.
 */
export class ResourceCache {
  private readonly cache = new Map<string, { signature: string; resources: SkillResource[] }>();

  /** Returns cached resources for `skillDir`, discovering and memoizing on a miss. */
  discover(skillDir: string, exclude?: readonly string[]): SkillResource[] {
    const signature = directorySignature(skillDir);
    const cached = this.cache.get(skillDir);
    if (cached && cached.signature === signature) {
      return cached.resources;
    }
    const resources = discoverResources(skillDir, exclude);
    this.cache.set(skillDir, { signature, resources });
    return resources;
  }

  /** Drops the cache entry for a specific skill directory. */
  invalidateDir(skillDir: string): void {
    this.cache.delete(skillDir);
  }

  /** Drops every cached directory that contains `filePath`. */
  invalidateFile(filePath: string): void {
    for (const dir of [...this.cache.keys()]) {
      if (isPathInsideDir(dir, filePath)) {
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

/**
 * A cheap fingerprint of a directory tree: each directory's mtime and entry
 * count, recursively. Creating, deleting or renaming any entry changes the
 * containing directory's mtime, which is what the watcher globs miss. Editing a
 * file's *contents* does not — but content is not what this cache holds.
 *
 * Bounded so a pathological tree cannot turn a cache read into a full walk.
 */
const MAX_SIGNATURE_DIRECTORIES = 64;

function directorySignature(dir: string): string {
  const parts: string[] = [];
  const pending: string[] = [dir];
  let visited = 0;
  while (pending.length > 0 && visited < MAX_SIGNATURE_DIRECTORIES) {
    const current = pending.shift()!;
    visited += 1;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      parts.push(`${current}:missing`);
      continue;
    }
    let mtimeMs = 0;
    try {
      mtimeMs = fs.statSync(current).mtimeMs;
    } catch {
      // A directory that cannot be stat'ed still contributes its entry count.
    }
    parts.push(`${current}:${mtimeMs}:${entries.length}`);
    for (const entry of entries) {
      if (entry.isDirectory()) {
        pending.push(path.join(current, entry.name));
      }
    }
  }
  if (pending.length > 0) {
    parts.push(`+${pending.length}`);
  }
  return parts.join('|');
}
