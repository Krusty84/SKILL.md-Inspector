import type { SkillDiagnosticRange } from './SkillDiagnostic';

export type SkillLinkKind = 'relative' | 'absoluteLocal' | 'remote';

export interface SkillLink {
  /** The target exactly as written in the Markdown, e.g. "./references/x.md". */
  raw: string;
  /** The visible link text. */
  text: string;
  kind: SkillLinkKind;
  range?: SkillDiagnosticRange;
}

export type SkillResourceCategory =
  | 'references'
  | 'scripts'
  | 'assets'
  | 'templates'
  | 'other';

export interface SkillResource {
  /** Path relative to the skill directory, POSIX-style, e.g. "scripts/run.js". */
  relativePath: string;
  absolutePath: string;
  category: SkillResourceCategory;
  sizeBytes: number;
  /** Whether a Markdown link in SKILL.md points at this file. */
  referenced: boolean;
}

export interface SkillParseError {
  code: string;
  message: string;
  range?: SkillDiagnosticRange;
}

export interface SkillFrontmatter {
  name?: string;
  description?: string;
  [key: string]: unknown;
}

export interface SkillDocument {
  uri: string;
  directory: string;
  fileName: 'SKILL.md';
  frontmatter: SkillFrontmatter | null;
  /** Range covering the raw YAML block (between the `---` fences), if present. */
  frontmatterRange?: SkillDiagnosticRange;
  /** Raw YAML text between the fences, used to locate individual keys. */
  frontmatterRaw: string;
  body: string;
  /** 0-based line where the Markdown body begins (line after the closing fence). */
  bodyStartLine: number;
  links: SkillLink[];
  resources: SkillResource[];
  parseErrors: SkillParseError[];
}
