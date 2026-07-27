import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { assessDocumentDescriptionQuality } from '../quality/staticDescriptionQuality';
import { assessAuthoringQuality } from '../authoring/authoringQuality';
import { projectCompatibility } from '../compat/projectCompatibility';
import { buildResourceGraph } from './buildResourceGraph';
import { detectCollisions } from './detectSkillCollisions';
import type { CollisionOptions } from './detectSkillCollisions';
import { detectNameConflicts, detectSimilarNames } from './detectNameConflicts';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { CompatibilityReport } from '../types/AgentCompatibility';
import type { SkillProfile } from '../types/SkillProfile';
import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillsIndex,
  SkillsIndexCompatibility,
} from '../types/Workspace';

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
    options.dictionaries,
    options.cancel,
  );
  const named = skills.map((skill) => ({ name: skill.name, path: skill.path }));
  const nameConflicts = detectNameConflicts(named);
  const similarNames = detectSimilarNames(named, similarityThreshold, options.cancel);
  // Either cross-skill phase can be cancelled mid-scan; reflect that so a
  // partial comparison is never presented as complete.
  if (options.cancel?.isCancellationRequested) {
    cancelled = true;
  }

  return { skills, collisions, nameConflicts, similarNames, cancelled };
}

/** Builds the exportable index model (brief §13.6). */
export function buildSkillsIndex(analysis: WorkspaceAnalysis): SkillsIndex {
  return {
    schemaVersion: 7,
    generatedAt: new Date().toISOString(),
    skills: analysis.skills.map((skill) => ({
      name: skill.name,
      path: skill.path,
      description: skill.description,
      validationStatus: skill.validationStatus,
      staticDescriptionQuality: skill.staticDescriptionQuality,
      authoringQuality: skill.authoringQuality,
      errors: skill.errors,
      warnings: skill.warnings,
      information: skill.information,
      diagnostics: skill.diagnostics,
      compatibility: toIndexCompatibility(skill.compatibility),
    })),
  };
}

/** The exported projection keeps the data and drops the display labels. */
function toIndexCompatibility(report: CompatibilityReport): SkillsIndexCompatibility {
  return {
    verifiedOn: report.verifiedOn,
    projections: report.projections.map((projection) => ({
      agent: projection.agent,
      verdict: projection.verdict,
      findings: projection.findings,
      ...(projection.notEvaluatedReason !== undefined
        ? { notEvaluatedReason: projection.notEvaluatedReason }
        : {}),
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

  const { document, diagnostics, tokenUsage } = analyzeSkill(absolutePath, content, profile, {
    exclude,
    dictionaries: options.dictionaries,
    resourceDirectories: options.resourceDirectories,
  });
  const name =
    typeof document.frontmatter?.name === 'string' && document.frontmatter.name
      ? document.frontmatter.name
      : path.basename(path.dirname(absolutePath));
  const description =
    typeof document.frontmatter?.description === 'string' ? document.frontmatter.description : '';

  const staticDescriptionQuality = assessDocumentDescriptionQuality(document, {
    minLength: profile.description.minLength,
    maxLength: profile.description.maxLength,
    language: profile.description.language,
    weights: profile.description.weights,
    dictionaries: options.dictionaries,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const information = diagnostics.filter((d) => d.severity === 'information').length;
  const validationStatus = errors > 0 ? 'fail' : warnings > 0 ? 'warning' : 'pass';
  const indexDiagnostics = diagnostics.map((d) => ({
    code: d.code,
    severity: d.severity,
    kind: d.kind,
  }));
  const resourceGraph = buildResourceGraph(document);
  const authoringQuality = assessAuthoringQuality(
    document,
    options.dictionaries,
    tokenUsage.body.lines,
  );

  return {
    name,
    path: toPosix(path.relative(rootDir, absolutePath)),
    absolutePath,
    description,
    validationStatus,
    staticDescriptionQuality,
    authoringQuality,
    errors,
    warnings,
    information,
    diagnostics: indexDiagnostics,
    profile: profile.id,
    resourceGraph,
    tokenUsage,
    compatibility: projectCompatibility(document),
  };
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
