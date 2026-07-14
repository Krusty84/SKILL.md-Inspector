export interface SkillTemplateDefinition {
  id: string;
  label: string;
  description?: string;
  frontmatter: string[];
  body: string[];
}

export interface TemplateRenderContext {
  name: string;
  title: string;
}

export interface TemplateIssue {
  index: number;
  message: string;
}

export interface NormalizeTemplatesResult {
  templates: SkillTemplateDefinition[];
  issues: TemplateIssue[];
}

export interface ResolveTemplatesResult {
  templates: SkillTemplateDefinition[];
  issues: TemplateIssue[];
  source: 'builtIn' | 'custom' | 'fallback';
}
