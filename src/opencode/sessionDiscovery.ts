import * as vscode from 'vscode';
import type { DiscoveryOptions, SessionSummary } from './model';
import { parseSessionExport } from './parseSessionExport';
import { normalizeSession } from './buildTrajectory';
import { basename } from './util';

export const DEFAULT_OPEN_CODE_DISCOVERY: DiscoveryOptions = { maxFileSizeBytes: 25 * 1024 * 1024, maxDiscoveredSessions: 1000, scanRecursively: true, maxPreviewCharacters: 20000 };

export async function discoverOpenCodeSessions(folder: vscode.Uri, options: DiscoveryOptions, output: vscode.OutputChannel, token?: vscode.CancellationToken): Promise<SessionSummary[]> {
  const summaries: SessionSummary[] = [];
  async function walk(uri: vscode.Uri): Promise<void> {
    if (token?.isCancellationRequested || summaries.length >= options.maxDiscoveredSessions) return;
    let entries: [string, vscode.FileType][];
    try { entries = await vscode.workspace.fs.readDirectory(uri); } catch (e) { output.appendLine(`OpenCode discovery: cannot read ${uri.toString()}: ${String(e)}`); return; }
    for (const [name, type] of entries) {
      if (token?.isCancellationRequested || summaries.length >= options.maxDiscoveredSessions) return;
      const child = vscode.Uri.joinPath(uri, name);
      if (type === vscode.FileType.Directory && options.scanRecursively) await walk(child);
      else if (type === vscode.FileType.File && name.toLowerCase().endsWith('.json')) {
        const summary = await summarizeCandidate(child, options, output);
        if (summary) summaries.push(summary);
      }
    }
  }
  await walk(folder);
  return buildSessionTree(summaries);
}

export async function summarizeCandidate(uri: vscode.Uri, options: DiscoveryOptions, output?: vscode.OutputChannel): Promise<SessionSummary | undefined> {
  try {
    const stat = await vscode.workspace.fs.stat(uri);
    if (stat.size > options.maxFileSizeBytes) { output?.appendLine(`OpenCode discovery: skipped large file ${uri.toString()}`); return undefined; }
    const parsed = parseSessionExport(JSON.parse(Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8')) as unknown);
    if (parsed.fatal || !parsed.session) return undefined;
    const normalized = normalizeSession(parsed.session, [...parsed.diagnostics]);
    return { uri, uriString: uri.toString(), fileName: basename(uri.path), size: stat.size, mtime: stat.mtime, id: normalized.id, parentId: normalized.parentId, title: normalized.title || basename(uri.path), updated: normalized.updated, model: normalized.model, toolCalls: normalized.metrics.toolCallCount, skillCalls: normalized.metrics.skillCallCount, errors: normalized.metrics.toolErrorCount, children: [] };
  } catch (e) { output?.appendLine(`OpenCode discovery: skipped invalid JSON ${uri.toString()}: ${String(e)}`); return undefined; }
}

export function buildSessionTree(items: SessionSummary[]): SessionSummary[] {
  const clones = items.map((i) => ({ ...i, children: [] as SessionSummary[] }));
  const byId = new Map<string, SessionSummary>();
  for (const item of clones) if (item.id && !byId.has(item.id)) byId.set(item.id, item);
  const roots: SessionSummary[] = [];
  for (const item of clones) {
    const parent = item.parentId ? byId.get(item.parentId) : undefined;
    if (parent && parent !== item && !wouldCycle(parent, item)) parent.children.push(item); else roots.push(item);
  }
  const sort = (arr: SessionSummary[]): void => { arr.sort((a,b) => (b.updated ?? b.mtime) - (a.updated ?? a.mtime) || a.fileName.localeCompare(b.fileName)); arr.forEach((x) => sort(x.children)); };
  sort(roots); return roots;
}
function wouldCycle(parent: SessionSummary, child: SessionSummary): boolean { let cur: SessionSummary | undefined = parent; const seen = new Set<string>(); while (cur) { const key = cur.uriString; if (key === child.uriString || seen.has(key)) return true; seen.add(key); cur = cur.parentId ? parent.children.find((c) => c.id === cur?.parentId) : undefined; } return false; }
