import type { SkillDocument } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import { analyzeDescription } from '../quality/descriptionHeuristics';

export interface QualityNote {
  ok: boolean;
  label: string;
  detail?: string;
}

export interface SkillReport {
  name: string;
  descriptionLength: number;
  profileLabel: string;
  status: 'pass' | 'fail';
  errorCount: number;
  warningCount: number;
  informationCount: number;
  referencedFiles: string[];
  unreferencedFiles: string[];
  qualityNotes: QualityNote[];
}

/**
 * Builds the read-only report model (brief §7.10) from an analyzed document.
 * Pure and vscode-free so it can be unit-tested and rendered by any surface.
 */
export function buildReportModel(
  doc: SkillDocument,
  diagnostics: SkillDiagnostic[],
  profileLabel: string,
): SkillReport {
  const errorCount = diagnostics.filter((d) => d.severity === 'error').length;
  const warningCount = diagnostics.filter((d) => d.severity === 'warning').length;
  const informationCount = diagnostics.filter((d) => d.severity === 'information').length;

  const name = typeof doc.frontmatter?.name === 'string' ? doc.frontmatter.name : '(unnamed)';
  const description =
    typeof doc.frontmatter?.description === 'string' ? doc.frontmatter.description : '';
  const analysis = analyzeDescription(description);

  const qualityNotes: QualityNote[] = [
    { ok: analysis.actionVerb.found, label: 'Action verb', detail: analysis.actionVerb.matched },
    {
      ok: analysis.triggerPhrase.found,
      label: 'Usage trigger phrase',
      detail: analysis.triggerPhrase.matched,
    },
    { ok: analysis.concreteArtifact, label: 'Concrete artifact / domain' },
    { ok: analysis.boundaryPhrase.found, label: 'Boundary ("do not use when")' },
    {
      ok: analysis.vagueTerms.length === 0,
      label: 'Free of vague wording',
      detail: analysis.vagueTerms.join(', ') || undefined,
    },
    { ok: analysis.length >= 40, label: 'Sufficient length', detail: `${analysis.length} chars` },
  ];

  return {
    name,
    descriptionLength: analysis.length,
    profileLabel,
    status: errorCount > 0 ? 'fail' : 'pass',
    errorCount,
    warningCount,
    informationCount,
    referencedFiles: doc.resources.filter((r) => r.referenced).map((r) => r.relativePath),
    unreferencedFiles: doc.resources.filter((r) => !r.referenced).map((r) => r.relativePath),
    qualityNotes,
  };
}
