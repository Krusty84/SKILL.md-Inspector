import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {
  discoverSkillPaths,
  DEFAULT_SKILL_DISCOVERY_EXCLUDES,
} from '../src/workspace/discoverSkills';

let root: string;

function writeSkill(rel: string): void {
  const full = path.join(root, rel);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  fs.writeFileSync(full, '---\nname: x\ndescription: y\n---\n');
}

const names = (paths: string[]): string[] =>
  paths.map((p) => path.relative(root, p).split(path.sep).join('/'));

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-discovery-'));
  writeSkill('skills/alpha/SKILL.md');
  writeSkill('skills/beta/SKILL.md');
  // Dependency cache, build output, VCS metadata, vendored + nested repositories.
  writeSkill('node_modules/pkg/skills/dep/SKILL.md');
  writeSkill('dist/skills/built/SKILL.md');
  writeSkill('.git/hooks/skills/vcs/SKILL.md');
  writeSkill('vendor/thirdparty/SKILL.md');
  writeSkill('examples/nested-repo/SKILL.md');
});

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true });
});

describe('discoverSkillPaths exclusions (Task 63)', () => {
  it('default exclusions skip dependency, build-output, and VCS directories', () => {
    const found = names(discoverSkillPaths(root));
    expect(found).toContain('skills/alpha/SKILL.md');
    expect(found).toContain('skills/beta/SKILL.md');
    // vendor/ and examples/ are not excluded by default, so they are still discovered.
    expect(found).toContain('vendor/thirdparty/SKILL.md');
    expect(found).toContain('examples/nested-repo/SKILL.md');
    // node_modules / dist / .git are excluded by default.
    expect(found.some((p) => p.includes('node_modules'))).toBe(false);
    expect(found.some((p) => p.startsWith('dist/'))).toBe(false);
    expect(found.some((p) => p.includes('.git/'))).toBe(false);
  });

  it('a user can add exclusions to skip vendored and nested repositories', () => {
    const found = names(
      discoverSkillPaths(root, [
        ...DEFAULT_SKILL_DISCOVERY_EXCLUDES,
        '**/vendor/**',
        '**/examples/**',
      ]),
    );
    expect(found).toEqual(['skills/alpha/SKILL.md', 'skills/beta/SKILL.md']);
  });

  it('setting exclusions replaces the defaults', () => {
    // With only a vendor exclusion, the default node_modules skip no longer applies.
    const found = names(discoverSkillPaths(root, ['**/vendor/**']));
    expect(found.some((p) => p.includes('node_modules'))).toBe(true);
    expect(found.some((p) => p.includes('vendor'))).toBe(false);
  });
});
