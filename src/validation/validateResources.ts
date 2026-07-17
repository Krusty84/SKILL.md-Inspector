import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { diag, bodyTopRange } from './util';

/**
 * Warns about resource files that exist in the skill package but are never
 * linked from SKILL.md (brief §7.6). Requires resources to have been attached
 * with their `referenced` flags set (see `withResources`).
 */
export function validateResources(doc: SkillDocument, directories: readonly string[] = ['references', 'scripts', 'assets', 'templates']): SkillDiagnostic[] {
  const normalized = directories.map(normalizeDirectory).filter((value): value is string => Boolean(value));
  const range = bodyTopRange(doc);
  return doc.resources
    .filter((resource) => !resource.referenced && normalized.some((dir) => resource.relativePath === dir || resource.relativePath.startsWith(`${dir}/`)))
    .map((resource) =>
      diag(
        DiagnosticCode.ResourceUnreferenced,
        'warning',
        `File exists in the skill package but is not referenced from SKILL.md: ${resource.relativePath}`,
        range,
        { quickFixId: QuickFixId.AddResourceLink, data: { relativePath: resource.relativePath } },
      ),
    );
}

export function normalizeResourceDirectory(value: string): string | undefined { return normalizeDirectory(value); }
function normalizeDirectory(value: string): string | undefined { const normalized = value.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+$/, ''); return normalized && !normalized.startsWith('/') && !/^[A-Za-z]:\//.test(normalized) && !normalized.split('/').includes('..') ? normalized : undefined; }
