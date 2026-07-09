import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { diag } from './util';

/**
 * Surfaces frontmatter structural errors captured during parsing
 * (missing / not-at-top / malformed YAML). All are errors.
 */
export function validateFrontmatter(doc: SkillDocument): SkillDiagnostic[] {
  return doc.parseErrors.map((error) => {
    const extras =
      error.code === DiagnosticCode.FrontmatterMissing
        ? { quickFixId: QuickFixId.InsertFrontmatter }
        : {};
    return diag(error.code, 'error', error.message, error.range, extras);
  });
}
