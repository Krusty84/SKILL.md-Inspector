import type { NormalizeTemplatesResult, SkillTemplateDefinition, TemplateIssue } from './types';

export function normalizeTemplates(value: unknown): NormalizeTemplatesResult {
  const issues: TemplateIssue[] = [];
  const templates: SkillTemplateDefinition[] = [];
  const seen = new Set<string>();

  if (!Array.isArray(value)) {
    return { templates, issues: [{ index: -1, message: 'Template setting must be an array.' }] };
  }

  value.forEach((entry, index) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      issues.push({ index, message: 'Template entry must be an object.' });
      return;
    }
    const candidate = entry as Record<string, unknown>;
    const id = typeof candidate.id === 'string' ? candidate.id.trim() : '';
    const label = typeof candidate.label === 'string' ? candidate.label.trim() : '';
    if (!id) { issues.push({ index, message: 'Template id must be a non-empty string.' }); return; }
    if (!label) { issues.push({ index, message: 'Template label must be a non-empty string.' }); return; }
    if (!Array.isArray(candidate.frontmatter) || candidate.frontmatter.length === 0) { issues.push({ index, message: 'Template frontmatter must be a non-empty array.' }); return; }
    if (!candidate.frontmatter.every((line) => typeof line === 'string')) { issues.push({ index, message: 'Template frontmatter must contain only strings.' }); return; }
    if (!Array.isArray(candidate.body)) { issues.push({ index, message: 'Template body must be an array.' }); return; }
    if (!candidate.body.every((line) => typeof line === 'string')) { issues.push({ index, message: 'Template body must contain only strings.' }); return; }
    if (seen.has(id)) { issues.push({ index, message: `Duplicate template id "${id}" ignored.` }); return; }
    seen.add(id);
    templates.push({ id, label, description: typeof candidate.description === 'string' ? candidate.description : undefined, frontmatter: [...candidate.frontmatter], body: [...candidate.body] });
  });

  return { templates, issues };
}
