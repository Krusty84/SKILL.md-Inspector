import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSkillFile, withResources } from '../src/parser/parseSkillFile';
import { discoverResources } from '../src/parser/discoverResources';
import { validateLinks } from '../src/validation/validateLinks';
import { validateResources } from '../src/validation/validateResources';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-inspector-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function write(relativePath: string, content = 'x'): void {
  const full = path.join(dir, relativePath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

function skill(body: string) {
  const content = `---\nname: demo\ndescription: Format reports. Use when needed.\n---\n\n${body}\n`;
  return parseSkillFile(path.join(dir, 'SKILL.md'), content);
}

describe('validateLinks', () => {
  it('errors on a relative link to a missing file', () => {
    const codes = validateLinks(skill('See [g](./references/missing.md).')).map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.LinkMissing);
  });

  it('accepts a relative link to an existing file', () => {
    write('references/exists.md');
    const codes = validateLinks(skill('See [g](./references/exists.md).')).map((d) => d.code);
    expect(codes).not.toContain(DiagnosticCode.LinkMissing);
  });

  it('warns on an absolute local path', () => {
    const codes = validateLinks(skill('See [g](/etc/hosts).')).map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.LinkAbsolute);
  });

  it('reports a plain remote URL as information', () => {
    const [diagnostic] = validateLinks(skill('See [g](https://example.com/doc).'));
    expect(diagnostic.severity).toBe('information');
  });

  it('warns on a suspicious (insecure) remote URL', () => {
    const [diagnostic] = validateLinks(skill('See [g](http://example.com/run.exe).'));
    expect(diagnostic.severity).toBe('warning');
    expect(diagnostic.code).toBe(DiagnosticCode.LinkRemoteSuspicious);
  });
});

describe('discoverResources + validateResources', () => {
  it('warns about a resource that is never referenced', () => {
    write('references/style-guide.md');
    const doc = withResources(skill('# Body with no links'), discoverResources(dir));
    const codes = validateResources(doc).map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.ResourceUnreferenced);
  });

  it('does not warn about a referenced resource', () => {
    write('scripts/run.js');
    const doc = withResources(
      skill('Run [it](./scripts/run.js).'),
      discoverResources(dir),
    );
    expect(validateResources(doc)).toHaveLength(0);
  });
});
