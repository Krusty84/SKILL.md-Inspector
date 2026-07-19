import * as vscode from 'vscode';

export interface WorkspaceExcludeMatcher {
  excludes(uri: vscode.Uri, name: string): boolean;
}

export function createWorkspaceExcludeMatcher(
  folder: vscode.WorkspaceFolder,
): WorkspaceExcludeMatcher {
  const config = vscode.workspace.getConfiguration('files', folder.uri);
  const excludes = config.get<Record<string, boolean | { when?: string }>>('exclude', {});
  const patterns = Object.entries(excludes)
    .filter(([, value]) => value === true)
    .map(([pattern]) => pattern);
  return {
    excludes: (uri, name) =>
      patterns.some((pattern) => matchesFilesExclude(folder.uri, uri, name, pattern)),
  };
}

export function matchesFilesExclude(
  root: vscode.Uri,
  uri: vscode.Uri,
  name: string,
  pattern: string,
): boolean {
  const relative = relativeUriPath(root, uri);
  const normalized = trimSlashes(pattern.replace(/\\/g, '/'));
  if (!normalized) return false;
  if (!normalized.includes('/')) return globSegment(normalized, name);
  if (normalized.startsWith('**/'))
    return globPath(normalized.slice(3), relative) || globPath(normalized, relative);
  return globPath(normalized, relative);
}

function relativeUriPath(root: vscode.Uri, uri: vscode.Uri): string {
  const rootPath = trimSlashes(root.path);
  const uriPath = trimSlashes(uri.path);
  if (uriPath === rootPath) return '';
  return uriPath.startsWith(`${rootPath}/`) ? uriPath.slice(rootPath.length + 1) : uriPath;
}

function globPath(pattern: string, value: string): boolean {
  const patternParts = trimSlashes(pattern).split('/').filter(Boolean);
  const valueParts = trimSlashes(value).split('/').filter(Boolean);
  return matchParts(patternParts, valueParts);
}

function matchParts(pattern: string[], value: string[]): boolean {
  if (pattern.length === 0) return value.length === 0;
  if (pattern[0] === '**') {
    return (
      matchParts(pattern.slice(1), value) ||
      (value.length > 0 && matchParts(pattern, value.slice(1)))
    );
  }
  return (
    value.length > 0 &&
    globSegment(pattern[0] ?? '', value[0] ?? '') &&
    matchParts(pattern.slice(1), value.slice(1))
  );
}

function globSegment(pattern: string, value: string): boolean {
  const escaped = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  return new RegExp(`^${escaped}$`, 'i').test(value);
}

function trimSlashes(value: string): string {
  return value.replace(/^\/+|\/+$/g, '');
}
