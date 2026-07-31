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
  return globs.some((glob) => {
    const re = globToRegExp(glob);
    return re !== undefined && re.test(relPosix);
  });
}

/**
 * Largest number of unbounded groups a compiled pattern may contain.
 *
 * `**` and each brace alternative emit a `.*`-class group, and adjacent ones
 * multiply into exponential backtracking against a non-matching path. The
 * compiled regex is then tested against every discovered file, so a pattern the
 * user typed into `skillMdInspector.resources.exclude` froze the extension host
 * with nothing to explain why. Measured before this guard:
 *
 *   "**\/**\/**\/**\/**\/**\/**\/x"                vs a 121-char path  14,774 ms
 *   "{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}{*,*}X"    vs a  24-char name  26,743 ms
 *
 * Eight is generous next to the shipped exclusion patterns, which use two.
 */
const MAX_UNBOUNDED_GROUPS = 8;

/** One rejected glob, for the caller to surface through the output channel. */
export interface GlobConfigurationWarning {
  glob: string;
  message: string;
}

const cache = new Map<string, RegExp | undefined>();

/** Counts the unbounded constructs a compiled source can backtrack across. */
function unboundedGroupCount(source: string): number {
  return (source.match(/\.\*|\[\^\/\]\*|\(\?:/g) ?? []).length;
}

/**
 * Compiles a glob, or returns undefined when it exceeds the complexity budget.
 * Result (including the rejection) is memoized, so an over-budget pattern costs
 * one compile rather than one per candidate path.
 */
function globToRegExp(glob: string): RegExp | undefined {
  if (cache.has(glob)) {
    return cache.get(glob);
  }
  const source = compile(glob);
  const re =
    unboundedGroupCount(source) > MAX_UNBOUNDED_GROUPS
      ? undefined
      : new RegExp(`^${source}$`);
  cache.set(glob, re);
  return re;
}

/**
 * The globs that were rejected as too complex to compile, with the reason.
 * Callers report these as configuration warnings; matching silently ignores
 * them, which is the same outcome as an unmatched pattern but bounded.
 */
export function globConfigurationWarnings(
  globs: readonly string[],
): GlobConfigurationWarning[] {
  const warnings: GlobConfigurationWarning[] = [];
  for (const glob of globs) {
    if (globToRegExp(glob) === undefined) {
      warnings.push({
        glob,
        message:
          `Ignoring the pattern "${glob}": it compiles to more than ${MAX_UNBOUNDED_GROUPS} ` +
          `unbounded groups, which can take minutes to match one path. Use fewer \`**\` ` +
          `segments or brace alternatives.`,
      });
    }
  }
  return warnings;
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
