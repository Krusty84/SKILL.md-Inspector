import type { SanitizationStatus } from './model';
import { isRecord } from './util';

export function detectSanitizedExport(value: unknown): SanitizationStatus {
  let found = false;
  let visited = 0;
  const visit = (node: unknown): void => {
    if (found || visited++ > 10000) return;
    if (typeof node === 'string') { if (node.includes('[redacted:')) found = true; return; }
    if (Array.isArray(node)) { for (const item of node) visit(item); return; }
    if (isRecord(node)) { if (typeof node.redacted === 'string') { found = true; return; } for (const item of Object.values(node)) visit(item); }
  };
  try { visit(value); return found ? 'likely-sanitized' : 'not-detected'; } catch { return 'unknown'; }
}
