import type { SkillDocument } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillProfile } from '../types/SkillProfile';
import type { StaticDescriptionQualityResult } from '../types/StaticDescriptionQuality';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import { assessAuthoringQuality, type SkillAuthoringQuality } from '../authoring/authoringQuality';
import { assessDocumentDescriptionQuality } from '../quality/staticDescriptionQuality';

export interface SkillReport {
  name: string;
  descriptionLength: number;
  profileLabel: string;
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
  dictionaries?: HeuristicDictionaries,
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
    profileLabel: profile.label,
    status: errorCount > 0 ? 'fail' : warningCount > 0 ? 'warning' : 'pass',
    errorCount,
    warningCount,
    informationCount,
    diagnostics: [...diagnostics],
    referencedFiles: doc.resources.filter((r) => r.referenced).map((r) => r.relativePath),
    unreferencedFiles: doc.resources.filter((r) => !r.referenced).map((r) => r.relativePath),
    staticDescriptionQuality,
    authoringQuality: assessAuthoringQuality(doc),
  };
}
