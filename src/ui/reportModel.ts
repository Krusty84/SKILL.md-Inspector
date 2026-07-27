import type { SkillDocument } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillProfile } from '../types/SkillProfile';
import type { StaticDescriptionQualityResult } from '../types/StaticDescriptionQuality';
import type { AgentId, CompatibilityReport } from '../types/AgentCompatibility';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import { assessAuthoringQuality, type SkillAuthoringQuality } from '../authoring/authoringQuality';
import { assessDocumentDescriptionQuality } from '../quality/staticDescriptionQuality';
import { enabledCapabilityTable } from '../compat/agentCapabilities';
import { projectCompatibility } from '../compat/projectCompatibility';
import type { SkillTokenUsage } from '../types/SkillTokenUsage';

export interface SkillReport {
  name: string;
  descriptionLength: number;
  status: 'pass' | 'warning' | 'fail';
  errorCount: number;
  warningCount: number;
  informationCount: number;
  diagnostics: SkillDiagnostic[];
  referencedFiles: string[];
  unreferencedFiles: string[];
  staticDescriptionQuality: StaticDescriptionQualityResult;
  /** Separate structural authoring dimension; it is never averaged into description quality. */
  authoringQuality: SkillAuthoringQuality;
  tokenUsage: SkillTokenUsage;
  /** Per-agent compatibility projection from the verified capability table. */
  compatibility: CompatibilityReport;
}

/**
 * Builds the read-only report model (brief §7.10 + §10.1) from an analyzed
 * document. Pure and vscode-free so it can be unit-tested and rendered by any
 * surface.
 */
export function buildReportModel(
  doc: SkillDocument,
  diagnostics: SkillDiagnostic[],
  profile: SkillProfile,
  tokenUsage: SkillTokenUsage,
  dictionaries?: HeuristicDictionaries,
  compatibilityAgents?: readonly AgentId[],
): SkillReport {
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const informationCount = diagnostics.filter((d) => d.severity === 'information').length;

  const name = typeof doc.frontmatter?.name === 'string' ? doc.frontmatter.name : '(unnamed)';
  const description =
    typeof doc.frontmatter?.description === 'string' ? doc.frontmatter.description : '';

  const staticDescriptionQuality = assessDocumentDescriptionQuality(doc, {
    minLength: profile.description.minLength,
    maxLength: profile.description.maxLength,
    language: profile.description.language,
    weights: profile.description.weights,
    dictionaries,
  });

  return {
    name,
    descriptionLength: description.trim().length,
    status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
    errorCount,
    warningCount,
    informationCount,
    diagnostics: [...diagnostics],
    referencedFiles: doc.resources.filter((r) => r.referenced).map((r) => r.relativePath),
    unreferencedFiles: doc.resources.filter((r) => !r.referenced).map((r) => r.relativePath),
    staticDescriptionQuality,
    authoringQuality: assessAuthoringQuality(doc, dictionaries, tokenUsage.body.lines),
    compatibility: projectCompatibility(doc, enabledCapabilityTable(compatibilityAgents)),
    tokenUsage: {
      ...tokenUsage,
      references: {
        files: [...tokenUsage.references.files].sort(compareTokenPaths),
        totalTokens: tokenUsage.references.totalTokens,
      },
      otherFiles: {
        files: [...tokenUsage.otherFiles.files].sort(compareTokenPaths),
        totalTokens: tokenUsage.otherFiles.totalTokens,
      },
    },
  };
}

function compareTokenPaths(a: { relativePath: string }, b: { relativePath: string }): number {
  return a.relativePath < b.relativePath ? -1 : a.relativePath > b.relativePath ? 1 : 0;
}
