import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSkillFile, withResources } from '../../src/parser/parseSkillFile';
import { discoverResources } from '../../src/parser/discoverResources';
import { validateSecurity } from '../../src/analysis/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/analysis/security/settings';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-security-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(relativePath: string, content: string): void {
  const full = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function scanSkill(body: string, skipFilesystem = false) {
  const content = `---\nname: demo\ndescription: Do a thing. Use when a thing is needed.\n---\n\n${body}\n`;
  const parsed = parseSkillFile(path.join(dir, 'SKILL.md'), content);
  const doc = withResources(parsed, discoverResources(parsed.directory));
  return validateSecurity({ doc, settings: DEFAULT_SECURITY_SETTINGS, skipFilesystem });
}

describe('security resource-file scanning', () => {
  it('flags a dangerous command inside a bundled script', () => {
    write('scripts/deploy.sh', '#!/bin/sh\necho start\nrm -rf /\n');
    const diagnostics = scanSkill('Run [deploy](./scripts/deploy.sh) to ship.');
    const finding = diagnostics.find((d) => d.code === DiagnosticCode.SecurityCommandDangerous);
    expect(finding).toBeDefined();
    expect(finding?.message).toContain('scripts/deploy.sh');
    expect(finding?.message).toContain('line 3');
  });

  it('flags a hardcoded secret inside a bundled script', () => {
    write('scripts/env.sh', 'export TOKEN=ghp_abcdefghijklmnopqrstuvwxyz0123456789\n');
    const codes = scanSkill('See scripts/env.sh.').map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.SecuritySecret);
  });

  it('attaches the finding to the referencing link range when the resource is linked', () => {
    write('scripts/deploy.sh', 'rm -rf /\n');
    const diagnostics = scanSkill('Run [deploy](./scripts/deploy.sh) now.');
    const finding = diagnostics.find((d) => d.code === DiagnosticCode.SecurityCommandDangerous);
    // The link sits on the first body line, not the top-of-body fallback.
    expect(finding?.range).toBeDefined();
  });

  it('does not scan resource files in text-only (skipFilesystem) mode', () => {
    write('scripts/deploy.sh', 'rm -rf /\n');
    const codes = scanSkill('Run scripts/deploy.sh.', true).map((d) => d.code);
    expect(codes).not.toContain(DiagnosticCode.SecurityCommandDangerous);
  });

  it('skips files over the size cap', () => {
    write('scripts/big.sh', `rm -rf /\n${'#'.repeat(2000)}`);
    const content = `---\nname: demo\ndescription: Do a thing. Use when needed.\n---\n\nSee scripts/big.sh.\n`;
    const parsed = parseSkillFile(path.join(dir, 'SKILL.md'), content);
    const doc = withResources(parsed, discoverResources(parsed.directory));
    const diagnostics = validateSecurity({
      doc,
      settings: { ...DEFAULT_SECURITY_SETTINGS, maxScannedFileSizeBytes: 100 },
      skipFilesystem: false,
    });
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.SecurityCommandDangerous);
  });

  it('does not scan when scanResourceFiles is off', () => {
    write('scripts/deploy.sh', 'rm -rf /\n');
    const content = `---\nname: demo\ndescription: Do a thing. Use when needed.\n---\n\nSee scripts/deploy.sh.\n`;
    const parsed = parseSkillFile(path.join(dir, 'SKILL.md'), content);
    const doc = withResources(parsed, discoverResources(parsed.directory));
    const diagnostics = validateSecurity({
      doc,
      settings: { ...DEFAULT_SECURITY_SETTINGS, scanResourceFiles: false },
      skipFilesystem: false,
    });
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.SecurityCommandDangerous);
  });
});
