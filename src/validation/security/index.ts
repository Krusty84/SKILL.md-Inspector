import type { SkillDiagnostic } from '../../types/SkillDiagnostic';
import type { SkillDocument } from '../../types/SkillDocument';
import type { SecuritySettings } from './settings';
import { resolveSecurityPatterns } from './patterns';
import { scanBody } from './scanBody';
import { scanFrontmatter } from './scanFrontmatter';
import { scanResources } from './scanResources';

export { DEFAULT_SECURITY_SETTINGS, type SecuritySettings } from './settings';

/** Everything the security scanner needs, decoupled from `ValidationContext`. */
export interface SecurityScanInput {
  doc: SkillDocument;
  settings: SecuritySettings;
  /** Skip filesystem-dependent checks (resource-file scanning). */
  skipFilesystem?: boolean;
}

/**
 * Static, offline, deterministic security assessment of one SKILL.md: dangerous
 * and risky commands, risky public services, hardcoded secrets, prompt
 * injection, hidden content, and sensitive-path references — in the file and
 * (in full mode) its bundled resource files. Executes nothing.
 */
export function validateSecurity(input: SecurityScanInput): SkillDiagnostic[] {
  const { doc, settings, skipFilesystem } = input;
  if (!settings.enabled) {
    return [];
  }
  const patterns = resolveSecurityPatterns(settings);
  const diagnostics = [...scanBody(doc, patterns, settings), ...scanFrontmatter(doc, patterns)];
  if (!skipFilesystem && settings.scanResourceFiles) {
    diagnostics.push(...scanResources(doc, patterns, settings));
  }
  return diagnostics;
}
