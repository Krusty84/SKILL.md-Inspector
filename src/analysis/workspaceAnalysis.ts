import * as vscode from 'vscode';
import { readConfig, type InspectorConfig } from '../config';
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
        compatibilityAgents: config.compatibilityAgents,
      },
    ),
  };
}

/** Runs the online link checks over an already-computed analysis, mutating it in place. */
async function augmentAnalysisOnline(
  analysis: WorkspaceAnalysis,
  config: InspectorConfig,
  options: WorkspaceAnalysisOptions | undefined,
  remoteDependencies: RemoteLinkDependencies,
): Promise<void> {
  if (!config.onlineCheckEnabled) {
    return;
  }
  const session = new RemoteLinkCheckSession(remoteDependencies, {
    maxConcurrency: config.onlineCheckMaxConcurrency,
    cancellation: options?.cancel,
  });
  try {
    await Promise.all(
      analysis.skills.map(async (skill) => {
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
      analysis.cancelled = true;
    }
  } finally {
    session.dispose();
  }
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
  await augmentAnalysisOnline(result.analysis, config, options, remoteDependencies);
  return result;
}

/**
 * Report path for an explicit set of SKILL.md paths (the INSTALLED AGENTS view),
 * independent of the open workspace. `rootDir` only affects the relative path
 * shown in the report's duplicate-names list, so a synthesized common-ancestor
 * directory is fine. Config is read from `scopeUri` (user/global for installed files).
 */
export async function computeScopedAnalysisOnline(
  rootDir: string,
  skillPaths: string[],
  options?: WorkspaceAnalysisOptions,
  scopeUri?: vscode.Uri,
  remoteDependencies: RemoteLinkDependencies = nodeRemoteLinkDependencies,
): Promise<WorkspaceAnalysis> {
  const config = readConfig(scopeUri);
  const analysis = analyzeWorkspace(
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
      compatibilityAgents: config.compatibilityAgents,
    },
  );
  if (!analysis.cancelled) {
    await augmentAnalysisOnline(analysis, config, options, remoteDependencies);
  }
  return analysis;
}
