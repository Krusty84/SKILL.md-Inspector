import { DIAGNOSTIC_SOURCE } from '../types/SkillDiagnostic';
import type {
  SkillDiagnostic,
  SkillDiagnosticRange,
  SkillDiagnosticSeverity,
} from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { locateFrontmatterKey } from '../parser/parseFrontmatter';
import { frontmatterStartLine } from '../parser/parseSkillFile';

export interface DiagnosticExtras {
  quickFixId?: string;
  data?: Record<string, unknown>;
}

/** Builds a normalized diagnostic with the fixed source tag. */
export function diag(
  code: string,
  severity: SkillDiagnosticSeverity,
  message: string,
  range?: SkillDiagnosticRange,
  extras: DiagnosticExtras = {},
): SkillDiagnostic {
  return {
    code,
    severity,
    message,
    range,
    source: DIAGNOSTIC_SOURCE,
    ...(extras.quickFixId ? { quickFixId: extras.quickFixId } : {}),
    ...(extras.data ? { data: extras.data } : {}),
  };
}

/** Range of a frontmatter key's line, falling back to the whole block. */
export function keyRange(doc: SkillDocument, key: string): SkillDiagnosticRange | undefined {
  const located = locateFrontmatterKey(doc.frontmatterRaw, frontmatterStartLine(doc), key);
  return located ?? doc.frontmatterRange;
}

/** A single-line range at the start of the Markdown body (for body-level notes). */
export function bodyTopRange(doc: SkillDocument): SkillDiagnosticRange {
  const line = Math.max(0, doc.bodyStartLine);
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: 0 };
}
