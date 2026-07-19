import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import { isPathInsideDir, canonicalizeLocalPath } from '../src/parser/linkPaths';

describe('isPathInsideDir (POSIX)', () => {
  const dir = '/ws/skills/demo';

  it('accepts nested paths and the directory itself', () => {
    expect(isPathInsideDir(dir, '/ws/skills/demo/references/guide.md', path.posix)).toBe(true);
    expect(isPathInsideDir(dir, '/ws/skills/demo/scripts/run.js', path.posix)).toBe(true);
    expect(isPathInsideDir(dir, dir, path.posix)).toBe(true);
  });

  it('rejects parent-escaping paths', () => {
    expect(isPathInsideDir(dir, '/ws/skills/shared/file.md', path.posix)).toBe(false);
    expect(isPathInsideDir(dir, '/ws/.env', path.posix)).toBe(false);
  });

  it('rejects a sibling that shares a name prefix', () => {
    expect(isPathInsideDir(dir, '/ws/skills/demo-x/file.md', path.posix)).toBe(false);
  });
});

describe('isPathInsideDir (Windows)', () => {
  const dir = 'C:\\ws\\skills\\demo';

  it('accepts a nested path', () => {
    expect(isPathInsideDir(dir, 'C:\\ws\\skills\\demo\\references\\guide.md', path.win32)).toBe(
      true,
    );
  });

  it('rejects a parent-escaping path', () => {
    expect(isPathInsideDir(dir, 'C:\\ws\\.env', path.win32)).toBe(false);
  });

  it('rejects a path on a different drive', () => {
    expect(isPathInsideDir(dir, 'D:\\secret.md', path.win32)).toBe(false);
  });
});

describe('canonicalizeLocalPath', () => {
  it('resolves the ./, encoded, and ..-segment variants to one key (POSIX)', () => {
    const dir = '/ws/skills/demo';
    const expected = '/ws/skills/demo/references/guide.md';
    for (const raw of [
      'references/guide.md',
      './references/guide.md',
      'references%2Fguide.md',
      'references/sub/../guide.md',
    ]) {
      expect(canonicalizeLocalPath(dir, raw, path.posix)).toBe(expected);
    }
  });

  it('canonicalizes a discovered absolute path to the same key as its relative link', () => {
    const dir = '/ws/skills/demo';
    expect(canonicalizeLocalPath(dir, '/ws/skills/demo/references/guide.md', path.posix)).toBe(
      canonicalizeLocalPath(dir, './references/guide.md', path.posix),
    );
  });

  it('unifies separators on Windows', () => {
    const dir = 'C:\\ws\\skills\\demo';
    expect(
      canonicalizeLocalPath(dir, 'C:\\ws\\skills\\demo\\references\\guide.md', path.win32),
    ).toBe(canonicalizeLocalPath(dir, 'references/guide.md', path.win32));
  });
});
