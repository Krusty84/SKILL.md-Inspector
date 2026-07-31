import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { ResourceCache } from '../../src/parser/resourceCache';

/**
 * Plan 17 Part C. `ResourceCache` is keyed on directory alone — no mtime, no
 * size, no signature — while its sibling `FileTokenCache` validates on both. The
 * watcher globs cover `references|scripts|assets|templates`, but
 * `discoverResources` walks the *whole* skill directory, so creating
 * `my-skill/notes.md` fires no matching event and the next `validate()` — save
 * included — is served a stale list.
 */

function makeSkillDir(): { dir: string; dispose(): void } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmd-rescache-'));
  const dir = path.join(root, 'my-skill');
  fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: my-skill\ndescription: x\n---\n');
  fs.writeFileSync(path.join(dir, 'references', 'guide.md'), 'Guide.\n');
  return { dir, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

function relativePaths(cache: ResourceCache, dir: string): string[] {
  return cache
    .discover(dir)
    .map((resource) => resource.relativePath.split(path.sep).join('/'))
    .sort();
}

describe('ResourceCache staleness', () => {
  it('sees a file created outside references|scripts|assets|templates', () => {
    const skill = makeSkillDir();
    try {
      const cache = new ResourceCache();
      expect(relativePaths(cache, skill.dir)).not.toContain('notes.md');
      fs.writeFileSync(path.join(skill.dir, 'notes.md'), 'Notes.\n');
      expect(relativePaths(cache, skill.dir)).toContain('notes.md');
    } finally {
      skill.dispose();
    }
  });

  it('sees a file deleted from a nested directory the watcher does not cover', () => {
    const skill = makeSkillDir();
    try {
      fs.mkdirSync(path.join(skill.dir, 'data'), { recursive: true });
      fs.writeFileSync(path.join(skill.dir, 'data', 'spec.md'), 'Spec.\n');
      const cache = new ResourceCache();
      expect(relativePaths(cache, skill.dir)).toContain('data/spec.md');
      fs.rmSync(path.join(skill.dir, 'data', 'spec.md'));
      expect(relativePaths(cache, skill.dir)).not.toContain('data/spec.md');
    } finally {
      skill.dispose();
    }
  });

  it('still serves an unchanged directory from the cache', () => {
    const skill = makeSkillDir();
    try {
      const cache = new ResourceCache();
      const first = cache.discover(skill.dir);
      expect(cache.discover(skill.dir)).toBe(first);
    } finally {
      skill.dispose();
    }
  });

  it('treats a file whose name starts with dots as inside the directory', () => {
    const skill = makeSkillDir();
    try {
      const cache = new ResourceCache();
      cache.discover(skill.dir);
      expect(cache.size).toBe(1);
      // `..archive-notes.md` is a file *in* the directory, not a parent path.
      // The old `!rel.startsWith('..')` test read it as outside, so its change
      // never invalidated the entry.
      cache.invalidateFile(path.join(skill.dir, '..archive-notes.md'));
      expect(cache.size).toBe(0);
    } finally {
      skill.dispose();
    }
  });
});
