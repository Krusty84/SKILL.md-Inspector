import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import type { AgentFileName, AgentSource, DiscoveryResult, DiscoveredFile } from './types';

export interface DiscoveryOptions { maxResults: number; maxDepth: number }

export async function discoverExternalFiles(source: AgentSource, options: DiscoveryOptions = { maxResults: 1000, maxDepth: 12 }): Promise<DiscoveryResult> {
  const files: DiscoveredFile[] = [];
  const messages: string[] = [];
  const seen = new Set<string>();
  const root = path.resolve(source.rootPath);
  let truncated = false;

  async function addFile(filePath: string): Promise<void> {
    if (files.length >= options.maxResults) { truncated = true; return; }
    const base = path.basename(filePath) as AgentFileName;
    if (!source.files.includes(base)) return;
    files.push({ sourceId: source.id, sourceLabel: source.groupLabel, fileName: base, absolutePath: filePath, relativePath: path.relative(root, filePath) || base });
  }

  async function walk(dir: string, depth: number): Promise<void> {
    if (files.length >= options.maxResults) { truncated = true; return; }
    let real: string;
    try { real = await fs.realpath(dir); } catch { messages.push(`Cannot read ${dir}.`); return; }
    if (seen.has(real)) return;
    seen.add(real);
    let entries: import('node:fs').Dirent[];
    try { entries = await fs.readdir(dir, { withFileTypes: true }); } catch { messages.push(`Cannot read ${dir}.`); return; }
    entries.sort(compareDirents);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        await addFile(fullPath);
      } else if ((entry.isDirectory() || entry.isSymbolicLink()) && source.recursive && depth < options.maxDepth) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) await walk(fullPath, depth + 1);
          else if (stat.isFile()) await addFile(fullPath);
        } catch {
          messages.push(`Cannot read ${fullPath}.`);
        }
      }
      if (files.length >= options.maxResults) { truncated = true; break; }
    }
  }

  try {
    const stat = await fs.stat(root);
    if (stat.isFile()) await addFile(root);
    else if (stat.isDirectory()) await walk(root, 0);
  } catch {
    return { files: [], messages: [] };
  }
  if (truncated) messages.push('Results truncated. Narrow the configured search root.');
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' }));
  return { files, messages };
}

function compareDirents(a: import('node:fs').Dirent, b: import('node:fs').Dirent): number {
  const aDir = a.isDirectory() || a.isSymbolicLink();
  const bDir = b.isDirectory() || b.isSymbolicLink();
  if (aDir !== bDir) return aDir ? -1 : 1;
  if (a.name === 'AGENTS.md' && b.name === 'SKILL.md') return -1;
  if (a.name === 'SKILL.md' && b.name === 'AGENTS.md') return 1;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}
