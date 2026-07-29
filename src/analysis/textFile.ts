import * as fs from 'node:fs';
import * as path from 'node:path';

/**
 * File extensions treated as binary and never decoded as text. Shared by token
 * measurement and security resource scanning so both skip the same non-text
 * files.
 */
export const BINARY_EXTENSIONS = new Set([
  // Images, audio, and video.
  '.apng',
  '.avif',
  '.bmp',
  '.gif',
  '.heic',
  '.heif',
  '.ico',
  '.jpeg',
  '.jpg',
  '.png',
  '.psd',
  '.svg',
  '.tif',
  '.tiff',
  '.webp',
  '.aac',
  '.aiff',
  '.flac',
  '.m4a',
  '.mp3',
  '.ogg',
  '.opus',
  '.wav',
  '.avi',
  '.m4v',
  '.mkv',
  '.mov',
  '.mp4',
  '.mpeg',
  '.mpg',
  '.webm',
  // Archives, compiled output, and generic binary containers.
  '.7z',
  '.a',
  '.bin',
  '.bz2',
  '.cab',
  '.class',
  '.db',
  '.deb',
  '.dmg',
  '.dll',
  '.dylib',
  '.exe',
  '.gz',
  '.iso',
  '.jar',
  '.o',
  '.pyc',
  '.pyo',
  '.rar',
  '.rpm',
  '.so',
  '.sqlite',
  '.sqlite3',
  '.swf',
  '.tar',
  '.tgz',
  '.wasm',
  '.xz',
  '.zip',
  // PDF and office documents.
  '.doc',
  '.docm',
  '.docx',
  '.dot',
  '.dotm',
  '.dotx',
  '.numbers',
  '.odp',
  '.ods',
  '.odt',
  '.pages',
  '.pdf',
  '.pot',
  '.potm',
  '.potx',
  '.pps',
  '.ppsm',
  '.ppsx',
  '.ppt',
  '.pptm',
  '.pptx',
  '.rtf',
  '.xls',
  '.xlsb',
  '.xlsm',
  '.xlsx',
  // Fonts.
  '.eot',
  '.otf',
  '.ttc',
  '.ttf',
  '.woff',
  '.woff2',
]);

/** Normalizes OS path separators to POSIX so classification is platform-stable. */
export function normalizePosix(value: string): string {
  return value.split(path.sep).join('/');
}

export interface ReadTextOptions {
  /** Skip (return undefined) files whose byte length exceeds this cap. */
  maxBytes?: number;
}

/**
 * Reads a file as UTF-8 text, returning undefined for unreadable, over-cap, or
 * binary content (NUL byte or a high control-character ratio) and for invalid
 * UTF-8. Callers get either decodable text or nothing.
 */
export function readUtf8Text(absolutePath: string, options: ReadTextOptions = {}): string | undefined {
  let content: Buffer;
  try {
    content = fs.readFileSync(absolutePath);
  } catch {
    return undefined;
  }
  if (options.maxBytes !== undefined && content.length > options.maxBytes) {
    return undefined;
  }
  if (looksBinary(content)) {
    return undefined;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(content);
  } catch {
    return undefined;
  }
}

/** Heuristic binary sniff: a NUL byte, or over 1% control characters. */
export function looksBinary(content: Buffer): boolean {
  if (content.length === 0) return false;
  let controls = 0;
  for (let index = 0; index < content.length; index++) {
    const byte = content[index];
    if (byte === 0) return true;
    if ((byte < 9 || (byte > 13 && byte < 32)) && byte !== 27) controls += 1;
  }
  return controls / content.length > 0.01;
}

/** True when the file's extension is in {@link BINARY_EXTENSIONS}. */
export function hasBinaryExtension(relativePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.posix.extname(normalizePosix(relativePath)).toLowerCase());
}

/** True when any path segment starts with a dot (a hidden file or directory). */
export function isHiddenPath(relativePath: string): boolean {
  return normalizePosix(relativePath)
    .split('/')
    .some((segment) => segment.startsWith('.'));
}
