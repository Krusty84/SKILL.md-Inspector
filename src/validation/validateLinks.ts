import * as fs from 'node:fs';
import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { resolveRelativeLinkPath, cleanLinkTarget } from '../parser/linkPaths';
import { diag } from './util';

const SUSPICIOUS_EXTENSIONS = /\.(exe|sh|bat|ps1|scr|cmd|zip|dll)(\?|#|$)/i;
const SHORTENER_HOSTS = /(^|\/\/)([^/]*\.)?(bit\.ly|tinyurl\.com|goo\.gl|t\.co|is\.gd)\b/i;

/**
 * Validates Markdown links in the body (brief §7.5):
 *  - relative link to a missing file -> error
 *  - absolute local path            -> warning (not portable)
 *  - remote URL                     -> information (warning if suspicious)
 */
export function validateLinks(doc: SkillDocument): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];

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
    if (!fileExists(target)) {
      diagnostics.push(
        diag(
          DiagnosticCode.LinkMissing,
          'error',
          `Linked file does not exist: ${cleanLinkTarget(link.raw)}`,
          link.range,
          { quickFixId: QuickFixId.CreateMissingLinkedFile, data: { absolutePath: target, raw: link.raw } },
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

function fileExists(target: string): boolean {
  try {
    return fs.statSync(target).isFile();
  } catch {
    return false;
  }
}
