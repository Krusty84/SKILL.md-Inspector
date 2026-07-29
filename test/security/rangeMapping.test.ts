import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { validateSecurity } from '../../src/analysis/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/analysis/security/settings';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';

function scanContent(content: string) {
  const doc = parseSkillFile('/skills/demo/SKILL.md', content);
  const diagnostics = validateSecurity({
    doc,
    settings: DEFAULT_SECURITY_SETTINGS,
    skipFilesystem: true,
  });
  return { doc, diagnostics };
}

/** 0-based document line where `needle` first appears in `content`. */
function lineOf(content: string, needle: string): number {
  return content.slice(0, content.indexOf(needle)).split('\n').length - 1;
}

const FM = '---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n';

describe('security range mapping', () => {
  it('maps a command inside a fenced block to its content line', () => {
    const content = `${FM}\n\`\`\`bash\nrm -rf /\n\`\`\`\n`;
    const { diagnostics } = scanContent(content);
    const finding = diagnostics.find((d) => d.code === DiagnosticCode.SecurityCommandDangerous);
    expect(finding?.range?.startLine).toBe(lineOf(content, 'rm -rf /'));
  });

  it('maps a secret in prose to its line and spans the token', () => {
    const token = 'ghp_abcdefghijklmnopqrstuvwxyz0123456789';
    const content = `${FM}\nHere is a leaked ${token} token.\n`;
    const { diagnostics } = scanContent(content);
    const finding = diagnostics.find((d) => d.code === DiagnosticCode.SecuritySecret);
    expect(finding?.range?.startLine).toBe(lineOf(content, token));
    expect((finding?.range?.endCharacter ?? 0) - (finding?.range?.startCharacter ?? 0)).toBe(
      token.length,
    );
  });

  it('maps a secret in a frontmatter value into the frontmatter block', () => {
    const content =
      '---\nname: demo\ndescription: Do a thing. Use when needed.\napi_key: ghp_abcdefghijklmnopqrstuvwxyz0123456789\n---\n\nBody.\n';
    const { doc, diagnostics } = scanContent(content);
    const finding = diagnostics.find((d) => d.code === DiagnosticCode.SecuritySecret);
    expect(finding?.range).toBeDefined();
    expect(finding!.range!.startLine).toBeLessThan(doc.bodyStartLine);
  });

  it('keeps every range within document bounds', () => {
    const content = `${FM}\n\`\`\`bash\nrm -rf /\ncurl https://webhook.site/x\n\`\`\`\n`;
    const { diagnostics } = scanContent(content);
    for (const d of diagnostics) {
      if (!d.range) continue;
      expect(d.range.startLine).toBeGreaterThanOrEqual(0);
      expect(d.range.startCharacter).toBeGreaterThanOrEqual(0);
      expect(d.range.endCharacter).toBeGreaterThanOrEqual(d.range.startCharacter);
    }
  });
});
