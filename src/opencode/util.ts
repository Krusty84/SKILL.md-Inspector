export function isRecord(value: unknown): value is Record<string, unknown> { return typeof value === 'object' && value !== null && !Array.isArray(value); }
export function asString(value: unknown): string | undefined { return typeof value === 'string' ? value : undefined; }
export function asNumber(value: unknown): number | undefined { return typeof value === 'number' && Number.isFinite(value) ? value : undefined; }
export function getRecord(value: Record<string, unknown>, key: string): Record<string, unknown> | undefined { const v = value[key]; return isRecord(v) ? v : undefined; }
export function getPath(root: unknown, keys: string[]): unknown { let cur = root; for (const key of keys) { if (!isRecord(cur)) return undefined; cur = cur[key]; } return cur; }
export function safeDuration(start?: number, end?: number): number | undefined { if (start === undefined || end === undefined || !Number.isFinite(start) || !Number.isFinite(end)) return undefined; const d = end - start; return d >= 0 ? d : undefined; }
export function preview(value: unknown, max = 20000): string | undefined { if (value === undefined) return undefined; const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2); if (text === undefined) return undefined; return text.length > max ? `${text.slice(0, max)}\n… truncated ${text.length - max} characters` : text; }
export function escapeHtml(value: unknown): string { return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
export function normalizeName(value: string): string { return value.trim().toLowerCase(); }
export function basename(path: string): string { const parts = path.split(/[\\/]/); return parts[parts.length - 1] || path; }
