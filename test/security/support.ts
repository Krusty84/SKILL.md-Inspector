import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { validateSecurity } from '../../src/validation/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/validation/security/settings';
import type { SecuritySettings } from '../../src/validation/security/settings';
import type { SkillDiagnostic } from '../../src/types/SkillDiagnostic';
import type { SkillDocument } from '../../src/types/SkillDocument';

const DEFAULT_FRONTMATTER = 'name: demo\ndescription: Do a thing. Use when a thing is needed.';

/** Parses a SKILL.md from a body (and optional frontmatter) without touching disk. */
export function docFrom(body: string, frontmatter: string = DEFAULT_FRONTMATTER): SkillDocument {
  const content = `---\n${frontmatter}\n---\n\n${body}\n`;
  return parseSkillFile('/skills/demo/SKILL.md', content);
}

/** Runs the security scanner over a body, filesystem access disabled. */
export function scan(body: string, overrides: Partial<SecuritySettings> = {}): SkillDiagnostic[] {
  return validateSecurity({
    doc: docFrom(body),
    settings: { ...DEFAULT_SECURITY_SETTINGS, ...overrides },
    skipFilesystem: true,
  });
}

/** Runs the security scanner over a frontmatter block. */
export function scanFrontmatter(frontmatter: string): SkillDiagnostic[] {
  return validateSecurity({
    doc: docFrom('Body text.', frontmatter),
    settings: DEFAULT_SECURITY_SETTINGS,
    skipFilesystem: true,
  });
}

export function codesOf(diagnostics: SkillDiagnostic[]): string[] {
  return diagnostics.map((d) => d.code);
}

/** Wraps a command line in a fenced code block (the scanned context for commands). */
export function fenced(command: string, lang = 'bash'): string {
  return `\`\`\`${lang}\n${command}\n\`\`\``;
}
