import nls from '../../package.nls.json';

// VS Code substitutes a manifest value only when the WHOLE string is `%key%`.
const NLS_PLACEHOLDER = /^%([^%]+)%$/;

// Returns a deep clone of a manifest value with every `%key%` string replaced
// by its English text from package.nls.json, so tests keep asserting the
// user-visible strings. Throws on a key with no entry, which doubles as
// coverage enforcement for placeholders reached by tests.
export function resolveNls<T>(value: T): T {
  if (typeof value === 'string') {
    const match = NLS_PLACEHOLDER.exec(value);
    if (!match) return value;
    const resolved = (nls as Record<string, string>)[match[1]];
    if (resolved === undefined) {
      throw new Error(`package.nls.json is missing key: ${match[1]}`);
    }
    return resolved as unknown as T;
  }
  if (Array.isArray(value)) {
    return value.map((item) => resolveNls(item)) as unknown as T;
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, resolveNls(entry)]),
    ) as T;
  }
  return value;
}
