import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { computeTriggerQuality } from '../quality/triggerQualityScore';
import { buildResourceGraph } from './buildResourceGraph';
import { evaluatePortability, toCompatibilityMap } from './portability';
import { detectCollisions } from './detectSkillCollisions';
import type { SkillProfile } from '../types/SkillProfile';
import type { WorkspaceAnalysis, WorkspaceSkill, SkillsIndex } from '../types/Workspace';

/**
 * Analyzes every discovered skill and detects collisions across them
 * (brief §13). Reads files via node fs, so it is testable with a temp workspace
 * and has no `vscode` dependency.
 */
export function analyzeWorkspace(
  rootDir: string,
  skillPaths: string[],
  profile: SkillProfile,
): WorkspaceAnalysis {
  const skills = skillPaths
    .map((skillPath) => toWorkspaceSkill(rootDir, skillPath, profile))
    .filter((skill): skill is WorkspaceSkill => skill !== undefined)
    .sort((a, b) => a.name.localeCompare(b.name));

  const collisions = detectCollisions(
    skills.map((skill) => ({ name: skill.name, description: skill.description })),
  );

  return { skills, collisions };
}

/** Builds the exportable index model (brief §13.6). */
export function buildSkillsIndex(analysis: WorkspaceAnalysis): SkillsIndex {
  return {
    generatedAt: new Date().toISOString(),
    skills: analysis.skills.map((skill) => ({
      name: skill.name,
      path: skill.path,
      description: skill.description,
      triggerQualityScore: skill.triggerQualityScore,
      errors: skill.errors,
      warnings: skill.warnings,
      profileCompatibility: skill.profileCompatibility,
    })),
  };
}

function toWorkspaceSkill(
  rootDir: string,
  absolutePath: string,
  profile: SkillProfile,
): WorkspaceSkill | undefined {
  let content: string;
  try {
    content = fs.readFileSync(absolutePath, 'utf8');
  } catch {
    return undefined;
  }

  const { document, diagnostics } = analyzeSkill(absolutePath, content, profile);
  const name =
    typeof document.frontmatter?.name === 'string' && document.frontmatter.name
      ? document.frontmatter.name
      : path.basename(path.dirname(absolutePath));
  const description =
    typeof document.frontmatter?.description === 'string' ? document.frontmatter.description : '';

  const triggerQuality = computeTriggerQuality(description, {
    minLength: profile.description.minLength,
    maxLength: profile.description.maxLength,
  });
  const errors = diagnostics.filter((d) => d.severity === 'error').length;
  const warnings = diagnostics.filter((d) => d.severity === 'warning').length;
  const information = diagnostics.filter((d) => d.severity === 'information').length;
  const resourceGraph = buildResourceGraph(document);

  const portability = evaluatePortability({
    errorCount: errors,
    descriptionLength: description.trim().length,
    nameLength: name.length,
    hasRemoteLinks: document.links.some((link) => link.kind === 'remote'),
    hasScripts: resourceGraph.nodes.some((node) => node.flags.includes('script')),
  });

  return {
    name,
    path: toPosix(path.relative(rootDir, absolutePath)),
    absolutePath,
    description,
    triggerQualityScore: triggerQuality.score,
    triggerQualityLabel: triggerQuality.label,
    errors,
    warnings,
    information,
    profile: profile.id,
    profileCompatibility: toCompatibilityMap(portability),
    portability,
    resourceGraph,
  };
}

function toPosix(value: string): string {
  return value.split(path.sep).join('/');
}
