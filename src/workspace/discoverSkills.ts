import * as fs from 'node:fs';
import * as path from 'node:path';

const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'out', '.vscode-test']);

/**
 * Recursively finds every `SKILL.md` under `rootDir` (brief §13.1). Ignored
 * directories (node_modules, .git, build output) are skipped. Returns absolute
 * paths, sorted for stable ordering.
 */
export function discoverSkillPaths(rootDir: string): string[] {
  const found: string[] = [];
  walk(rootDir, found);
  return found.sort();
}

function walk(dir: string, found: string[]): void {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!IGNORED_DIRS.has(entry.name)) {
        walk(path.join(dir, entry.name), found);
      }
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      found.push(path.join(dir, entry.name));
    }
  }
}
