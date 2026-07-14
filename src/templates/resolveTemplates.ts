import { builtInTemplates } from './builtInTemplates';
import { normalizeTemplates } from './normalizeTemplates';
import type { ResolveTemplatesResult } from './types';

export function resolveTemplates(configuredTemplates: unknown): ResolveTemplatesResult {
  if (!Array.isArray(configuredTemplates) || configuredTemplates.length === 0) {
    return { templates: builtInTemplates, issues: [], source: 'builtIn' };
  }
  const normalized = normalizeTemplates(configuredTemplates);
  if (normalized.templates.length === 0) {
    return { templates: builtInTemplates, issues: normalized.issues, source: 'fallback' };
  }
  return { templates: normalized.templates, issues: normalized.issues, source: 'custom' };
}
