import { describe, it, expect } from 'vitest';
import * as path from 'node:path';
import fc from 'fast-check';
import { isPathInsideDir, canonicalizeLocalPath } from '../src/parser/linkPaths';

const impls = fc.constantFrom(path.posix, path.win32);
const dirFor = (impl: path.PlatformPath): string =>
  impl === path.win32 ? 'C:\\ws\\skills\\demo' : '/ws/skills/demo';

// Safe segments that never escape: no `..`, no leading separator (`.` is allowed).
const safeSegment = fc.constantFrom(
  'references',
  'scripts',
  'assets',
  'sub',
  'a',
  'b',
  'guide.md',
  '.',
);
// Tail segments used after `..` escapes; deliberately excludes ws/skills/demo.
const tailSegment = fc.constantFrom('a', 'b', 'etc', 'passwd', 'secret.md', 'x', 'y');

describe('path containment never admits an escaping path (Task 70)', () => {
  it('a target with a leading parent escape is never contained', () => {
    fc.assert(
      fc.property(impls, fc.array(tailSegment, { minLength: 1, maxLength: 5 }), (impl, tail) => {
        const dir = dirFor(impl);
        // Enough `..` to guarantee the path leaves the skill root regardless of the tail.
        const raw = `..${impl.sep}`.repeat(6) + tail.join(impl.sep);
        expect(isPathInsideDir(dir, canonicalizeLocalPath(dir, raw, impl), impl)).toBe(false);
      }),
    );
  });

  it('a relative path from only safe segments (incl. `.`) stays contained', () => {
    fc.assert(
      fc.property(impls, fc.array(safeSegment, { minLength: 1, maxLength: 6 }), (impl, segs) => {
        const dir = dirFor(impl);
        const raw = segs.join(impl.sep);
        expect(isPathInsideDir(dir, canonicalizeLocalPath(dir, raw, impl), impl)).toBe(true);
      }),
    );
  });

  it('absolute, drive-letter, and UNC targets are never contained', () => {
    const posixDir = '/ws/skills/demo';
    const winDir = 'C:\\ws\\skills\\demo';
    expect(
      isPathInsideDir(
        posixDir,
        canonicalizeLocalPath(posixDir, '/etc/passwd', path.posix),
        path.posix,
      ),
    ).toBe(false);
    expect(
      isPathInsideDir(
        winDir,
        canonicalizeLocalPath(winDir, 'D:\\secret.md', path.win32),
        path.win32,
      ),
    ).toBe(false);
    expect(
      isPathInsideDir(
        winDir,
        canonicalizeLocalPath(winDir, '\\\\server\\share\\x', path.win32),
        path.win32,
      ),
    ).toBe(false);
  });

  it('percent-encoded and mixed separators are decoded/normalized before the check', () => {
    const posixDir = '/ws/skills/demo';
    const winDir = 'C:\\ws\\skills\\demo';
    // %2F decodes to a separator, so this is a real escape rather than a filename.
    expect(
      isPathInsideDir(
        posixDir,
        canonicalizeLocalPath(posixDir, '..%2F..%2Fsecret.md', path.posix),
        path.posix,
      ),
    ).toBe(false);
    // A contained encoded path resolves inside.
    expect(
      isPathInsideDir(
        posixDir,
        canonicalizeLocalPath(posixDir, 'references%2Fguide.md', path.posix),
        path.posix,
      ),
    ).toBe(true);
    // Windows mixed separators: escaping and contained.
    expect(
      isPathInsideDir(
        winDir,
        canonicalizeLocalPath(winDir, 'references/../../../secret.md', path.win32),
        path.win32,
      ),
    ).toBe(false);
    expect(
      isPathInsideDir(
        winDir,
        canonicalizeLocalPath(winDir, 'references\\guide.md', path.win32),
        path.win32,
      ),
    ).toBe(true);
  });
});
