import * as path from 'node:path';

/** Removes a trailing `#anchor` and/or `?query` from a link target. */
export function cleanLinkTarget(raw: string): string {
  let target = raw.trim();
  const hash = target.indexOf('#');
  if (hash >= 0) {
    target = target.slice(0, hash);
  }
  const query = target.indexOf('?');
  if (query >= 0) {
    target = target.slice(0, query);
  }
  return decodeUriComponentSafe(target);
}

/** Resolves a relative link target to an absolute filesystem path. */
export function resolveRelativeLinkPath(skillDir: string, raw: string): string {
  return path.resolve(skillDir, cleanLinkTarget(raw));
}

/**
 * Canonical absolute key for a local link target OR a discovered file path, so
 * both sides of a "is this file referenced?" comparison normalize identically:
 * decodes `%2F` and friends, strips `#`/`?`, resolves `.`/`..`, and unifies
 * separators. The `impl` parameter lets tests exercise POSIX and Windows rules.
 */
export function canonicalizeLocalPath(
  skillDir: string,
  value: string,
  impl: path.PlatformPath = path,
): string {
  const cleaned = cleanLinkTarget(value);
  const abs = impl.isAbsolute(cleaned) ? cleaned : impl.resolve(skillDir, cleaned);
  return impl.normalize(abs);
}

/**
 * True when `target` lies inside `dir` (or is `dir` itself). Uses `path.relative`
 * rather than a string prefix so a sibling like `<dir>-x` is correctly excluded,
 * and treats an absolute relative-result (Windows different drive) as outside.
 */
export function isPathInsideDir(
  dir: string,
  target: string,
  impl: path.PlatformPath = path,
): boolean {
  const rel = impl.relative(dir, target);
  return rel === '' || (rel !== '..' && !rel.startsWith(`..${impl.sep}`) && !impl.isAbsolute(rel));
}

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
