import * as fs from 'node:fs';
import { isPathInsideDir } from '../parser/linkPaths';
import { countResourceTokens } from './tokenUsage';

interface FileTokenEntry {
  mtimeMs: number;
  size: number;
  /** The cap the count was produced under; a changed cap must not serve a stale answer. */
  maxBytes: number | undefined;
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
    private readonly compute: (
      absolutePath: string,
      maxBytes: number | undefined,
    ) => number | undefined = (absolutePath, maxBytes) =>
      countResourceTokens(absolutePath, undefined, { maxBytes }),
  ) {}

  /**
   * Token count for the file, undefined when it is binary, unreadable, or above
   * `maxBytes` (see `countResourceTokens`).
   */
  tokensFor(absolutePath: string, maxBytes?: number): number | undefined {
    let stats: fs.Stats;
    try {
      stats = fs.statSync(absolutePath);
    } catch {
      // Nothing to validate a cache entry against; report the file as-is.
      this.entries.delete(absolutePath);
      return this.compute(absolutePath, maxBytes);
    }
    const cached = this.entries.get(absolutePath);
    if (
      cached &&
      cached.mtimeMs === stats.mtimeMs &&
      cached.size === stats.size &&
      cached.maxBytes === maxBytes
    ) {
      return cached.tokens;
    }
    const tokens = this.compute(absolutePath, maxBytes);
    this.entries.set(absolutePath, {
      mtimeMs: stats.mtimeMs,
      size: stats.size,
      maxBytes,
      tokens,
    });
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
