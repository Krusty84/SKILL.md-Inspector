import * as path from 'node:path';
import type { FavoriteEntry } from './types';

export const FAVORITES_KEY = 'skillMdInspector.favorites.v1';

export function isSkillUri(uri: string): boolean {
  try {
    return path.basename(new URL(uri).pathname) === 'SKILL.md';
  } catch {
    return false;
  }
}
export function normalizeFavoriteUri(uri: string): string | undefined {
  if (!isSkillUri(uri)) return undefined;
  try {
    const parsed = new URL(uri);
    return `${parsed.protocol}//${parsed.pathname}`;
  } catch {
    return undefined;
  }
}
export function addFavorite(
  entries: FavoriteEntry[],
  uri: string,
): { entries: FavoriteEntry[]; added: boolean } {
  const canonical = normalizeFavoriteUri(uri);
  if (!canonical) return { entries, added: false };
  if (entries.some((entry) => normalizeFavoriteUri(entry.uri) === canonical))
    return { entries, added: false };
  return { entries: [...entries, { uri }], added: true };
}
export function removeFavorite(entries: FavoriteEntry[], uri: string): FavoriteEntry[] {
  const canonical = normalizeFavoriteUri(uri) ?? uri;
  return entries.filter((entry) => (normalizeFavoriteUri(entry.uri) ?? entry.uri) !== canonical);
}
export function updateFavoriteUri(
  entries: FavoriteEntry[],
  oldUri: string,
  newUri: string,
): FavoriteEntry[] {
  const canonical = normalizeFavoriteUri(oldUri) ?? oldUri;
  return entries.map((entry) =>
    (normalizeFavoriteUri(entry.uri) ?? entry.uri) === canonical ? { uri: newUri } : entry,
  );
}
export function restoreFavorites(value: unknown): FavoriteEntry[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (entry): entry is FavoriteEntry =>
      !!entry && typeof entry === 'object' && typeof (entry as FavoriteEntry).uri === 'string',
  );
}
