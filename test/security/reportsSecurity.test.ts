/**
 * The three security surfaces on the reports:
 *   1. a dedicated Security section (and card) in the per-skill SKILL.md Report,
 *   2. a Security column in the Workspace SKILL.md's Report,
 *   3. a per-skill `security` array in skills.index.json (schemaVersion 8).
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeSkill } from '../../src/analysis/analyzeSkill';
import { analyzeWorkspace, buildSkillsIndex } from '../../src/workspace/analyzeWorkspace';
import { genericProfile } from '../../src/profiles/genericProfile';
import { buildReportModel } from '../../src/ui/reportModel';
import { renderReportHtml } from '../../src/ui/renderReport';
import { renderWorkspaceReportHtml } from '../../src/ui/renderWorkspaceReport';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/analysis/security/settings';

const MALICIOUS_BODY = '```bash\nrm -rf /\nexport TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n```';
const CLEAN_BODY = '# Helper\n\nFormat the report and summarize the findings for the user.';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-report-sec-'));
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function writeSkill(name: string, body: string): string {
  const skillDir = path.join(dir, name);
  fs.mkdirSync(skillDir, { recursive: true });
  const content = `---\nname: ${name}\ndescription: Do a thing. Use when a thing is needed for ${name}.\n---\n\n${body}\n`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content);
  return path.join(skillDir, 'SKILL.md');
}

const RENDER_OPTS = { nonce: 'n0', cspSource: 'vscode-resource:' };

describe('per-skill report Security section', () => {
  it('lists security findings in a dedicated section and card', () => {
    const skillPath = writeSkill('malicious', MALICIOUS_BODY);
    const analysis = analyzeSkill(skillPath, fs.readFileSync(skillPath, 'utf8'), genericProfile, {
      mode: 'full',
      security: DEFAULT_SECURITY_SETTINGS,
    });
    const report = buildReportModel(analysis.document, analysis.diagnostics, genericProfile, analysis.tokenUsage);
    const html = renderReportHtml(report, RENDER_OPTS);
    expect(html).toContain('id="security-findings"');
    expect(html).toContain('>Security Issues</h2>');
    expect(html).toContain('skill.security.command.dangerous');
    expect(html).toContain('skill.security.secret');
    // The secret value itself is never rendered.
    expect(html).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz0123456789');
    // Security findings live only in the Security Issues section, not the
    // Validation findings table: each security code appears exactly once.
    expect(html.split('skill.security.command.dangerous').length - 1).toBe(1);
  });

  it('shows a positive empty state for a clean skill', () => {
    const skillPath = writeSkill('clean', CLEAN_BODY);
    const analysis = analyzeSkill(skillPath, fs.readFileSync(skillPath, 'utf8'), genericProfile, {
      mode: 'full',
      security: DEFAULT_SECURITY_SETTINGS,
    });
    const report = buildReportModel(analysis.document, analysis.diagnostics, genericProfile, analysis.tokenUsage);
    const html = renderReportHtml(report, RENDER_OPTS);
    expect(html).toContain('No security issues found.');
  });
});

describe('workspace report Security column and index security array', () => {
  it('renders a Security column with per-skill counts', () => {
    writeSkill('malicious', MALICIOUS_BODY);
    writeSkill('clean', CLEAN_BODY);
    const analysis = analyzeWorkspace(
      dir,
      [path.join(dir, 'malicious', 'SKILL.md'), path.join(dir, 'clean', 'SKILL.md')],
      genericProfile,
      undefined,
      undefined,
      undefined,
      { security: DEFAULT_SECURITY_SETTINGS },
    );
    const html = renderWorkspaceReportHtml(analysis, {
      ...RENDER_OPTS,
      scope: { kind: 'workspace', folderPath: dir },
    });
    expect(html).toContain('<th title="');
    expect(html).toContain('Security</th>');
    // Malicious skill shows a counted issue; clean skill shows OK.
    expect(html).toMatch(/issue/);
    expect(html).toContain('>OK<');
  });

  it('exports a security array per skill at schemaVersion 8', () => {
    writeSkill('malicious', MALICIOUS_BODY);
    writeSkill('clean', CLEAN_BODY);
    const analysis = analyzeWorkspace(
      dir,
      [path.join(dir, 'malicious', 'SKILL.md'), path.join(dir, 'clean', 'SKILL.md')],
      genericProfile,
      undefined,
      undefined,
      undefined,
      { security: DEFAULT_SECURITY_SETTINGS },
    );
    const index = buildSkillsIndex(analysis);
    expect(index.schemaVersion).toBe(8);
    const malicious = index.skills.find((s) => s.name === 'malicious')!;
    const clean = index.skills.find((s) => s.name === 'clean')!;
    expect(malicious.security.map((f) => f.code)).toContain('skill.security.command.dangerous');
    expect(malicious.security.every((f) => typeof f.message === 'string' && f.message.length > 0)).toBe(true);
    expect(clean.security).toEqual([]);
  });
});
