import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { computeStaticDescriptionQuality } from '../quality/staticDescriptionQuality';
import { buildResourceGraph } from './buildResourceGraph';
import { evaluatePortability, toCompatibilityMap } from './portability';
import { detectCollisions } from './detectSkillCollisions';
import type { CollisionOptions } from './detectSkillCollisions';
import { detectNameConflicts, detectSimilarNames } from './detectNameConflicts';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { SkillProfile } from '../types/SkillProfile';
import type { WorkspaceAnalysis, WorkspaceSkill, SkillsIndex } from '../types/Workspace';

/** Minimal cancellation signal, structurally compatible with `vscode.CancellationToken`. */
export interface CancellationSignal {
  isCancellationRequested: boolean;
}

/** Cancellation and progress hooks for a workspace scan (keeps this module vscode-free). */
export interface WorkspaceAnalysisOptions {
  /** Checked before each skill file; when it flips, the scan stops and the result is marked partial. */
  cancel?: CancellationSignal;
  /** Reports progress after each analyzed skill as (done, total). */
  onProgress?: (done: number, total: number) => void;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
}

/**
 * Analyzes every discovered skill and detects collisions across them
 * (brief §13). Reads files via node fs, so it is testable with a temp workspace
 * and has no `vscode` dependency. Cancellation is checked between files; on
 * cancel the returned analysis covers only the files scanned so far and its
 * `cancelled` flag is set so callers never present a partial scan as complete.
 */
export function analyzeWorkspace(
  rootDir: string,
  skillPaths: string[],
  profile: SkillProfile,
  exclude?: readonly string[],
  similarityThreshold?: number,
  collisionOptions?: CollisionOptions,
  options: WorkspaceAnalysisOptions = {},
): WorkspaceAnalysis {
  const analyzed: WorkspaceSkill[] = [];
  const total = skillPaths.length;
  let cancelled = false;

  for (let i = 0; i < total; i++) {
    if (options.cancel?.isCancellationRequested) {
      cancelled = true;
      break;
    }
    const skill = toWorkspaceSkill(rootDir, skillPaths[i], profile, exclude, options);
    if (skill) {
      analyzed.push(skill);
    }
    options.onProgress?.(i + 1, total);
  }

  const skills = analyzed.sort((a, b) => a.name.localeCompare(b.name));
  const collisions = detectCollisions(
    skills.map((skill) => ({ name: skill.name, description: skill.description })),
    collisionOptions,
  );
  const named = skills.map((skill) => ({ name: skill.name, path: skill.path }));
  const nameConflicts = detectNameConflicts(named);
  const similarNames = detectSimilarNames(named, similarityThreshold);

  return { skills, collisions, nameConflicts, similarNames, cancelled };
}

/** Builds the exportable index model (brief §13.6). */
export function buildSkillsIndex(analysis: WorkspaceAnalysis): SkillsIndex {
  return {
    schemaVersion: 2,
    generatedAt: new Date().toISOString(),
    skills: analysis.skills.map((skill) => ({
      name: skill.name,
      path: skill.path,
      description: skill.description,
      staticDescriptionQuality: skill.staticDescriptionQuality,
      errors: skill.errors,
      warnings: skill.warnings,
      diagnostics: skill.diagnostics,
      profileCompatibility: skill.profileCompatibility,
    })),
  };
}

function toWorkspaceSkill(
  rootDir: string,
  absolutePath: string,
  profile: SkillProfile,
  exclude?: readonly string[],
  options: WorkspaceAnalysisOptions = {},
): WorkspaceSkill | undefined {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return undefined;
  }

  const { document, diagnostics } = analyzeSkill(absolutePath, content, profile, { exclude, dictionaries: options.dictionaries, resourceDirectories: options.resourceDirectories });
  const name =
    typeof document.frontmatter?.name === 'string' && document.frontmatter.name
      ? document.frontmatter.name
      : path.basename(path.dirname(absolutePath));
  const description =
    typeof document.frontmatter?.description === 'string' ? document.frontmatter.description : '';

  const staticDescriptionQuality = computeStaticDescriptionQuality(description, {
    minLength: profile.description.minLength,
    maxLength: profile.description.maxLength,
    language: profile.description.language,
    weights: profile.description.weights,
    dictionaries: options.dictionaries,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const information = diagnostics.filter((d) => d.severity === 'information').length;
  const indexDiagnostics = diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    kind: d.kind,
  }));
  const resourceGraph = buildResourceGraph(document);

  const portability = evaluatePortability(document);

  return {
    name,
    path: toPosix(path.relative(rootDir, absolutePath)),
    absolutePath,
    description,
    staticDescriptionQuality: staticDescriptionQuality.score,
    staticDescriptionQualityLabel: staticDescriptionQuality.label,
    errors,
    warnings,
    information,
    diagnostics: indexDiagnostics,
    profile: profile.id,
    profileCompatibility: toCompatibilityMap(portability),
    portability,
    resourceGraph,
  };
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
