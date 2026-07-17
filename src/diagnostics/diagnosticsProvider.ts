import * as vscode from 'vscode';
import { analyzeSkill, type SkillAnalysis, type AnalysisMode } from '../analysis/analyzeSkill';
import { ResourceCache } from '../parser/resourceCache';
import { readConfig } from '../config';
import { isSkillFile, toVscodeDiagnostic } from './mapping';

/**
 * Owns the diagnostic collection and runs the deterministic pipeline against
 * SKILL.md documents. The heavy lifting lives in the pure `analyzeSkill`; this
 * class only bridges to the VS Code diagnostics API. Full-mode resource
 * discovery is served from a cache invalidated by the file watchers.
 */
export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly resourceCache = new ResourceCache();

  constructor() {
    this.collection = vscode.languages.createDiagnosticCollection('skillMdInspector');
  }

  /**
   * Analyzes a document and publishes diagnostics. `text-only` mode (used while
   * typing) does no filesystem access; `full` mode (open/save/commands) runs the
   * whole pipeline. Returns the analysis, or undefined when the document is not a
   * SKILL.md or validation is disabled.
   */
  validate(document: vscode.TextDocument, mode: AnalysisMode = 'full'): SkillAnalysis | undefined {
    if (!isSkillFile(document)) {
      return undefined;
    }
    const config = readConfig(document.uri);
    if (!config.enabled) {
      this.collection.delete(document.uri);
      return undefined;
    }

    const analysis = analyzeSkill(document.uri.fsPath, document.getText(), config.profile, {
      mode,
      exclude: config.resourceExclude,
      dictionaries: config.heuristicDictionaries,
      resourceDirectories: config.resourceDirectories,
      discover: (dir, exclude) => this.resourceCache.discover(dir, exclude),
    });
    this.collection.set(
      document.uri,
      analysis.diagnostics.map((d) => toVscodeDiagnostic(d, document)),
    );
    return analysis;
  }

  /** Invalidates cached resources for the skill directory containing `filePath`. */
  invalidateResource(filePath: string): void {
    this.resourceCache.invalidateFile(filePath);
  }

  /** Clears the whole resource cache (e.g. on configuration change). */
  clearResourceCache(): void {
    this.resourceCache.clear();
  }

  /**
   * Validates every SKILL.md in the workspace, checking the cancellation token
   * between files and reporting progress. Returns how many files were processed,
   * the total discovered, and whether the run was cancelled.
   */
  async validateWorkspace(
    token?: vscode.CancellationToken,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<{ processed: number; total: number; cancelled: boolean }> {
    const files = await vscode.workspace.findFiles('**/SKILL.md', '**/node_modules/**');
    const total = files.length;
    let processed = 0;
    for (const uri of files) {
      if (token?.isCancellationRequested) {
        return { processed, total, cancelled: true };
      }
      const document = await vscode.workspace.openTextDocument(uri);
      this.validate(document);
      processed += 1;
      progress?.report({
        message: `${processed}/${total}`,
        increment: total > 0 ? 100 / total : 0,
      });
    }
    return { processed, total, cancelled: false };
  }

  clear(uri: vscode.Uri): void {
    this.collection.delete(uri);
  }

  dispose(): void {
    this.collection.dispose();
  }
}
