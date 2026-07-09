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

function decodeUriComponentSafe(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
