import * as vscode from 'vscode';
import { readConfig } from '../config';
import { discoverSkillPaths } from '../workspace/discoverSkills';
import { analyzeWorkspace, type WorkspaceAnalysisOptions } from '../workspace/analyzeWorkspace';
import type { WorkspaceAnalysis } from '../types/Workspace';
import * as fs from 'node:fs';
import { analyzeSkill } from './analyzeSkill';
import { RemoteLinkCheckSession, type RemoteLinkDependencies } from '../online/remoteLinkChecker';
import { nodeRemoteLinkDependencies } from '../online/nodeRemoteLinkDependencies';
import { augmentWithRemoteDiagnostics } from '../online/augmentRemoteDiagnostics';

export interface WorkspaceAnalysisResult {
  rootDir: string;
  analysis: WorkspaceAnalysis;
}

/**
 * Discovers and analyzes all skills in the first workspace folder. Returns
 * undefined when no folder is open. This is the single vscode-facing entry the
 * tree view, workspace report, and index export share. Optional cancellation and
 * progress hooks are forwarded to the analyzer.
 */
export function computeWorkspaceAnalysis(
  options?: WorkspaceAnalysisOptions,
): WorkspaceAnalysisResult | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  const rootDir = folders[0].uri.fsPath;
  const config = readConfig(folders[0].uri);
  const skillPaths = discoverSkillPaths(rootDir, config.discoveryExclude);
  return {
    rootDir,
    analysis: analyzeWorkspace(
      rootDir,
      skillPaths,
      config.profile,
      config.resourceExclude,
      config.nameSimilarityThreshold,
      config.collision,
      {
        ...options,
        dictionaries: config.heuristicDictionaries,
        resourceDirectories: config.resourceDirectories,
      },
    ),
  };
}

/** VS Code report/index path: synchronous core analysis plus optional asynchronous link checks. */
export async function computeWorkspaceAnalysisOnline(
  options?: WorkspaceAnalysisOptions,
  remoteDependencies: RemoteLinkDependencies = nodeRemoteLinkDependencies,
): Promise<WorkspaceAnalysisResult | undefined> {
  const result = computeWorkspaceAnalysis(options);
  if (!result || result.analysis.cancelled) {
    return result;
  }
  const config = readConfig(vscode.workspace.workspaceFolders?.[0]?.uri);
  if (!config.onlineCheckEnabled) {
    return result;
  }

  const session = new RemoteLinkCheckSession(remoteDependencies, {
    maxConcurrency: config.onlineCheckMaxConcurrency,
    cancellation: options?.cancel,
  });
  try {
    await Promise.all(
      result.analysis.skills.map(async (skill) => {
        if (options?.cancel?.isCancellationRequested) return;
        let content: string;
        try {
          content = fs.readFileSync(skill.absolutePath, 'utf8');
        } catch {
          return;
        }
        const staticAnalysis = analyzeSkill(skill.absolutePath, content, config.profile, {
          exclude: config.resourceExclude,
          dictionaries: config.heuristicDictionaries,
          resourceDirectories: config.resourceDirectories,
        });
        const augmented = await augmentWithRemoteDiagnostics(
          staticAnalysis,
          config.profile,
          true,
          session,
        );
        if (options?.cancel?.isCancellationRequested) return;
        skill.errors = augmented.diagnostics.filter((item) => item.severity === 'error').length;
        skill.warnings = augmented.diagnostics.filter((item) => item.severity === 'warning').length;
        skill.information = augmented.diagnostics.filter(
          (item) => item.severity === 'information',
        ).length;
        skill.validationStatus =
          skill.errors > 0 ? 'fail' : skill.warnings > 0 ? 'warning' : 'pass';
        skill.diagnostics = augmented.diagnostics.map(({ code, severity, kind }) => ({
          code,
          severity,
          kind,
        }));
      }),
    );
    if (options?.cancel?.isCancellationRequested) {
      result.analysis.cancelled = true;
    }
    return result;
  } finally {
    session.dispose();
  }
}
