/**
 * Minimal glob matcher for resource-exclusion patterns. Supports `**` (any run of
 * path segments), `*` (any run of non-`/` chars), `?` (one non-`/` char), and
 * literal text — enough for directory-exclusion patterns such as node_modules globs.
 * Patterns are matched, anchored, against POSIX-relative paths.
 */
export function matchesAnyGlob(relPosix: string, globs: readonly string[]): boolean {
  return globs.some((glob) => globToRegExp(glob).test(relPosix));
}

const cache = new Map<string, RegExp>();

function globToRegExp(glob: string): RegExp {
  const cached = cache.get(glob);
  if (cached) {
    return cached;
  }
  const re = new RegExp(`^${compile(glob)}$`);
  cache.set(glob, re);
  return re;
}

function compile(glob: string): string {
  let out = '';
  let i = 0;
  while (i < glob.length) {
    if (glob.startsWith('**/', i)) {
      out += '(?:.*/)?'; // any leading segments, including none
      i += 3;
    } else if (glob.startsWith('/**', i) && i + 3 === glob.length) {
      out += '(?:/.*)?'; // trailing segments, including none (matches the bare dir)
      i += 3;
    } else if (glob.startsWith('**', i)) {
      out += '.*';
      i += 2;
    } else if (glob[i] === '*') {
      out += '[^/]*';
      i += 1;
    } else if (glob[i] === '?') {
      out += '[^/]';
      i += 1;
    } else {
      out += escapeRegExpChar(glob[i]);
      i += 1;
    }
  }
  return out;
}

function escapeRegExpChar(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
