import * as vscode from 'vscode';
import { analyzeSkill, type SkillAnalysis } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { isSkillFile, toVscodeDiagnostic } from './mapping';

/**
 * Owns the diagnostic collection and runs the deterministic pipeline against
 * SKILL.md documents. The heavy lifting lives in the pure `analyzeSkill`; this
 * class only bridges to the VS Code diagnostics API.
 */
export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('skillMdInspector');
  }

  /** Analyzes a document and publishes diagnostics. Returns the analysis, or
   * undefined when the document is not a SKILL.md or validation is disabled. */
  validate(document: vscode.TextDocument): SkillAnalysis | undefined {
    if (!isSkillFile(document)) {
      return undefined;
    }
    const config = readConfig(document.uri);
    if (!config.enabled) {
      this.collection.delete(document.uri);
      return undefined;
    }

    const analysis = analyzeSkill(document.uri.fsPath, document.getText(), config.profile);
    this.collection.set(
      document.uri,
      analysis.diagnostics.map((d) => toVscodeDiagnostic(d, document)),
    );
    return analysis;
  }

  /** Validates every SKILL.md in the workspace. Returns the file count. */
  async validateWorkspace(): Promise<number> {
    const files = await vscode.workspace.findFiles('**/SKILL.md', '**/node_modules/**');
    for (const uri of files) {
      const document = await vscode.workspace.openTextDocument(uri);
      this.validate(document);
    }
    return files.length;
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
