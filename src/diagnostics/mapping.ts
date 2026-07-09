import * as path from 'node:path';
import * as vscode from 'vscode';
import { DIAGNOSTIC_SOURCE } from '../types/SkillDiagnostic';
import type { SkillDiagnostic, SkillDiagnosticRange } from '../types/SkillDiagnostic';

/** True when the document is a file literally named `SKILL.md`. */
export function isSkillFile(document: vscode.TextDocument): boolean {
  return document.uri.scheme === 'file' && path.basename(document.uri.fsPath) === 'SKILL.md';
}

const SEVERITY: Record<SkillDiagnostic['severity'], vscode.DiagnosticSeverity> = {
  error: vscode.DiagnosticSeverity.Error,
  warning: vscode.DiagnosticSeverity.Warning,
  information: vscode.DiagnosticSeverity.Information,
};

/** Clamps a model range to valid document positions and converts it. */
export function toVscodeRange(
  range: SkillDiagnosticRange | undefined,
  document: vscode.TextDocument,
): vscode.Range {
  if (!range) {
    return firstLineRange(document);
  }
  const start = clampPosition(range.startLine, range.startCharacter, document);
  const end = clampPosition(range.endLine, range.endCharacter, document);
  return new vscode.Range(start, end);
}

export function toVscodeDiagnostic(
  diagnostic: SkillDiagnostic,
  document: vscode.TextDocument,
): vscode.Diagnostic {
  const vsDiagnostic = new vscode.Diagnostic(
    toVscodeRange(diagnostic.range, document),
    diagnostic.message,
    SEVERITY[diagnostic.severity],
  );
  vsDiagnostic.source = DIAGNOSTIC_SOURCE;
  vsDiagnostic.code = diagnostic.code;
  return vsDiagnostic;
}

function clampPosition(
  line: number,
  character: number,
  document: vscode.TextDocument,
): vscode.Position {
  const safeLine = Math.max(0, Math.min(line, Math.max(0, document.lineCount - 1)));
  const maxChar = document.lineAt(safeLine).text.length;
  return new vscode.Position(safeLine, Math.max(0, Math.min(character, maxChar)));
}

function firstLineRange(document: vscode.TextDocument): vscode.Range {
  const end = document.lineCount > 0 ? document.lineAt(0).text.length : 0;
  return new vscode.Range(0, 0, 0, end);
}
