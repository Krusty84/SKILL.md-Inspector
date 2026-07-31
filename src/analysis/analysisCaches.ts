import { FileTokenCache } from './fileTokenCache';
import { ResourceCache } from '../parser/resourceCache';

/**
 * The two analysis caches, shared by every path that analyzes a skill.
 *
 * They used to be private to `DiagnosticsProvider`, so the workspace path
 * (`analyzeWorkspace`) ran without either seam: saving one SKILL.md re-walked
 * every skill directory, re-stat'ed every resource and re-BPE-encoded every
 * reference file — for the 499 skills that did not change. Both caches validate
 * their entries on read (mtime + size for tokens, a directory signature for
 * resources), so sharing them across paths is safe.
 *
 * Module-level rather than threaded through every command because the tree
 * view, the workspace report and the index export all reach
 * `computeWorkspaceAnalysis` without a provider reference, and a second cache
 * per path is exactly the duplication this exists to remove.
 */
export const sharedResourceCache = new ResourceCache();
export const sharedFileTokenCache = new FileTokenCache();

/** Drops cached state for one path and everything under it (a watcher event). */
export function invalidateAnalysisCaches(filePath: string): void {
  sharedResourceCache.invalidateFile(filePath);
  sharedFileTokenCache.invalidateUnder(filePath);
}

/** Drops all cached state (a configuration change). */
export function clearAnalysisCaches(): void {
  sharedResourceCache.clear();
  sharedFileTokenCache.clear();
}
