import type { SkillDiagnostic } from '../../types/SkillDiagnostic';
import type { SkillDocument } from '../../types/SkillDocument';
import type { CompiledSecurityPatterns } from './patterns';
import { scanSecrets } from './scanText';
import { toSecurityDiagnostic } from './diagnostic';

/**
 * Scans string frontmatter values for hardcoded secrets. Findings attach to the
 * value's document range (or the key/block range as a fallback); sub-value
 * offsets are not mapped because the YAML-parsed value can differ from the raw
 * source text, and a value-level range is precise enough for a credential.
 */
export function scanFrontmatter(
  doc: SkillDocument,
  patterns: CompiledSecurityPatterns,
): SkillDiagnostic[] {
  if (!doc.frontmatter) {
    return [];
  }
  const out: SkillDiagnostic[] = [];
  for (const [key, value] of Object.entries(doc.frontmatter)) {
    if (typeof value !== 'string') {
      continue;
    }
    const matches = scanSecrets(value, patterns);
    if (matches.length === 0) {
      continue;
    }
    const range =
      doc.frontmatterValueRanges?.[key] ?? doc.frontmatterKeyRanges?.[key] ?? doc.frontmatterRange;
    for (const match of matches) {
      out.push(
        toSecurityDiagnostic(
          { code: match.code, severity: match.severity, message: match.message },
          range,
        ),
      );
    }
  }
  return out;
}
