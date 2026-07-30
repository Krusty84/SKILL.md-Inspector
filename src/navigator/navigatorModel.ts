import * as path from 'node:path';
import * as l10n from '@vscode/l10n';
import type { DiscoveredFile, FavoriteEntry } from './types';

export type NavigatorNode =
  | { type: 'section'; id: string; label: string }
  | { type: 'message'; id: string; label: string }
  | { type: 'agent'; id: string; label: string }
  | { type: 'group'; id: string; label: string }
  | { type: 'workspace'; id: string; label: string; rootPath: string }
  | { type: 'file'; id: string; file: DiscoveredFile; favorite: boolean }
  | { type: 'favorite'; id: string; uri: string; exists: boolean; fsPath?: string };

export function rootSections(): NavigatorNode[] {
  return [
    { type: 'section', id: 'section:favorites', label: l10n.t('Favorites') },
    { type: 'section', id: 'section:workspace', label: l10n.t('Workspace') },
    { type: 'section', id: 'section:installed', label: l10n.t('Installed Agents') },
  ];
}

export function favoriteNodes(entries: FavoriteEntry[], existing: Set<string>): NavigatorNode[] {
  if (entries.length === 0)
    return [
      { type: 'message', id: 'favorites:empty', label: l10n.t('No favorite SKILL.md files yet.') },
    ];
  return entries.map((entry) => {
    const fsPath = uriToFsPath(entry.uri);
    const exists = fsPath ? existing.has(fsPath) : false;
    return { type: 'favorite', id: `favorite:${entry.uri}`, uri: entry.uri, exists, fsPath };
  });
}

export function groupInstalledFiles(files: DiscoveredFile[]): NavigatorNode[] {
  if (files.length === 0)
    return [
      {
        type: 'message',
        id: 'installed:empty',
        label: l10n.t('No supported local agent files found.'),
      },
    ];
  const byAgent = new Map<string, DiscoveredFile[]>();
  for (const file of files) {
    const agent = file.sourceId.split(':')[0];
    byAgent.set(agent, [...(byAgent.get(agent) ?? []), file]);
  }
  return [...byAgent.entries()].map(([agent, agentFiles]) => ({
    type: 'agent',
    id: `agent:${agent}`,
    label: agentFiles[0]?.sourceLabel.split('/')[0] ?? agent,
  }));
}

export function compareFiles(a: DiscoveredFile, b: DiscoveredFile): number {
  const ad = path.dirname(a.relativePath);
  const bd = path.dirname(b.relativePath);
  if (ad.toLowerCase() === bd.toLowerCase() && a.fileName !== b.fileName)
    return a.fileName === 'AGENTS.md' ? -1 : 1;
  return a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' });
}

export function uriToFsPath(uri: string): string | undefined {
  try {
    const parsed = new URL(uri);
    return parsed.protocol === 'file:' ? decodeURIComponent(parsed.pathname) : undefined;
  } catch {
    return undefined;
  }
}
