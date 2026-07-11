import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillResource, SkillResourceCategory } from '../types/SkillDocument';
import { matchesAnyGlob } from './globMatch';

/** Default resource-directory exclusions: generated output and VCS metadata. */
export const DEFAULT_RESOURCE_EXCLUDES: readonly string[] = [
  '**/node_modules/**',
  '**/.git/**',
  '**/dist/**',
  '**/out/**',
];

/** Folders that map to a named resource category; anything else is `other`. */
const KNOWN_CATEGORIES: readonly string[] = ['references', 'scripts', 'assets', 'templates'];

/**
 * Enumerates resource files anywhere inside a skill directory (brief §7.6).
 * Recurses through every subfolder, skipping the skill's own `SKILL.md` and any
 * path matching an exclusion glob (defaults skip node_modules/.git/dist/out).
 * `referenced` starts false; the caller marks referenced files.
 */
export function discoverResources(
  skillDir: string,
  exclude: readonly string[] = DEFAULT_RESOURCE_EXCLUDES,
): SkillResource[] {
  const resources: SkillResource[] = [];
  for (const absolutePath of walkFiles(skillDir, skillDir, exclude)) {
    const relativePath = toPosix(path.relative(skillDir, absolutePath));
    if (relativePath === 'SKILL.md') {
      continue;
    }
    resources.push({
      relativePath,
      absolutePath,
      category: categoryFor(relativePath),
      sizeBytes: fileSize(absolutePath),
      referenced: false,
    });
  }
  return resources;
}

function* walkFiles(dir: string, skillDir: string, exclude: readonly string[]): Generator<string> {
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (matchesAnyGlob(toPosix(path.relative(skillDir, full)), exclude)) {
      continue;
    }
    if (entry.isDirectory()) {
      yield* walkFiles(full, skillDir, exclude);
    } else if (entry.isFile()) {
      yield full;
    }
  }
}

function categoryFor(relativePath: string): SkillResourceCategory {
  const top = relativePath.split('/')[0];
  return KNOWN_CATEGORIES.includes(top) ? (top as SkillResourceCategory) : 'other';
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
