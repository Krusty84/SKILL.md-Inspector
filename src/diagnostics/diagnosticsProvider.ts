import * as vscode from 'vscode';
import { analyzeSkill, type SkillAnalysis, type AnalysisMode } from '../analysis/analyzeSkill';
import { FileTokenCache } from '../analysis/fileTokenCache';
import { ResourceCache } from '../parser/resourceCache';
import { readConfig, type InspectorConfig } from '../config';
import { isPathInsideDir } from '../parser/linkPaths';
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
  private readonly fileTokenCache = new FileTokenCache();
  private readonly requests = new Map<string, ValidationRequest>();
  /**
   * Latest analysis per document, keyed by URI and stamped with the document
   * version it was computed from. The code-action provider is invoked by
   * VS Code on every cursor move and content change; serving it from here
   * instead of re-analyzing keeps that path free of filesystem work.
   */
  private readonly lastAnalyses = new Map<
    string,
    { version: number; mode: AnalysisMode; analysis: SkillAnalysis }
  >();
  private nextRequestId = 0;

  constructor(private readonly remoteDependencies: RemoteLinkDependencies = nodeRemoteLinkDependencies) {
    this.collection = vscode.languages.createDiagnosticCollection('skillMdInspector');
  }

  /**
   * Analyzes a document and publishes diagnostics. `full` mode (the default,
   * also used by the debounced while-typing runs, which pass `online: false`)
   * runs the whole pipeline served from the resource and token caches;
   * `text-only` mode does no filesystem access at all. Returns the analysis,
   * or undefined when the document is not a SKILL.md or validation is
   * disabled.
   */
  async validate(
    document: vscode.TextDocument,
    options: ValidateOptions = {},
  ): Promise<SkillAnalysis | undefined> {
    const mode = options.mode ?? 'full';
    if (!isSkillFile(document)) {
      return undefined;
    }
    const request = this.beginRequest(document);
    const config = readConfig(document.uri);
    if (!config.enabled) {
      this.collection.delete(document.uri);
      this.lastAnalyses.delete(document.uri.toString());
      return undefined;
    }

    const analysis = this.runAnalysis(document, config, mode);
    this.collection.set(
      document.uri,
      analysis.diagnostics.map((d) => toVscodeDiagnostic(d, document)),
    );
    if (mode === 'text-only' || options.online === false || !config.onlineCheckEnabled) {
      return analysis;
    }

    const sharedSession = options.sharedSession;
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
      this.lastAnalyses.set(document.uri.toString(), {
        version: request.version,
        mode,
        analysis: augmented,
      });
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

  /**
   * Serves the code-action provider, which VS Code invokes on every cursor
   * move: the latest full analysis when it is still current for the document
   * version, otherwise one fresh cache-backed full analysis (first lightbulb
   * before the first validate, or a filesystem invalidation with no text edit).
   */
  analysisForCodeActions(document: vscode.TextDocument): SkillAnalysis {
    const cached = this.lastAnalyses.get(document.uri.toString());
    if (cached && cached.version === document.version && cached.mode === 'full') {
      return cached.analysis;
    }
    return this.runAnalysis(document, readConfig(document.uri), 'full');
  }

  /**
   * True when the latest recorded analysis matches the document's current
   * version — i.e. published diagnostics are up to date and a revalidation
   * would be redundant. Used to keep visible-editor sweeps cheap.
   */
  hasCurrentAnalysis(document: vscode.TextDocument): boolean {
    return this.lastAnalyses.get(document.uri.toString())?.version === document.version;
  }

  /** Invalidates cached resources for the skill directory containing `filePath`. */
  invalidateResource(filePath: string): void {
    this.resourceCache.invalidateFile(filePath);
    this.fileTokenCache.invalidateUnder(filePath);
    // Filesystem-dependent diagnostics can change with no document edit, so
    // version-matched analyses of the owning skill are stale too.
    for (const [key, entry] of [...this.lastAnalyses]) {
      if (isPathInsideDir(entry.analysis.document.directory, filePath)) {
        this.lastAnalyses.delete(key);
      }
    }
  }

  /** Clears the whole resource cache (e.g. on configuration change). */
  clearResourceCache(): void {
    this.resourceCache.clear();
    this.fileTokenCache.clear();
    this.lastAnalyses.clear();
  }

  /** Runs the deterministic pipeline and records the result for reuse. */
  private runAnalysis(
    document: vscode.TextDocument,
    config: InspectorConfig,
    mode: AnalysisMode,
  ): SkillAnalysis {
    const analysis = analyzeSkill(document.uri.fsPath, document.getText(), config.profile, {
      mode,
      exclude: config.resourceExclude,
      dictionaries: config.heuristicDictionaries,
      resourceDirectories: config.resourceDirectories,
      security: config.security,
      discover: (dir, exclude) => this.resourceCache.discover(dir, exclude),
      fileTokens: (resource) => this.fileTokenCache.tokensFor(resource.absolutePath),
    });
    this.lastAnalyses.set(document.uri.toString(), {
      version: document.version,
      mode,
      analysis,
    });
    return analysis;
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
          this.validate(document, { sharedSession: session }).then(() => {
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

  /**
   * Validates an explicit list of SKILL.md absolute paths (used by the installed
   * agents commands, whose files live outside the workspace), publishing their
   * diagnostics. Mirrors {@link validateWorkspace} without workspace discovery.
   */
  async validatePaths(
    paths: readonly string[],
    token?: vscode.CancellationToken,
    progress?: vscode.Progress<{ message?: string; increment?: number }>,
  ): Promise<{ processed: number; total: number; cancelled: boolean }> {
    const total = paths.length;
    let processed = 0;
    const operationConfig = readConfig(paths[0] ? vscode.Uri.file(paths[0]) : undefined);
    const session = new RemoteLinkCheckSession(this.remoteDependencies, {
      maxConcurrency: operationConfig.onlineCheckMaxConcurrency,
      cancellation: token,
    });
    try {
      const validations: Array<Promise<void>> = [];
      for (const filePath of paths) {
        if (token?.isCancellationRequested) {
          break;
        }
        const document = await vscode.workspace.openTextDocument(vscode.Uri.file(filePath));
        validations.push(
          this.validate(document, { sharedSession: session }).then(() => {
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
    this.lastAnalyses.delete(uri.toString());
  }

  dispose(): void {
    for (const request of this.requests.values()) {
      request.cancellation.cancel();
    }
    this.requests.clear();
    this.lastAnalyses.clear();
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

export interface ValidateOptions {
  /** Defaults to 'full'. */
  mode?: AnalysisMode;
  /**
   * Set to false to skip the online link phase even when it is enabled — the
   * debounced while-typing runs must never fire network requests per edit.
   */
  online?: boolean;
  /** Shared remote-link session for batch operations (workspace validation). */
  sharedSession?: RemoteLinkCheckSession;
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
