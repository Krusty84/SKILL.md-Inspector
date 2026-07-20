/**
 * Normalized diagnostic model, decoupled from the VS Code API so that all
 * validation logic can be unit-tested without a VS Code host. The diagnostics
 * provider maps these onto `vscode.Diagnostic` objects.
 */
export type SkillDiagnosticSeverity = 'error' | 'warning' | 'information';

/**
 * Classifies a diagnostic so reports and CI can separate hard requirements from
 * advice (Task 86): `specification` = the file is invalid; `compatibility` =
 * valid but not portable to a target profile; `security` = a risky reference;
 * `quality` = a discoverability recommendation; `internal` = the linter itself
 * failed to complete a check (not a problem with the skill).
 */
export type SkillDiagnosticKind =
  | 'specification'
  | 'compatibility'
  | 'quality'
  | 'security'
  | 'internal';

export interface SkillDiagnosticRange {
  startLine: number;
  startCharacter: number;
  endLine: number;
  endCharacter: number;
}

export interface SkillDiagnostic {
  code: string;
  severity: SkillDiagnosticSeverity;
  /** Classification of the rule (Task 86); set centrally from the code. */
  kind: SkillDiagnosticKind;
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
