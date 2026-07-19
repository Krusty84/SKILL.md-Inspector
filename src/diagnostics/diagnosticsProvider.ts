import * as vscode from 'vscode';
import { analyzeSkill, type SkillAnalysis, type AnalysisMode } from '../analysis/analyzeSkill';
import { ResourceCache } from '../parser/resourceCache';
import { readConfig } from '../config';
import { isSkillFile, toVscodeDiagnostic } from './mapping';
import { augmentWithRemoteDiagnostics } from '../online/augmentRemoteDiagnostics';
import { RemoteLinkCheckSession, type RemoteLinkDependencies } from '../online/remoteLinkChecker';
import { nodeRemoteLinkDependencies } from '../online/nodeRemoteLinkDependencies';

/**
 * Owns the diagnostic collection and runs the deterministic pipeline against
 * SKILL.md documents. The heavy lifting lives in the pure `analyzeSkill`; this
 * class only bridges to the VS Code diagnostics API. Full-mode resource
 * discovery is served from a cache invalidated by the file watchers.
 */
export class DiagnosticsProvider implements vscode.Disposable {
  private readonly collection: vscode.DiagnosticCollection;
  private readonly resourceCache = new ResourceCache();
  private readonly requests = new Map<string, ValidationRequest>();
  private nextRequestId = 0;

  constructor(private readonly remoteDependencies: RemoteLinkDependencies = nodeRemoteLinkDependencies) {
    this.collection = vscode.languages.createDiagnosticCollection('skillMdInspector');
  }

  /**
   * Analyzes a document and publishes diagnostics. `text-only` mode (used while
   * typing) does no filesystem access; `full` mode (open/save/commands) runs the
   * whole pipeline. Returns the analysis, or undefined when the document is not a
   * SKILL.md or validation is disabled.
   */
  async validate(
    document: vscode.TextDocument,
    mode: AnalysisMode = 'full',
    sharedSession?: RemoteLinkCheckSession,
  ): Promise<SkillAnalysis | undefined> {
    if (!isSkillFile(document)) {
      return undefined;
    }
    const request = this.beginRequest(document);
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
    if (mode === 'text-only' || !config.onlineCheckEnabled) {
      return analysis;
    }

    const session =
      sharedSession ??
      new RemoteLinkCheckSession(this.remoteDependencies, {
        maxConcurrency: config.onlineCheckMaxConcurrency,
        cancellation: request.cancellation,
      });
    try {
      const augmented = await augmentWithRemoteDiagnostics(
        analysis,
        config.profile,
        true,
        session,
      );
      if (!this.isCurrent(document, request)) {
        return undefined;
      }
      this.collection.set(
        document.uri,
        augmented.diagnostics.map((diagnostic) => toVscodeDiagnostic(diagnostic, document)),
      );
      return augmented;
    } finally {
      if (!sharedSession) {
        session.dispose();
      }
    }
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
    const rootScope = vscode.workspace.workspaceFolders?.[0]?.uri;
    const operationConfig = readConfig(rootScope);
    const session = new RemoteLinkCheckSession(this.remoteDependencies, {
      maxConcurrency: operationConfig.onlineCheckMaxConcurrency,
      cancellation: token,
    });
    try {
      const validations: Array<Promise<void>> = [];
      for (const uri of files) {
        if (token?.isCancellationRequested) {
          break;
        }
        const document = await vscode.workspace.openTextDocument(uri);
        validations.push(
          this.validate(document, 'full', session).then(() => {
            processed += 1;
            progress?.report({
              message: `${processed}/${total}`,
              increment: total > 0 ? 100 / total : 0,
            });
          }),
        );
      }
      await Promise.all(validations);
      return { processed, total, cancelled: token?.isCancellationRequested === true };
    } finally {
      session.dispose();
    }
  }

  clear(uri: vscode.Uri): void {
    this.cancelRequest(uri.toString());
    this.collection.delete(uri);
  }

  dispose(): void {
    for (const request of this.requests.values()) {
      request.cancellation.cancel();
    }
    this.requests.clear();
    this.collection.dispose();
  }

  private beginRequest(document: vscode.TextDocument): ValidationRequest {
    const key = document.uri.toString();
    this.cancelRequest(key);
    const request: ValidationRequest = {
      id: ++this.nextRequestId,
      version: document.version,
      cancellation: new MutableCancellationSignal(),
    };
    this.requests.set(key, request);
    return request;
  }

  private isCurrent(document: vscode.TextDocument, request: ValidationRequest): boolean {
    return (
      !request.cancellation.isCancellationRequested &&
      document.version === request.version &&
      this.requests.get(document.uri.toString())?.id === request.id
    );
  }

  private cancelRequest(key: string): void {
    this.requests.get(key)?.cancellation.cancel();
    this.requests.delete(key);
  }
}

interface ValidationRequest {
  id: number;
  version: number;
  cancellation: MutableCancellationSignal;
}

class MutableCancellationSignal {
  isCancellationRequested = false;
  private readonly listeners = new Set<() => void>();

  onCancellationRequested(listener: () => void): { dispose(): void } {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  }

  cancel(): void {
    if (this.isCancellationRequested) return;
    this.isCancellationRequested = true;
    for (const listener of this.listeners) listener();
    this.listeners.clear();
  }
}
