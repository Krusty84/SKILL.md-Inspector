/**
 * Minimal glob matcher for resource-exclusion patterns. Supports `**` (any run of
 * path segments), `*` (any run of non-`/` chars), `?` (one non-`/` char),
 * single-level brace alternation `{a,b,c}` (each alternative compiled with the same
 * rules, so `*`, `?`, and `**` work inside), and literal text — enough for
 * directory-exclusion patterns such as node_modules globs. Patterns are matched,
 * anchored, against POSIX-relative paths.
 *
 * Brace limitations (deliberate): nesting is not supported — a `{` inside a brace
 * group makes the *outer* `{` a literal character and scanning continues, so an
 * inner brace-free group may still compile to an alternation. An unclosed `{` is
 * always a literal `{`; malformed patterns never throw.
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
    } else if (glob[i] === '{') {
      const group = parseBraceGroup(glob, i);
      if (group) {
        out += `(?:${group.alternatives.map(compile).join('|')})`;
        i = group.end + 1;
      } else {
        out += escapeRegExpChar(glob[i]); // unclosed or nested: literal '{'
        i += 1;
      }
    } else {
      out += escapeRegExpChar(glob[i]);
      i += 1;
    }
  }
  return out;
}

/**
 * Parse a single-level `{a,b,c}` group starting at the `{` at `start`. Returns the
 * raw alternatives and the index of the closing `}`, or `undefined` when the group
 * is unclosed or contains a nested `{` (both fall back to a literal `{`).
 */
function parseBraceGroup(
  glob: string,
  start: number,
): { alternatives: string[]; end: number } | undefined {
  const alternatives: string[] = [];
  let current = '';
  for (let i = start + 1; i < glob.length; i += 1) {
    const ch = glob[i];
    if (ch === '{') {
      return undefined;
    }
    if (ch === '}') {
      alternatives.push(current);
      return { alternatives, end: i };
    }
    if (ch === ',') {
      alternatives.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  return undefined;
}

function escapeRegExpChar(ch: string): string {
  return /[.+^${}()|[\]\\]/.test(ch) ? `\\${ch}` : ch;
}
