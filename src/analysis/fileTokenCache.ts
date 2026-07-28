import * as fs from 'node:fs';
import { isPathInsideDir } from '../parser/linkPaths';
import { countResourceTokens } from './tokenUsage';

interface FileTokenEntry {
  mtimeMs: number;
  size: number;
  /** undefined records "binary or undecodable" so those files are not re-read either. */
  tokens: number | undefined;
}

/**
 * Token counts of resource files, keyed by absolute path and validated against
 * mtime/size on every access. Full analyses re-encode every reference file
 * otherwise, which is the bulk of a full run's cost on skills with sizeable
 * references; a single stat per file replaces read + BPE encode on the
 * unchanged majority. A same-size sub-mtime-granularity edit is caught by the
 * resource watcher's invalidation instead of the stat.
 */
export class FileTokenCache {
  private readonly entries = new Map<string, FileTokenEntry>();

  constructor(
    private readonly compute: (absolutePath: string) => number | undefined = countResourceTokens,
  ) {}

  /** Token count for the file, undefined when it is binary or unreadable. */
  tokensFor(absolutePath: string): number | undefined {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      // Nothing to validate a cache entry against; report the file as-is.
      this.entries.delete(absolutePath);
      return this.compute(absolutePath);
    }
    const cached = this.entries.get(absolutePath);
    if (cached && cached.mtimeMs === stats.mtimeMs && cached.size === stats.size) {
      return cached.tokens;
    }
    const tokens = this.compute(absolutePath);
    this.entries.set(absolutePath, { mtimeMs: stats.mtimeMs, size: stats.size, tokens });
    return tokens;
  }

  /** Drops the entry for `fsPath` and, when it is a directory, everything under it. */
  invalidateUnder(fsPath: string): void {
    for (const key of [...this.entries.keys()]) {
      if (isPathInsideDir(fsPath, key)) {
        this.entries.delete(key);
      }
    }
  }

  /** Clears the entire cache (e.g. on configuration changes). */
  clear(): void {
    this.entries.clear();
  }

  /** Number of cached files (for tests/diagnostics). */
  get size(): number {
    return this.entries.size;
  }
}
