import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverSkillPaths } from '../src/workspace/discoverSkills';
import { analyzeWorkspace, buildSkillsIndex } from '../src/workspace/analyzeWorkspace';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

let root: string;

function writeSkill(rel: string, content: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, content);
}

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-workspace-'));

  writeSkill(
    'skills/pdf-report-formatter/SKILL.md',
    [
      '---',
      'name: pdf-report-formatter',
      'description: Format technical PDF reports using company layout rules. Use when asked to standardize inspection reports. Do not use for contracts.',
      '---',
      '',
      '## When to use',
      '',
      'See [guide](./references/guide.md).',
    ].join('\n'),
  );
  writeSkill('skills/pdf-report-formatter/references/guide.md', '# Guide');
  writeSkill('skills/pdf-report-formatter/references/unused.md', '# Unused');

  writeSkill(
    'skills/engineering-report-formatter/SKILL.md',
    [
      '---',
      'name: engineering-report-formatter',
      'description: Format technical engineering reports using company layout rules. Use when asked to standardize inspection reports. Do not use for contracts.',
      '---',
      '',
      '## When to use',
      '',
      'text',
    ].join('\n'),
  );

  writeSkill(
    'skills/broken-skill/SKILL.md',
    ['---', 'name: Broken Skill', 'description: Helps.', '---', '', '# Broken'].join('\n'),
  );

  // Must be ignored by discovery.
  writeSkill('node_modules/pkg/skills/x/SKILL.md', '---\nname: x\ndescription: y\n---\n');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('workspace discovery + analysis', () => {
  it('discovers all skills and skips node_modules', () => {
    const paths = discoverSkillPaths(root);
    expect(paths).toHaveLength(3);
    expect(paths.some((p) => p.includes('node_modules'))).toBe(false);
  });

  it('analyzes each skill with score, counts, and resource graph', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    expect(analysis.skills).toHaveLength(3);

    const pdf = analysis.skills.find((s) => s.name === 'pdf-report-formatter');
    expect(pdf).toBeDefined();
    expect(pdf!.errors).toBe(0);
    expect(pdf!.validationStatus).toBe('warning');
    expect(pdf!.staticDescriptionQuality.adjustedScore).toBeGreaterThan(0);
    expect(pdf!.staticDescriptionQuality.score).toBe(pdf!.staticDescriptionQuality.adjustedScore);
    expect(pdf!.authoringQuality.instructions.score).toBeGreaterThan(0);
    expect(pdf!.authoringQuality.resources.score).toBeLessThan(100);
    const unreferenced = pdf!.resourceGraph.nodes.find((n) => n.kind === 'unreferenced');
    expect(unreferenced?.path).toBe('references/unused.md');

    const broken = analysis.skills.find((s) => s.name === 'Broken Skill');
    expect(broken!.errors).toBeGreaterThan(0);
    expect(broken!.validationStatus).toBe('fail');
  });

  it('keeps validation, description, and authoring dimensions distinct for minimal frontmatter', () => {
    writeSkill(
      'skills/minimal-skill/SKILL.md',
      [
        '---',
        'name: minimal-skill',
        'description: Format technical engineering reports using company layout rules.',
        '---',
      ].join('\n'),
    );

    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    const minimal = analysis.skills.find((skill) => skill.name === 'minimal-skill')!;

    expect(minimal.validationStatus).toBe('warning');
    expect(minimal.staticDescriptionQuality.state).toBe('scored');
    if (minimal.staticDescriptionQuality.state !== 'scored') {
      throw new Error('Expected a scored description');
    }
    expect(minimal.staticDescriptionQuality.rawScore).toBeGreaterThan(
      minimal.staticDescriptionQuality.adjustedScore,
    );
    expect(minimal.staticDescriptionQuality.label).toBe('acceptable');
    expect(minimal.staticDescriptionQuality.coverage).toBe('high');
    expect(minimal.staticDescriptionQuality.gradeLimitations).toContainEqual(
      expect.objectContaining({ code: 'missing-usage-trigger', ceiling: 69 }),
    );
    expect(minimal.authoringQuality.instructions).toMatchObject({ score: 0, label: 'poor' });
    expect(minimal.authoringQuality.resources).toMatchObject({ score: 100, label: 'excellent' });
  });

  it('detects a collision between the two report formatters', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    expect(analysis.collisions.length).toBeGreaterThanOrEqual(1);
    const names = analysis.collisions.flatMap((c) => [c.a, c.b]);
    expect(names).toContain('pdf-report-formatter');
    expect(names).toContain('engineering-report-formatter');
  });

  it('detects duplicate and confusingly similar skill names', () => {
    writeSkill(
      'skills/dup/SKILL.md',
      '---\nname: PDF-Report-Formatter\ndescription: Format PDF reports. Use when needed.\n---\n',
    );
    writeSkill(
      'skills/near/SKILL.md',
      '---\nname: pdf-reports-formatter\ndescription: Format PDF reports. Use when needed.\n---\n',
    );
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);

    const conflict = analysis.nameConflicts.find((c) => c.normalized === 'pdf-report-formatter');
    expect(conflict).toBeDefined();
    expect(conflict!.entries.length).toBeGreaterThanOrEqual(2);

    expect(analysis.similarNames.flatMap((s) => [s.a, s.b])).toContain('pdf-reports-formatter');
  });

  it('exports an index with the documented shape', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    const index = buildSkillsIndex(analysis);
    expect(typeof index.generatedAt).toBe('string');
    expect(index.skills).toHaveLength(3);
    const entry = index.skills.find((s) => s.name === 'pdf-report-formatter')!;
    expect(index.schemaVersion).toBe(5);
    expect(entry.path).toBe('skills/pdf-report-formatter/SKILL.md');
    expect(entry.validationStatus).toBe('warning');
    expect(entry.staticDescriptionQuality).toMatchObject({
      state: 'scored',
      rawScore: expect.any(Number),
      adjustedScore: expect.any(Number),
      label: expect.any(String),
      coverage: expect.any(String),
      limitations: expect.any(Array),
      gradeLimitations: expect.any(Array),
    });
    expect(entry.authoringQuality.instructions).toMatchObject({
      state: 'scored',
      score: expect.any(Number),
      label: expect.any(String),
      findings: expect.any(Array),
    });
    expect(entry.authoringQuality.resources).toMatchObject({
      score: expect.any(Number),
      label: expect.any(String),
      findings: expect.any(Array),
    });
    expect(entry.information).toBeGreaterThanOrEqual(0);
  });

  it('includes a machine-readable diagnostics summary in the index (Task 87)', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    const index = buildSkillsIndex(analysis);
    const broken = index.skills.find((s) => s.name === 'Broken Skill')!;
    expect(broken.diagnostics.length).toBeGreaterThan(0);
    for (const d of broken.diagnostics) {
      expect(d).toHaveProperty('code');
      expect(d).toHaveProperty('severity');
      expect(d).toHaveProperty('kind');
    }
    // The invalid name on "Broken Skill" is classified as a specification error.
    expect(broken.diagnostics.some((d) => d.kind === 'specification')).toBe(true);
    // Deterministic: rebuilding yields the same diagnostics for the same skill.
    const again = buildSkillsIndex(analysis).skills.find((s) => s.name === 'Broken Skill')!;
    expect(again.diagnostics).toEqual(broken.diagnostics);
  });

  it('propagates resource token diagnostics into workspace counts and status', () => {
    writeTokenBudgetSkill('warning-token-skill', 10_001);
    writeTokenBudgetSkill('error-token-skill', 25_001);

    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    const warningSkill = analysis.skills.find((skill) => skill.name === 'warning-token-skill')!;
    const errorSkill = analysis.skills.find((skill) => skill.name === 'error-token-skill')!;

    expect(warningSkill.diagnostics).toContainEqual(
      expect.objectContaining({
        code: DiagnosticCode.ReferenceFileTokenLimit,
        severity: 'warning',
      }),
    );
    expect(warningSkill.warnings).toBeGreaterThanOrEqual(1);
    expect(warningSkill.validationStatus).toBe('warning');

    expect(errorSkill.diagnostics).toContainEqual(
      expect.objectContaining({
        code: DiagnosticCode.ReferenceFileTokenLimit,
        severity: 'error',
      }),
    );
    expect(errorSkill.errors).toBeGreaterThanOrEqual(1);
    expect(errorSkill.validationStatus).toBe('fail');
  });

  it('stops analysis when cancellation is requested and marks the result partial (Task 64)', () => {
    const paths = discoverSkillPaths(root); // 3 skills
    const cancel = { isCancellationRequested: false };
    let lastDone = 0;
    const analysis = analyzeWorkspace(
      root,
      paths,
      genericProfile,
      undefined,
      undefined,
      undefined,
      {
        cancel,
        onProgress: (done) => {
          lastDone = done;
          if (done === 1) {
            cancel.isCancellationRequested = true; // cancel after the first file
          }
        },
      },
    );
    expect(analysis.cancelled).toBe(true);
    expect(analysis.skills).toHaveLength(1);
    expect(lastDone).toBe(1);
  });

  it('reports progress for every skill on a completed scan (Task 65)', () => {
    const paths = discoverSkillPaths(root); // 3 skills
    const seen: Array<[number, number]> = [];
    const analysis = analyzeWorkspace(
      root,
      paths,
      genericProfile,
      undefined,
      undefined,
      undefined,
      {
        onProgress: (done, total) => seen.push([done, total]),
      },
    );
    expect(analysis.cancelled).toBe(false);
    expect(seen).toEqual([
      [1, 3],
      [2, 3],
      [3, 3],
    ]);
  });
});

function writeTokenBudgetSkill(name: string, referenceTokens: number): void {
  writeSkill(
    `skills/${name}/SKILL.md`,
    [
      '---',
      `name: ${name}`,
      'description: Inspect token budgets for reference material. Use when validating packaged skills. Do not use for unrelated files.',
      '---',
      '',
      '## When to use',
      '',
      'Use this workflow when validating a package.',
      '',
      '## Examples',
      '',
      'Input: a package. Output: token diagnostics.',
      '',
      'See [guide](./references/guide.md).',
    ].join('\n'),
  );
  writeSkill(`skills/${name}/references/guide.md`, ' hello'.repeat(referenceTokens));
}
