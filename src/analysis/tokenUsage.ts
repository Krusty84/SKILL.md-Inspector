import * as fs from 'node:fs';
import * as path from 'node:path';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import type {
  SkillBodyTokenUsage,
  SkillTokenUsage,
  TokenCountEntry,
} from '../types/SkillTokenUsage';
import { countO200kTokens } from './o200kTokenizer';
import { countTextLines } from './textMetrics';

type TokenCounter = (text: string) => number;

const BINARY_EXTENSIONS = new Set([
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

export function measureBodyTokenUsage(
  body: string,
  countTokens: TokenCounter = countO200kTokens,
): SkillBodyTokenUsage {
  return {
    encoding: 'o200k_base',
    body: { tokens: countTokens(body), lines: countTextLines(body) },
  };
}

/**
 * Measures each eligible resource at most once. The counter parameter is an
 * internal test seam for small synthetic threshold fixtures, not user configuration.
 */
export function measureSkillTokenUsage(
  doc: SkillDocument,
  countTokens: TokenCounter = countO200kTokens,
): SkillTokenUsage {
  const bodyUsage = measureBodyTokenUsage(doc.body, countTokens);
  const references: TokenCountEntry[] = [];
  const otherFiles: TokenCountEntry[] = [];

  for (const resource of [...doc.resources].sort(compareResourcePaths)) {
    const group = tokenGroupFor(resource.relativePath);
    if (
      !group ||
      isHiddenPath(resource.relativePath) ||
      hasBinaryExtension(resource.relativePath)
    ) {
      continue;
    }
    const text = readUtf8Text(resource);
    if (text === undefined) {
      continue;
    }
    const entry = {
      relativePath: normalizePosix(resource.relativePath),
      tokens: countTokens(text),
    };
    (group === 'references' ? references : otherFiles).push(entry);
  }

  return {
    ...bodyUsage,
    references: { files: references, totalTokens: sumTokens(references) },
    otherFiles: { files: otherFiles, totalTokens: sumTokens(otherFiles) },
  };
}

function tokenGroupFor(relativePath: string): 'references' | 'otherFiles' | undefined {
  const normalized = normalizePosix(relativePath);
  if (normalized.startsWith('references/')) return 'references';
  if (normalized.startsWith('scripts/') || normalized.startsWith('assets/')) return undefined;
  return normalized === 'SKILL.md' ? undefined : 'otherFiles';
}

function readUtf8Text(resource: SkillResource): string | undefined {
  let content: Buffer;
  try {
    content = fs.readFileSync(resource.absolutePath);
  } catch {
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

function looksBinary(content: Buffer): boolean {
  if (content.length === 0) return false;
  let controls = 0;
  for (let index = 0; index < content.length; index++) {
    const byte = content[index];
    if (byte === 0) return true;
    if ((byte < 9 || (byte > 13 && byte < 32)) && byte !== 27) controls += 1;
  }
  return controls / content.length > 0.01;
}

function hasBinaryExtension(relativePath: string): boolean {
  return BINARY_EXTENSIONS.has(path.posix.extname(normalizePosix(relativePath)).toLowerCase());
}

function isHiddenPath(relativePath: string): boolean {
  return normalizePosix(relativePath)
    .split('/')
    .some((segment) => segment.startsWith('.'));
}

function compareResourcePaths(a: SkillResource, b: SkillResource): number {
  const left = normalizePosix(a.relativePath);
  const right = normalizePosix(b.relativePath);
  return left < right ? -1 : left > right ? 1 : 0;
}

function normalizePosix(value: string): string {
  return value.split(path.sep).join('/');
}

function sumTokens(entries: readonly TokenCountEntry[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}
