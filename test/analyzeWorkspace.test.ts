import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { discoverSkillPaths } from '../src/workspace/discoverSkills';
import { analyzeWorkspace, buildSkillsIndex } from '../src/workspace/analyzeWorkspace';
import { genericProfile } from '../src/profiles/genericProfile';

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

  it('analyzes each skill with score, counts, portability, and resource graph', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    expect(analysis.skills).toHaveLength(3);

    const pdf = analysis.skills.find((s) => s.name === 'pdf-report-formatter');
    expect(pdf).toBeDefined();
    expect(pdf!.errors).toBe(0);
    expect(pdf!.triggerQualityScore).toBeGreaterThan(0);
    expect(Object.keys(pdf!.profileCompatibility).sort()).toEqual([
      'claude',
      'codex',
      'generic',
      'vscode',
    ]);
    const unreferenced = pdf!.resourceGraph.nodes.find((n) => n.kind === 'unreferenced');
    expect(unreferenced?.path).toBe('references/unused.md');

    const broken = analysis.skills.find((s) => s.name === 'Broken Skill');
    expect(broken!.errors).toBeGreaterThan(0);
    expect(broken!.profileCompatibility.generic).toBe('fail');
  });

  it('detects a collision between the two report formatters', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    expect(analysis.collisions.length).toBeGreaterThanOrEqual(1);
    const names = analysis.collisions.flatMap((c) => [c.a, c.b]);
    expect(names).toContain('pdf-report-formatter');
    expect(names).toContain('engineering-report-formatter');
  });

  it('exports an index with the documented shape', () => {
    const analysis = analyzeWorkspace(root, discoverSkillPaths(root), genericProfile);
    const index = buildSkillsIndex(analysis);
    expect(typeof index.generatedAt).toBe('string');
    expect(index.skills).toHaveLength(3);
    const entry = index.skills.find((s) => s.name === 'pdf-report-formatter')!;
    expect(entry.path).toBe('skills/pdf-report-formatter/SKILL.md');
    expect(entry.profileCompatibility.generic).toBe('pass');
  });
});
