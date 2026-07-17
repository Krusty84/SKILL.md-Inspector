import * as vscode from 'vscode';
import { readConfig } from '../config';
import { discoverSkillPaths } from '../workspace/discoverSkills';
import { analyzeWorkspace, type WorkspaceAnalysisOptions } from '../workspace/analyzeWorkspace';
import type { WorkspaceAnalysis } from '../types/Workspace';

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
      { ...options, dictionaries: config.heuristicDictionaries, resourceDirectories: config.resourceDirectories },
    ),
  };
}
