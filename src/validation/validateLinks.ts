import * as fs from 'node:fs';
import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import {
  resolveRelativeLinkPath,
  cleanLinkTarget,
  canonicalizeLocalPath,
  isPathInsideDir,
} from '../parser/linkPaths';
import { diag } from './util';

const SUSPICIOUS_EXTENSIONS = /\.(exe|sh|bat|ps1|scr|cmd|zip|dll)(\?|#|$)/i;
const SHORTENER_HOSTS = /(^|\/\/)([^/]*\.)?(bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd)\b/i;

export interface LinkValidationOptions {
  /** Skip filesystem-dependent checks (linked-file existence, symlink escape). */
  skipFilesystem?: boolean;
}

/**
 * Validates Markdown links in the body (brief §7.5):
 *  - relative link to a missing file -> error
 *  - absolute local path            -> warning (not portable)
 *  - remote URL                     -> information (warning if suspicious)
 *
 * With `skipFilesystem`, the missing-file and symlink-escape checks (the only
 * filesystem access) are omitted; all lexical checks still run.
 */
export function validateLinks(
  doc: SkillDocument,
  options: LinkValidationOptions = {},
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  const caseMatcher = buildCaseMatcher(doc);

  for (const link of doc.links) {
    if (link.kind === 'remote') {
      if (isSuspiciousRemote(link.raw)) {
        diagnostics.push(
          diag(
            DiagnosticCode.LinkRemoteSuspicious,
            'warning',
            `Suspicious remote link: ${link.raw}. Verify it is safe before an agent follows it.`,
            link.range,
          ),
        );
      } else {
        diagnostics.push(
          diag(
            DiagnosticCode.LinkRemoteSuspicious,
            'information',
            `Remote link: ${link.raw}. Prefer bundling referenced material inside the skill package.`,
            link.range,
          ),
        );
      }
      continue;
    }

    if (link.kind === 'absoluteLocal') {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkAbsolute,
          'warning',
          `Absolute local path is not portable: ${link.raw}. Use a path relative to SKILL.md.`,
          link.range,
        ),
      );
      continue;
    }

    // relative
    const target = resolveRelativeLinkPath(doc.directory, link.raw);
    if (!isPathInsideDir(doc.directory, target)) {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkEscapesSkillRoot,
          'error',
          `Linked path escapes the skill package: ${cleanLinkTarget(link.raw)}`,
          link.range,
        ),
      );
      continue;
    }
    if (options.skipFilesystem) {
      // Defer the on-disk existence and symlink-escape checks to full analysis.
      continue;
    }
    // A link that matches a discovered resource except for letter case works on
    // case-insensitive filesystems (macOS/Windows) and breaks on case-sensitive
    // ones — report the mismatch instead of a missing/ok verdict either way.
    const caseMatch = caseMatcher(canonicalizeLocalPath(doc.directory, link.raw));
    if (caseMatch) {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkCaseMismatch,
          'warning',
          `Link case does not match the file on disk: ${cleanLinkTarget(link.raw)} vs ${caseMatch.relativePath}. Case-sensitive systems cannot resolve it.`,
          link.range,
          { data: { actualRelativePath: caseMatch.relativePath } },
        ),
      );
      continue;
    }
    if (!fileExists(target)) {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkMissing,
          'error',
          `Linked file does not exist: ${cleanLinkTarget(link.raw)}`,
          link.range,
          {
            quickFixId: QuickFixId.CreateMissingLinkedFile,
            data: { absolutePath: target, raw: link.raw },
          },
        ),
      );
      continue;
    }
    if (realTargetEscapes(doc.directory, target)) {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkEscapesSkillRoot,
          'warning',
          `Linked path escapes the skill package: ${cleanLinkTarget(link.raw)}`,
          link.range,
        ),
      );
    }
  }

  return diagnostics;
}

function isSuspiciousRemote(url: string): boolean {
  if (/^http:\/\//i.test(url)) {
    return true; // insecure transport
  }
  if (/\/\/[^/@]+@/.test(url)) {
    return true; // embedded credentials
  }
  if (/\/\/(\d{1,3}\.){3}\d{1,3}(?:[:/]|$)/.test(url)) {
    return true; // raw IP host
  }
  if (SHORTENER_HOSTS.test(url)) {
    return true;
  }
  return SUSPICIOUS_EXTENSIONS.test(url);
}

/**
 * Maps a canonical link key to the single discovered resource it matches
 * case-insensitively but not exactly. Exact matches and folded keys shared by
 * several resources (genuinely ambiguous) yield nothing. Works purely on the
 * discovered-resource set, so the verdict is identical on every platform.
 */
function buildCaseMatcher(doc: SkillDocument): (linkKey: string) => SkillResource | undefined {
  const exact = new Set<string>();
  const folded = new Map<string, SkillResource[]>();
  for (const resource of doc.resources) {
    const key = canonicalizeLocalPath(doc.directory, resource.absolutePath);
    exact.add(key);
    const bucket = folded.get(key.toLowerCase());
    if (bucket) {
      bucket.push(resource);
    } else {
      folded.set(key.toLowerCase(), [resource]);
    }
  }
  return (linkKey) => {
    if (exact.has(linkKey)) {
      return undefined;
    }
    const bucket = folded.get(linkKey.toLowerCase());
    return bucket && bucket.length === 1 ? bucket[0] : undefined;
  };
}

function fileExists(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}

/**
 * Detects a symlink escape: the link resolves inside the package lexically, but
 * its real (symlink-resolved) target lies outside. Only meaningful for existing
 * targets. Unresolvable paths are treated as non-escaping to avoid false alarms.
 */
function realTargetEscapes(dir: string, target: string): boolean {
  try {
    return !isPathInsideDir(fs.realpathSync(dir), fs.realpathSync(target));
  } catch {
    return false;
  }
}
