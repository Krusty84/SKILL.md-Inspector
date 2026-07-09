import { parseSkillFile, withResources } from '../parser/parseSkillFile';
import { discoverResources } from '../parser/discoverResources';
import { runAllValidations } from '../validation';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillProfile } from '../types/SkillProfile';

export interface SkillAnalysis {
  document: SkillDocument;
  diagnostics: SkillDiagnostic[];
}

/**
 * Full deterministic analysis for one SKILL.md: parse -> attach resources ->
 * run every rule. Filesystem access is limited to resource discovery, so this
 * is easy to drive from tests with a temp directory. No `vscode` dependency.
 */
export function analyzeSkill(
  filePath: string,
  content: string,
  profile: SkillProfile,
): SkillAnalysis {
  const parsed = parseSkillFile(filePath, content);
  const document = withResources(parsed, discoverResources(parsed.directory));
  const diagnostics = runAllValidations(document, profile);
  return { document, diagnostics };
}
