import * as l10n from '@vscode/l10n';
import type { SkillDiagnostic, SkillDiagnosticRange } from '../../types/SkillDiagnostic';
import type { SkillDocument, SkillResource } from '../../types/SkillDocument';
import {
  hasBinaryExtension,
  isHiddenPath,
  normalizePosix,
  readUtf8Text,
} from '../../analysis/textFile';
import type { SecuritySettings } from './settings';
import type { CompiledSecurityPatterns } from './patterns';
import {
  scanCommands,
  scanHtmlCommentInstructions,
  scanInjection,
  scanInvisible,
  scanSecrets,
  scanSensitivePaths,
  scanServices,
  type RawMatch,
} from './scanText';
import { toSecurityDiagnostic } from './diagnostic';

/** Executable-code files receive command checks in addition to the shared low-noise scans. */
const CODE_EXTENSIONS = new Set([
  '.sh',
  '.bash',
  '.zsh',
  '.fish',
  '.ksh',
  '.py',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.rb',
  '.pl',
  '.pm',
  '.ps1',
  '.psm1',
  '.bat',
  '.cmd',
  '.php',
  '.go',
  '.rs',
  '.lua',
  '.r',
]);

/** Other text files skip command patterns, which would be noisy in prose. */
const TEXT_EXTENSIONS = new Set([
  '.txt',
  '.md',
  '.markdown',
  '.cfg',
  '.conf',
  '.ini',
  '.yaml',
  '.yml',
  '.toml',
  '.json',
  '.xml',
  '.properties',
]);

/**
 * Scans bundled resource files for security risks. Executable files receive
 * command, secret, service, sensitive-path, and invisible-Unicode checks. Text
 * files receive the same low-noise checks plus prompt-injection and hidden HTML
 * comment checks, but no generic command scan. Full mode only (reads the filesystem).
 *
 * Findings attach to the SKILL.md document — at the referencing link's range
 * when the resource is linked, otherwise at the top of the body — with the
 * `relativePath:line` carried in the message and a `data` payload for future
 * go-to-source navigation.
 */
export function scanResources(
  doc: SkillDocument,
  patterns: CompiledSecurityPatterns,
  settings: SecuritySettings,
): SkillDiagnostic[] {
  const out: SkillDiagnostic[] = [];
  for (const resource of doc.resources) {
    const plan = scanPlanFor(resource);
    if (!plan) {
      continue;
    }
    if (resource.sizeBytes > settings.maxScannedFileSizeBytes) {
      continue;
    }
    const content = readUtf8Text(resource.absolutePath, {
      maxBytes: settings.maxScannedFileSizeBytes,
    });
    if (content === undefined) {
      continue;
    }
    const matches: RawMatch[] = [
      ...(plan.commands ? scanCommands(content, patterns, settings.allowedCommands) : []),
      ...(!plan.commands ? scanInjection(content, patterns) : []),
      ...scanSecrets(content, patterns),
      ...scanServices(content, patterns, settings.allowedDomains),
      ...scanSensitivePaths(content, patterns),
      ...(!plan.commands ? scanHtmlCommentInstructions(content, patterns) : []),
      ...scanInvisible(content, patterns),
    ];
    if (matches.length === 0) {
      continue;
    }
    const range = referencingRange(doc, resource) ?? bodyTopRange(doc);
    for (const match of matches) {
      const line = lineNumberAt(content, match.index);
      out.push(
        toSecurityDiagnostic(
          {
            code: match.code,
            severity: match.severity,
            // match.message is already localized by the scanText builders.
            message: l10n.t(
              'Bundled file `{0}` (line {1}): {2}',
              resource.relativePath,
              line,
              match.message,
            ),
          },
          range,
          {
            relativePath: resource.relativePath,
            absolutePath: resource.absolutePath,
            line,
            securityCode: match.code,
          },
        ),
      );
    }
  }
  return out;
}

interface ScanPlan {
  commands: boolean;
}

/** Decides whether and how to scan a resource, or undefined to skip it. */
function scanPlanFor(resource: SkillResource): ScanPlan | undefined {
  if (isHiddenPath(resource.relativePath) || hasBinaryExtension(resource.relativePath)) {
    return undefined;
  }
  const ext = extensionOf(resource.relativePath);
  const isCode = resource.category === 'scripts' || CODE_EXTENSIONS.has(ext);
  if (isCode) {
    return { commands: true };
  }
  if (TEXT_EXTENSIONS.has(ext)) {
    return { commands: false };
  }
  return undefined;
}

function extensionOf(relativePath: string): string {
  const base = normalizePosix(relativePath).split('/').pop() ?? '';
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
}

/** 1-based line number of a character offset. */
function lineNumberAt(content: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index && i < content.length; i++) {
    if (content.charCodeAt(i) === 10 /* \n */) {
      line += 1;
    }
  }
  return line;
}

/** Range of the Markdown link that references this resource, if any. */
function referencingRange(
  doc: SkillDocument,
  resource: SkillResource,
): SkillDiagnosticRange | undefined {
  if (!resource.referenced) {
    return undefined;
  }
  const target = normalizePosix(resource.relativePath);
  for (const link of doc.links) {
    if (!link.range) {
      continue;
    }
    const raw = normalizePosix(link.raw).replace(/^\.\//, '');
    if (raw === target) {
      return link.range;
    }
  }
  return undefined;
}

/** A single-line range at the start of the Markdown body (mirrors validation/util.bodyTopRange). */
function bodyTopRange(doc: SkillDocument): SkillDiagnosticRange {
  const line = Math.max(0, doc.bodyStartLine);
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: 0 };
}
