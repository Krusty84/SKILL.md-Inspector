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

/**
 * Catastrophic backtracking in one catalog entry stalls the whole extension
 * host, because every scan runs the entire catalog over the whole content of
 * every bundled resource. These inputs are the shapes that trigger it: a long
 * single line of characters the command patterns treat as a fresh starting
 * position. Deterministic and offline; no fuzzing.
 */
describe('security catalog pattern budget', () => {
  const ADVERSARIAL = [
    'a.'.repeat(16000),
    'a-'.repeat(16000),
    'curl '.repeat(6400),
    'nc -e /bin/sh '.repeat(2300),
    'dd if=/dev/x '.repeat(2400),
    'rm -rf a '.repeat(3500),
    'git clean -fdx '.repeat(2100),
    // Plan 12 widened the rm/curl sources to accept quoted roots, a
    // backslash-newline continuation and `&&`/`;` chaining. Each of those adds
    // an alternation the input below is built to make ambiguous.
    'curl \\\n'.repeat(4000),
    'curl x && '.repeat(3200),
    `rm -rf ${' '.repeat(32000)}`,
    `rm -rf ${'\t'.repeat(32000)}`,
    `rm -rf ${'"'.repeat(32000)}`,
    '\\'.repeat(32000),
  ];
  const BUDGET_MS = 25;

  const singletons: CatalogEntry[] = [
    { id: 'secretAssignment', source: catalog.secretAssignment.source },
    { id: 'credentialedUrl', source: catalog.credentialedUrl.source },
  ];

  it.each([...allEntries, ...singletons].map((entry) => [entry.id, entry.source]))(
    '%s completes within budget on adversarial input',
    (id, source) => {
      const re = new RegExp(source, 'gi');
      for (const input of ADVERSARIAL) {
        re.lastIndex = 0;
        const started = performance.now();
        re.test(input);
        const elapsed = performance.now() - started;
        expect(elapsed, `${id} took ${elapsed.toFixed(0)}ms on a ${input.length}-char line`).toBeLessThan(
          BUDGET_MS,
        );
      }
    },
  );
});

describe('security catalog demo-skill calibration', () => {
  const fixturesDir = path.resolve('demo_skills/skills');
  // `Docker-Deploy-Helper` was exempted for one prose sentence — "If any step
  // fails, try running it again with sudo." — which the bare-word `sudo` rule
  // read as a command. It is a quality fixture, not a security one, so it
  // belongs in the calibration set.
  const explicitSecurityFixtures = new Set(['malicious-exfil']);

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
