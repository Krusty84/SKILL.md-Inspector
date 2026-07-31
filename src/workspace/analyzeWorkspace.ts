import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { assessDocumentDescriptionQuality } from '../quality/staticDescriptionQuality';
import { assessAuthoringQuality } from '../authoring/authoringQuality';
import { enabledCapabilityTable } from '../compat/agentCapabilities';
import { projectCompatibility } from '../compat/projectCompatibility';
import { buildResourceGraph } from './buildResourceGraph';
import { detectCollisions } from './detectSkillCollisions';
import type { CollisionOptions } from './detectSkillCollisions';
import { detectNameConflicts, detectSimilarNames } from './detectNameConflicts';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { SecuritySettings } from '../validation/security';
import type { AgentId, CompatibilityReport } from '../types/AgentCompatibility';
import { compareInvariant } from '../quality/textMatch';
import type { SkillProfile } from '../types/SkillProfile';
import type { SkillResource } from '../types/SkillDocument';
import type { ResourceTokenSource } from '../analysis/tokenUsage';
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
  /** Agents the compatibility projection evaluates; omitted = all agents. */
  compatibilityAgents?: readonly AgentId[];
  /** Static security-scan settings; omitted = defaults. */
  security?: SecuritySettings;
  /** Largest bundled resource file that is read and token-counted, in bytes. */
  maxCountedFileSizeBytes?: number;
  /**
   * Resource discovery, so the workspace path can share the extension's
   * `ResourceCache` instead of re-walking every skill directory on every scan.
   */
  discover?: (dir: string, exclude?: readonly string[]) => SkillResource[];
  /**
   * Per-resource token counts, so the workspace path can share the extension's
   * `FileTokenCache` instead of re-reading and re-BPE-encoding every reference
   * file for the 499 skills that did not change.
   */
  fileTokens?: ResourceTokenSource;
  /** Most collisions to report; the rest are counted in `suppressedCollisions`. */
  maxReportedCollisions?: number;
  /** Yields to the host every this many skills so cancel and progress can be processed. */
  yieldEverySkills?: number;
}

/**
 * Default cap on the reported collision list.
 *
 * `detectCollisions` returned every pair at or above the threshold with no
 * bound: 500 skills built from one house template produced 124,750 collision
 * objects, each carrying `metrics` and `sharedTerms`, all rendered into the
 * webview and the tree view. Past a few hundred the list has stopped being a
 * list of problems and become a description of one problem.
 */
const DEFAULT_MAX_REPORTED_COLLISIONS = 500;

/** Skills analyzed between yields to the host event loop. */
const DEFAULT_YIELD_EVERY_SKILLS = 8;

/** Returns to the event loop so the host can paint progress and deliver a cancel. */
function yieldToHost(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

/**
 * Skills are ordered locale-invariantly: `localeCompare` with no explicit locale
 * sorts by the host's, so two developers exporting `skills.index.json` from the
 * same commit on `en-US` and `sv-SE` got different orderings. Collision pair
 * orientation follows this sort, so `{a, b}` could swap too.
 */
const compareNames = compareInvariant;

/**
 * Analyzes every discovered skill and detects collisions across them
 * (brief §13). Reads files via node fs, so it is testable with a temp workspace
 * and has no `vscode` dependency. Cancellation is checked between files; on
 * cancel the returned analysis covers only the files scanned so far and its
 * `cancelled` flag is set so callers never present a partial scan as complete.
 */
export async function analyzeWorkspace(
  rootDir: string,
  skillPaths: string[],
  profile: SkillProfile,
  exclude?: readonly string[],
  similarityThreshold?: number,
  collisionOptions?: CollisionOptions,
  options: WorkspaceAnalysisOptions = {},
): Promise<WorkspaceAnalysis> {
  const analyzed: WorkspaceSkill[] = [];
  const total = skillPaths.length;
  const yieldEvery = Math.max(1, options.yieldEverySkills ?? DEFAULT_YIELD_EVERY_SKILLS);
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
    // The loop used to be one synchronous, non-yielding block, so the host
    // could not process the Cancel click or paint the progress notification
    // until it had already returned: at 500 skills the bar sat at 0/500 for the
    // whole scan, Cancel did nothing, and `cancelled` was always false.
    if ((i + 1) % yieldEvery === 0) {
      await yieldToHost();
    }
  }

  const skills = analyzed.sort((a, b) => compareNames(a.name, b.name));
  const allCollisions = detectCollisions(
    skills.map((skill) => ({ name: skill.name, description: skill.description })),
    collisionOptions,
    options.dictionaries,
    options.cancel,
  );
  const cap = Math.max(0, options.maxReportedCollisions ?? DEFAULT_MAX_REPORTED_COLLISIONS);
  const collisions = allCollisions.length > cap ? allCollisions.slice(0, cap) : allCollisions;
  const suppressedCollisions = allCollisions.length - collisions.length;
  const named = skills.map((skill) => ({ name: skill.name, path: skill.path }));
  const nameConflicts = detectNameConflicts(named);
  const similarNames = detectSimilarNames(named, similarityThreshold, options.cancel);
  // Either cross-skill phase can be cancelled mid-scan; reflect that so a
  // partial comparison is never presented as complete.
  if (options.cancel?.isCancellationRequested) {
    cancelled = true;
  }

  return {
    skills,
    collisions,
    nameConflicts,
    similarNames,
    cancelled,
    ...(suppressedCollisions > 0 ? { suppressedCollisions } : {}),
  };
}

/** Builds the exportable index model (brief §13.6). */
export function buildSkillsIndex(analysis: WorkspaceAnalysis): SkillsIndex {
  return {
    schemaVersion: 8,
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
      security: skill.securityFindings ?? [],
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
    security: options.security,
    maxCountedFileSizeBytes: options.maxCountedFileSizeBytes,
    discover: options.discover,
    fileTokens: options.fileTokens,
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
  const securityFindings = diagnostics
    .filter((d) => d.kind === 'security')
    .map((d) => ({ code: d.code, severity: d.severity, message: d.message }));
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
    securityFindings,
    profile: profile.id,
    resourceGraph,
    tokenUsage,
    compatibility: projectCompatibility(
      document,
      enabledCapabilityTable(options.compatibilityAgents),
    ),
  };
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
