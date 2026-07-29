import { KIND_BY_CODE } from '../../types/DiagnosticCode';
import {
  DIAGNOSTIC_SOURCE,
  type SkillDiagnostic,
  type SkillDiagnosticRange,
} from '../../types/SkillDiagnostic';
import type { RawMatch } from './scanText';

/**
 * Builds a normalized diagnostic for a security finding. Mirrors
 * `validation/util.diag`, but lives in `analysis/` with type-only imports so the
 * security module never depends on the `validation/` layer (which depends on
 * `analysis/`), keeping the dependency direction one-way.
 */
export function toSecurityDiagnostic(
  match: Pick<RawMatch, 'code' | 'severity' | 'message'>,
  range?: SkillDiagnosticRange,
  data?: Record<string, unknown>,
): SkillDiagnostic {
  return {
    code: match.code,
    severity: match.severity,
    kind: KIND_BY_CODE[match.code] ?? 'security',
    message: match.message,
    range,
    source: DIAGNOSTIC_SOURCE,
    ...(data ? { data } : {}),
  };
}
