import * as fs from 'node:fs';
import * as path from 'node:path';
import { matchesAnyGlob } from '../parser/globMatch';

/** Default skill-discovery exclusions: dependency, VCS, and build-output directories. */
export const DEFAULT_SKILL_DISCOVERY_EXCLUDES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
  '**/.vscode-test/**',
];

/**
 * Recursively finds every `SKILL.md` under `rootDir` (brief §13.1). Directories
 * matching an exclusion glob are skipped, so scans never descend into vendored,
 * cached, or nested dependency repositories (defaults skip
 * node_modules/.git/dist/out/.vscode-test). Returns absolute paths, sorted for
 * stable ordering.
 */
export function discoverSkillPaths(
  rootDir: string,
  exclude: readonly string[] = DEFAULT_SKILL_DISCOVERY_EXCLUDES,
): string[] {
  const found: string[] = [];
  walk(rootDir, rootDir, exclude, found);
  return found.sort();
}

function walk(dir: string, rootDir: string, exclude: readonly string[], found: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (matchesAnyGlob(toPosix(path.relative(rootDir, full)), exclude)) {
      continue;
    }
    if (entry.isDirectory()) {
      walk(full, rootDir, exclude, found);
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      found.push(full);
    }
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
