import { DIAGNOSTIC_SOURCE } from '../types/SkillDiagnostic';
import type {
  SkillDiagnostic,
  SkillDiagnosticRange,
  SkillDiagnosticSeverity,
} from '../types/SkillDiagnostic';
import { KIND_BY_CODE } from '../types/DiagnosticCode';
import type { SkillDocument } from '../types/SkillDocument';

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
    kind: KIND_BY_CODE[code] ?? 'quality',
    message,
    range,
    source: DIAGNOSTIC_SOURCE,
    ...(extras.quickFixId ? { quickFixId: extras.quickFixId } : {}),
    ...(extras.data ? { data: extras.data } : {}),
  };
}

const SEVERITY_RANK: Record<SkillDiagnosticSeverity, number> = {
  error: 0,
  warning: 1,
  information: 2,
};

/**
 * Deterministic diagnostic order (Task 82): by document position (diagnostics
 * with no range sort last), then severity (error < warning < information), then
 * diagnostic code. Pure — returns a new array.
 */
export function sortDiagnostics(diagnostics: SkillDiagnostic[]): SkillDiagnostic[] {
  return [...diagnostics].sort((a, b) => {
    if (a.range && b.range) {
      if (a.range.startLine !== b.range.startLine) {
        return a.range.startLine - b.range.startLine;
      }
      if (a.range.startCharacter !== b.range.startCharacter) {
        return a.range.startCharacter - b.range.startCharacter;
      }
    } else if (a.range || b.range) {
      return a.range ? -1 : 1;
    }
    if (SEVERITY_RANK[a.severity] !== SEVERITY_RANK[b.severity]) {
      return SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    }
    return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
  });
}

/** Range of a top-level frontmatter key (from the YAML AST), else the whole block. */
export function keyRange(doc: SkillDocument, key: string): SkillDiagnosticRange | undefined {
  return doc.frontmatterKeyRanges?.[key] ?? doc.frontmatterRange;
}

/** A single-line range at the start of the Markdown body (for body-level notes). */
export function bodyTopRange(doc: SkillDocument): SkillDiagnosticRange {
  const line = Math.max(0, doc.bodyStartLine);
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: 0 };
}
