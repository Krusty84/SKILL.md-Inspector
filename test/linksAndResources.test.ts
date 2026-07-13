import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSkillFile, withResources } from '../src/parser/parseSkillFile';
import { discoverResources } from '../src/parser/discoverResources';
import { validateLinks } from '../src/validation/validateLinks';
import { validateResources } from '../src/validation/validateResources';
import { DiagnosticCode, QuickFixId } from '../src/types/DiagnosticCode';

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

  it('flags a relative link that escapes the skill package and offers no create-file fix', () => {
    const diagnostics = validateLinks(skill('See [x](../../secret.md).'));
    const codes = diagnostics.map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.LinkEscapesSkillRoot);
    expect(codes).not.toContain(DiagnosticCode.LinkMissing);
    expect(diagnostics.some((d) => d.quickFixId === QuickFixId.CreateMissingLinkedFile)).toBe(
      false,
    );
    expect(diagnostics.find((d) => d.code === DiagnosticCode.LinkEscapesSkillRoot)?.severity).toBe(
      'error',
    );
  });

  it('flags directory traversal via resource links with no create-file fix (Task 74)', () => {
    const diagnostics = validateLinks(skill('See [env](../../.env) and [f](../outside/file.md).'));
    const escapes = diagnostics.filter((d) => d.code === DiagnosticCode.LinkEscapesSkillRoot);
    expect(escapes).toHaveLength(2);
    // The security diagnostic is not replaced by a missing-file diagnostic...
    expect(diagnostics.map((d) => d.code)).not.toContain(DiagnosticCode.LinkMissing);
    // ...and no file-creation quick fix is offered for an escaping path.
    expect(diagnostics.some((d) => d.quickFixId === QuickFixId.CreateMissingLinkedFile)).toBe(
      false,
    );
    for (const escape of escapes) {
      expect(escape.severity).toBe('error');
    }
  });

  it('accepts a symlink whose target is inside the package', () => {
    write('references/real.md');
    try {
      fs.symlinkSync(
        path.join(dir, 'references', 'real.md'),
        path.join(dir, 'references', 'alias.md'),
      );
    } catch {
      return; // symlink creation unavailable (e.g. Windows without privilege) — skip
    }
    const codes = validateLinks(skill('See [x](./references/alias.md).')).map((d) => d.code);
    expect(codes).not.toContain(DiagnosticCode.LinkEscapesSkillRoot);
  });

  it('warns when a link target is a symlink escaping the package', () => {
    const outside = path.join(dir, '..', `outside-${path.basename(dir)}.md`);
    fs.writeFileSync(outside, '# outside');
    try {
      fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
      fs.symlinkSync(outside, path.join(dir, 'references', 'link.md'));
    } catch {
      fs.rmSync(outside, { force: true });
      return; // symlink creation unavailable — skip
    }
    try {
      const escape = validateLinks(skill('See [x](./references/link.md).')).find(
        (d) => d.code === DiagnosticCode.LinkEscapesSkillRoot,
      );
      expect(escape).toBeDefined();
      expect(escape?.severity).toBe('warning');
    } finally {
      fs.rmSync(outside, { force: true });
    }
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
    const doc = withResources(skill('Run [it](./scripts/run.js).'), discoverResources(dir));
    expect(validateResources(doc)).toHaveLength(0);
  });
});

describe('discoverResources arbitrary directories and exclusions', () => {
  it('discovers files outside the well-known resource folders', () => {
    write('examples/example.md');
    write('docs/guide.md');
    const found = discoverResources(dir).map((r) => r.relativePath);
    expect(found).toContain('examples/example.md');
    expect(found).toContain('docs/guide.md');
  });

  it('ignores node_modules and .git by default', () => {
    write('node_modules/pkg/index.js');
    write('.git/config');
    write('references/guide.md');
    const found = discoverResources(dir).map((r) => r.relativePath);
    expect(found).toEqual(['references/guide.md']);
  });

  it('excludes the SKILL.md file itself', () => {
    fs.writeFileSync(path.join(dir, 'SKILL.md'), '---\nname: d\ndescription: x\n---\n');
    write('references/guide.md');
    expect(discoverResources(dir).map((r) => r.relativePath)).not.toContain('SKILL.md');
  });

  it('does not warn about excluded files', () => {
    write('node_modules/pkg/index.js');
    const doc = withResources(skill('# Body'), discoverResources(dir));
    expect(validateResources(doc).map((d) => d.code)).not.toContain(
      DiagnosticCode.ResourceUnreferenced,
    );
  });
});

describe('resource references detected in prose and code', () => {
  it('treats a plain-text resource path as a reference', () => {
    write('scripts/run.js');
    const doc = withResources(skill('Run scripts/run.js to start.'), discoverResources(dir));
    expect(validateResources(doc)).toHaveLength(0);
  });

  it('marks the Task 73 plain-text paths as referenced (extract.py, style-guide.md)', () => {
    write('scripts/extract.py');
    write('references/style-guide.md');
    const doc = withResources(
      skill('Run scripts/extract.py.\nRead references/style-guide.md before processing.'),
      discoverResources(dir),
    );
    const referenced = Object.fromEntries(doc.resources.map((r) => [r.relativePath, r.referenced]));
    expect(referenced['scripts/extract.py']).toBe(true);
    expect(referenced['references/style-guide.md']).toBe(true);
    expect(validateResources(doc)).toHaveLength(0);
  });
});
