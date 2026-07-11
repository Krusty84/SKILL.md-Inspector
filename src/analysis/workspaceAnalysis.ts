import * as vscode from 'vscode';
import { readConfig } from '../config';
import { discoverSkillPaths } from '../workspace/discoverSkills';
import { analyzeWorkspace } from '../workspace/analyzeWorkspace';
import type { WorkspaceAnalysis } from '../types/Workspace';

export interface WorkspaceAnalysisResult {
  rootDir: string;
  analysis: WorkspaceAnalysis;
}

/**
 * Discovers and analyzes all skills in the first workspace folder. Returns
 * undefined when no folder is open. This is the single vscode-facing entry the
 * tree view, workspace report, and index export share.
 */
export function computeWorkspaceAnalysis(): WorkspaceAnalysisResult | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  const rootDir = folders[0].uri.fsPath;
  const config = readConfig(folders[0].uri);
  const skillPaths = discoverSkillPaths(rootDir);
  return {
    rootDir,
    analysis: analyzeWorkspace(rootDir, skillPaths, config.profile, config.resourceExclude),
  };
}
