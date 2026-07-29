import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import catalog from '../../src/validation/security/defaultSecurityCatalog.json';
import { validateSecurity } from '../../src/validation/security';
import { DEFAULT_SECURITY_SETTINGS } from '../../src/validation/security/settings';
import { parseSkillFile } from '../../src/parser/parseSkillFile';
import { DiagnosticCode } from '../../src/types/DiagnosticCode';

interface CatalogEntry {
  id: string;
  source: string;
  message?: string;
  label?: string;
}

const commandAndTextEntries: CatalogEntry[] = [
  ...catalog.dangerousCommands,
  ...catalog.riskyCommands,
  ...catalog.injectionPhrases,
  ...catalog.sensitivePaths,
];
const secretEntries: CatalogEntry[] = catalog.secretSignatures;
const allEntries = [...commandAndTextEntries, ...secretEntries];

describe('default security catalog integrity', () => {
  it('uses unique, documented IDs with compilable regular expressions', () => {
    expect(new Set(allEntries.map((entry) => entry.id)).size).toBe(allEntries.length);
    for (const entry of commandAndTextEntries) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.message?.length).toBeGreaterThan(0);
      expect(() => new RegExp(entry.source, 'gi')).not.toThrow();
    }
    for (const entry of secretEntries) {
      expect(entry.id.length).toBeGreaterThan(0);
      expect(entry.label?.length).toBeGreaterThan(0);
      expect(() => new RegExp(entry.source, 'g')).not.toThrow();
    }
  });

  it('keeps service hosts unique and compiles singleton patterns', () => {
    expect(new Set(catalog.serviceHosts).size).toBe(catalog.serviceHosts.length);
    expect(() => new RegExp(catalog.secretAssignment.source, 'gi')).not.toThrow();
    expect(() => new RegExp(catalog.credentialedUrl.source, 'gi')).not.toThrow();
    expect(() => new RegExp(catalog.secretPlaceholder.source, 'i')).not.toThrow();
    expect(() => new RegExp(catalog.hiddenUnicode.source, 'gu')).not.toThrow();
    expect(() => new RegExp(catalog.hiddenImperative.source, 'i')).not.toThrow();
  });
});

describe('security catalog demo-skill calibration', () => {
  const fixturesDir = path.resolve('demo_skills/skills');
  const explicitSecurityFixtures = new Set(['Docker-Deploy-Helper', 'malicious-exfil']);

  it('adds no security findings to fixtures that do not intentionally exercise security', () => {
    for (const fixtureName of fs.readdirSync(fixturesDir)) {
      if (explicitSecurityFixtures.has(fixtureName)) {
        continue;
      }
      const skillPath = path.join(fixturesDir, fixtureName, 'SKILL.md');
      if (!fs.existsSync(skillPath)) {
        continue;
      }
      const doc = parseSkillFile(skillPath, fs.readFileSync(skillPath, 'utf8'));
      const findings = validateSecurity({
        doc,
        settings: DEFAULT_SECURITY_SETTINGS,
        skipFilesystem: true,
      });
      expect(findings, fixtureName).toEqual([]);
    }
  });

  it('retains the malicious fixture coverage', () => {
    const skillPath = path.join(fixturesDir, 'malicious-exfil', 'SKILL.md');
    const doc = parseSkillFile(skillPath, fs.readFileSync(skillPath, 'utf8'));
    const codes = validateSecurity({
      doc,
      settings: DEFAULT_SECURITY_SETTINGS,
      skipFilesystem: true,
    }).map((finding) => finding.code);
    expect(codes).toEqual(
      expect.arrayContaining([
        DiagnosticCode.SecurityCommandDangerous,
        DiagnosticCode.SecuritySecret,
        DiagnosticCode.SecurityServiceRisky,
        DiagnosticCode.SecuritySensitivePath,
        DiagnosticCode.SecurityHiddenContent,
      ]),
    );
  });
});
