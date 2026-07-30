import { promises as fs } from 'node:fs';
import * as path from 'node:path';
import * as l10n from '@vscode/l10n';
import type { AgentFileName, AgentSource, DiscoveryResult, DiscoveredFile } from './types';

export interface DiscoveryOptions {
  maxResults: number;
  maxDepth: number;
}

export async function discoverExternalFiles(
  source: AgentSource,
  options: DiscoveryOptions = { maxResults: 1000, maxDepth: 12 },
): Promise<DiscoveryResult> {
  const files: DiscoveredFile[] = [];
  const messages: string[] = [];
  const seen = new Set<string>();
  const seenFiles = new Set<string>();
  const root = path.resolve(source.rootPath);
  let truncated = false;

  async function addFile(filePath: string): Promise<void> {
    if (files.length >= options.maxResults) {
      truncated = true;
      return;
    }
    const base = path.basename(filePath) as AgentFileName;
    if (!source.files.includes(base)) return;
    let absolutePath: string;
    try {
      absolutePath = await fs.realpath(filePath);
    } catch {
      messages.push(l10n.t('Cannot read {0}.', filePath));
      return;
    }
    const canonicalPath = process.platform === 'win32' ? absolutePath.toLowerCase() : absolutePath;
    if (seenFiles.has(canonicalPath)) return;
    seenFiles.add(canonicalPath);
    files.push({
      sourceId: source.id,
      sourceLabel: source.groupLabel,
      fileName: base,
      absolutePath,
      relativePath: path.relative(root, filePath) || base,
    });
  }

  async function walk(dir: string, depth: number): Promise<void> {
    if (files.length >= options.maxResults) {
      truncated = true;
      return;
    }
    let real: string;
    try {
      real = await fs.realpath(dir);
    } catch {
      messages.push(l10n.t('Cannot read {0}.', dir));
      return;
    }
    if (seen.has(real)) return;
    seen.add(real);
    let entries: import('node:fs').Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      messages.push(l10n.t('Cannot read {0}.', dir));
      return;
    }
    entries.sort(compareDirents);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isFile()) {
        await addFile(fullPath);
      } else if (
        (entry.isDirectory() || entry.isSymbolicLink()) &&
        source.recursive &&
        depth < options.maxDepth
      ) {
        try {
          const stat = await fs.stat(fullPath);
          if (stat.isDirectory()) await walk(fullPath, depth + 1);
          else if (stat.isFile()) await addFile(fullPath);
        } catch {
          messages.push(l10n.t('Cannot read {0}.', fullPath));
        }
      }
      if (files.length >= options.maxResults) {
        truncated = true;
        break;
      }
    }
  }

  try {
    const stat = await fs.stat(root);
    if (stat.isFile()) await addFile(root);
    else if (stat.isDirectory()) await walk(root, 0);
  } catch {
    return { files: [], messages: [] };
  }
  if (truncated) messages.push(l10n.t('Results truncated. Narrow the configured search root.'));
  files.sort(compareDiscoveredFiles);
  return { files, messages };
}

function compareDirents(a: import('node:fs').Dirent, b: import('node:fs').Dirent): number {
  const aDir = a.isDirectory() || a.isSymbolicLink();
  const bDir = b.isDirectory() || b.isSymbolicLink();
  if (aDir !== bDir) return aDir ? -1 : 1;
  const fileOrder = instructionFileOrder(a.name) - instructionFileOrder(b.name);
  if (fileOrder !== 0) return fileOrder;
  return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
}

function compareDiscoveredFiles(a: DiscoveredFile, b: DiscoveredFile): number {
  const fileOrder = instructionFileOrder(a.fileName) - instructionFileOrder(b.fileName);
  return (
    fileOrder ||
    a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base', numeric: true })
  );
}

function instructionFileOrder(fileName: string): number {
  if (fileName === 'AGENTS.md') return 0;
  if (fileName === 'CLAUDE.md') return 1;
  if (fileName === 'SKILL.md') return 2;
  return 3;
}
