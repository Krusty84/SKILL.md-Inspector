import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import type {
  SkillBodyTokenUsage,
  SkillTokenUsage,
  TokenCountEntry,
} from '../types/SkillTokenUsage';
import { countO200kTokens } from './o200kTokenizer';
import { countTextLines } from './textMetrics';
import { hasBinaryExtension, isHiddenPath, normalizePosix, readUtf8Text } from './textFile';

type TokenCounter = (text: string) => number;

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
 * How a caller supplies resource-file token counts. Returning undefined skips
 * the file (binary or unreadable), matching the default read-and-count path.
 */
export type ResourceTokenSource = (resource: SkillResource) => number | undefined;

/**
 * Measures each eligible resource at most once. The counter parameter is an
 * internal test seam for small synthetic threshold fixtures, not user
 * configuration. `fileTokens` lets long-lived callers serve per-file counts
 * from a cache (see FileTokenCache) instead of re-reading and re-encoding
 * every file on each analysis.
 */
export function measureSkillTokenUsage(
  doc: SkillDocument,
  countTokens: TokenCounter = countO200kTokens,
  fileTokens?: ResourceTokenSource,
  options: CountResourceTokensOptions = {},
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
    const tokens = fileTokens
      ? fileTokens(resource)
      : countResourceTokens(resource.absolutePath, countTokens, options);
    if (tokens === undefined) {
      continue;
    }
    const entry = {
      relativePath: normalizePosix(resource.relativePath),
      tokens,
    };
    (group === 'references' ? references : otherFiles).push(entry);
  }

  return {
    ...bodyUsage,
    references: { files: references, totalTokens: sumTokens(references) },
    otherFiles: { files: otherFiles, totalTokens: sumTokens(otherFiles) },
  };
}

/**
 * Largest resource file that is read and encoded, in bytes.
 *
 * Token counting was the only file-reading path with no cap: `readUtf8Text`
 * takes a `maxBytes` option and the security scanner passes one
 * (`maxScannedFileSizeBytes`, 256 KB by default), but this call did not — so a
 * 300 MB text resource was read whole and BPE-encoded. Overridable through
 * `skillMdInspector.tokens.maxCountedFileSizeKb`; `undefined` already means
 * "skipped" to every caller, which is what an over-cap file becomes.
 */
export const DEFAULT_MAX_COUNTED_FILE_SIZE_BYTES = 1024 * 1024;

export interface CountResourceTokensOptions {
  /** Skip files above this many bytes. Defaults to {@link DEFAULT_MAX_COUNTED_FILE_SIZE_BYTES}. */
  maxBytes?: number;
}

/**
 * Reads a resource as UTF-8 and counts its tokens; undefined for binary,
 * unreadable, or over-cap files. The one place the default measurement and
 * cache-backed callers share, so both skip exactly the same files.
 */
export function countResourceTokens(
  absolutePath: string,
  countTokens: TokenCounter = countO200kTokens,
  options: CountResourceTokensOptions = {},
): number | undefined {
  const text = readUtf8Text(absolutePath, {
    maxBytes: options.maxBytes ?? DEFAULT_MAX_COUNTED_FILE_SIZE_BYTES,
  });
  return text === undefined ? undefined : countTokens(text);
}

/** Combined token footprint: SKILL.md body plus every counted reference and other file. */
export function totalSkillTokens(usage: SkillTokenUsage): number {
  return usage.body.tokens + usage.references.totalTokens + usage.otherFiles.totalTokens;
}

function tokenGroupFor(relativePath: string): 'references' | 'otherFiles' | undefined {
  const normalized = normalizePosix(relativePath);
  if (normalized.startsWith('references/')) return 'references';
  if (normalized.startsWith('scripts/') || normalized.startsWith('assets/')) return undefined;
  return normalized === 'SKILL.md' ? undefined : 'otherFiles';
}

function compareResourcePaths(a: SkillResource, b: SkillResource): number {
  const left = normalizePosix(a.relativePath);
  const right = normalizePosix(b.relativePath);
  return left < right ? -1 : left > right ? 1 : 0;
}

function sumTokens(entries: readonly TokenCountEntry[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}
