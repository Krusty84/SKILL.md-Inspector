import * as l10n from '@vscode/l10n';
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
export function asString(value: unknown): string | undefined {
  return typeof value === 'string' ? value : undefined;
}
export function asNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
export function getRecord(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const v = value[key];
  return isRecord(v) ? v : undefined;
}
export function getPath(root: unknown, keys: string[]): unknown {
  let cur = root;
  for (const key of keys) {
    if (!isRecord(cur)) return undefined;
    cur = cur[key];
  }
  return cur;
}
export function safeDuration(start?: number, end?: number): number | undefined {
  if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end))
    return undefined;
  const d = end - start;
  return d >= 0 ? d : undefined;
}
export function preview(value: unknown, max = 20000): string | undefined {
  if (value === undefined) return undefined;
  // `JSON.stringify` recurses, so a deeply nested part value throws
  // `RangeError: Maximum call stack size exceeded` — measured at 20,000 levels,
  // well under the loader's 25 MB file cap. A preview is display text; failing
  // to build one must not abort the whole session load.
  let text: string | undefined;
  if (typeof value === 'string') {
    text = value;
  } else {
    try {
      text = JSON.stringify(value, null, 2);
    } catch {
      text = l10n.t('<value too deeply nested to display>');
    }
  }
  if (text === undefined) return undefined;
  return text.length > max
    ? `${text.slice(0, max)}\n… truncated ${text.length - max} characters`
    : text;
}
export function normalizeName(value: string): string {
  return value.trim().toLowerCase();
}
export function basename(path: string): string {
  const parts = path.split(/[\\/]/);
  return parts[parts.length - 1] || path;
}
