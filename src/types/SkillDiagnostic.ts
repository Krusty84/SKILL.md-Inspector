/**
 * Normalized diagnostic model, decoupled from the VS Code API so that all
 * validation logic can be unit-tested without a VS Code host. The diagnostics
 * provider maps these onto `vscode.Diagnostic` objects.
 */
export type SkillDiagnosticSeverity = 'error' | 'warning' | 'information';

export interface SkillDiagnosticRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface SkillDiagnostic {
  code: string;
  severity: SkillDiagnosticSeverity;
  message: string;
  range?: SkillDiagnosticRange;
  source: 'SKILL.md Inspector';
  quickFixId?: string;
  /**
   * Optional structured payload used by quick fixes (e.g. a suggested
   * kebab-case name, or the resolved path of a missing linked file).
   */
  data?: Record<string, unknown>;
}

export const DIAGNOSTIC_SOURCE = 'SKILL.md Inspector' as const;
