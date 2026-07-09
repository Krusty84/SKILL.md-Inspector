import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillResource, SkillResourceCategory } from '../types/SkillDocument';

/** Well-known resource folders inside a skill package (brief §7.6). */
const RESOURCE_CATEGORIES: SkillResourceCategory[] = [
  'references',
  'scripts',
  'assets',
  'templates',
];

/**
 * Enumerates resource files inside a skill directory. Recurses into the
 * well-known folders (`references/`, `scripts/`, `assets/`, `templates/`).
 * `referenced` starts false; the caller marks referenced files.
 */
export function discoverResources(skillDir: string): SkillResource[] {
  const resources: SkillResource[] = [];
  for (const category of RESOURCE_CATEGORIES) {
    const dir = path.join(skillDir, category);
    if (!isDirectory(dir)) {
      continue;
    }
    for (const absolutePath of walkFiles(dir)) {
      resources.push({
        relativePath: toPosix(path.relative(skillDir, absolutePath)),
        absolutePath,
        category,
        sizeBytes: fileSize(absolutePath),
        referenced: false,
      });
    }
  }
  return resources;
}

function* walkFiles(dir: string): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walkFiles(full);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function isDirectory(target: string): boolean {
  try {
    return fs.statSync(target).isDirectory();
  } catch {
    return false;
  }
}

function fileSize(target: string): number {
  try {
    return fs.statSync(target).size;
  } catch {
    return 0;
  }
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
