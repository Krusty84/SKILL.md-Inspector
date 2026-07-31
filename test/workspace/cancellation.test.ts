import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeWorkspace } from '../../src/workspace/analyzeWorkspace';
import { resolveProfile } from '../../src/profiles';
import { discoverResources } from '../../src/parser/discoverResources';
import { FileTokenCache } from '../../src/analysis/fileTokenCache';
import { countResourceTokens } from '../../src/analysis/tokenUsage';
import type { SkillResource } from '../../src/types/SkillDocument';

/**
 * Plan 17 Parts A, B, D and E. `discoverSkillPaths → analyzeWorkspace →
 * analyzeSkill → detectCollisions` was one synchronous, non-yielding block, so
 * the `CancellationSignal` checks and `onProgress` callbacks threaded through it
 * could never be observed: the extension host cannot process the Cancel click
 * until the loop has already returned.
 */

interface Workspace {
  root: string;
  skillPaths: string[];
  dispose(): void;
}

function makeWorkspace(count: number): Workspace {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmd-cancel-'));
  const skillPaths: string[] = [];
  for (let i = 0; i < count; i++) {
    const dir = path.join(root, 'skills', `skill-${String(i).padStart(3, '0')}`);
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(
      path.join(dir, 'SKILL.md'),
      `---\nname: skill-${String(i).padStart(3, '0')}\n` +
        `description: Convert widget ${i} into a report. Use when the user asks about widget ${i}.\n` +
        `---\n\n# Skill ${i}\n\nSee [notes](./references/notes.md).\n`,
    );
    fs.writeFileSync(path.join(dir, 'references', 'notes.md'), `Notes for skill ${i}.\n`);
    skillPaths.push(path.join(dir, 'SKILL.md'));
  }
  return { root, skillPaths, dispose: () => fs.rmSync(root, { recursive: true, force: true }) };
}

describe('A — a workspace scan can actually be cancelled', () => {
  it('stops after the first skill and reports the scan as partial', async () => {
    const workspace = makeWorkspace(40);
    try {
      const cancel = { isCancellationRequested: false };
      const progress: Array<[number, number]> = [];
      const result = await analyzeWorkspace(
        workspace.root,
        workspace.skillPaths,
        resolveProfile(),
        undefined,
        undefined,
        undefined,
        {
          cancel,
          onProgress: (done, total) => {
            progress.push([done, total]);
            // Flip after the first skill, the way a Cancel click would once the
            // host got a turn to process it.
            if (done >= 1) cancel.isCancellationRequested = true;
          },
        },
      );
      expect(result.cancelled).toBe(true);
      expect(result.skills.length).toBeLessThan(workspace.skillPaths.length);
      expect(progress.length).toBeGreaterThan(0);
      expect(progress[0]).toEqual([1, 40]);
    } finally {
      workspace.dispose();
    }
  });

  it('yields to the host during the scan so progress can paint', async () => {
    const workspace = makeWorkspace(40);
    try {
      let ticks = 0;
      const timer = setInterval(() => {
        ticks += 1;
      }, 1);
      try {
        await analyzeWorkspace(
          workspace.root,
          workspace.skillPaths,
          resolveProfile(),
          undefined,
          undefined,
          undefined,
          {},
        );
      } finally {
        clearInterval(timer);
      }
      // A non-yielding synchronous loop starves the event loop entirely, so no
      // timer callback can run before it returns.
      expect(ticks).toBeGreaterThan(0);
    } finally {
      workspace.dispose();
    }
  });
});

describe('B — the workspace path shares the caches the extension owns', () => {
  it('serves resource discovery and token counts from the injected seams', async () => {
    const workspace = makeWorkspace(6);
    try {
      let discovers = 0;
      let tokenReads = 0;
      const discovered = new Map<string, SkillResource[]>();
      await analyzeWorkspace(
        workspace.root,
        workspace.skillPaths,
        resolveProfile(),
        undefined,
        undefined,
        undefined,
        {
          discover: (dir, exclude) => {
            discovers += 1;
            const cached = discovered.get(dir);
            if (cached) return cached;
            const fresh = discoverResources(dir, exclude);
            discovered.set(dir, fresh);
            return fresh;
          },
          fileTokens: () => {
            tokenReads += 1;
            return 10;
          },
        },
      );
      expect(discovers).toBe(workspace.skillPaths.length);
      expect(tokenReads).toBeGreaterThan(0);
    } finally {
      workspace.dispose();
    }
  });

  it('re-reads no unchanged resource file on a second scan through the shared cache', async () => {
    const workspace = makeWorkspace(20);
    try {
      let reads = 0;
      const cache = new FileTokenCache((absolutePath) => {
        reads += 1;
        return countResourceTokens(absolutePath);
      });
      const run = (): Promise<unknown> =>
        analyzeWorkspace(
          workspace.root,
          workspace.skillPaths,
          resolveProfile(),
          undefined,
          undefined,
          undefined,
          { fileTokens: (resource) => cache.tokensFor(resource.absolutePath) },
        );
      await run();
      const afterFirst = reads;
      expect(afterFirst).toBeGreaterThan(0);
      await run();
      // Every file is validated by stat and served from the cache: saving one
      // SKILL.md used to re-read and re-BPE-encode all 500 skills' references.
      expect(reads).toBe(afterFirst);
    } finally {
      workspace.dispose();
    }
  });
});

describe('D — ordering does not depend on the host locale', () => {
  it('sorts names the same way whatever Intl thinks', async () => {
    const workspace = makeWorkspace(5);
    try {
      const result = await analyzeWorkspace(
        workspace.root,
        [...workspace.skillPaths].reverse(),
        resolveProfile(),
        undefined,
        undefined,
        undefined,
        {},
      );
      const names = result.skills.map((skill) => skill.name);
      expect(names).toEqual([...names].sort());
    } finally {
      workspace.dispose();
    }
  });
});

describe('E — collision output is bounded', () => {
  it('caps the reported list and states how many were suppressed', async () => {
    // 60 skills built from one house template: every pair collides.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'skillmd-collide-'));
    try {
      const skillPaths: string[] = [];
      for (let i = 0; i < 60; i++) {
        const name = `report-tool-${String(i).padStart(3, '0')}`;
        const dir = path.join(root, 'skills', name);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(
          path.join(dir, 'SKILL.md'),
          `---\nname: ${name}\n` +
            'description: Generate PDF reports from spreadsheet data. ' +
            'Use when the user asks to build a report from a spreadsheet.\n---\n\n# Report tool\n',
        );
        skillPaths.push(path.join(dir, 'SKILL.md'));
      }
      const result = await analyzeWorkspace(
        root,
        skillPaths,
        resolveProfile(),
        undefined,
        undefined,
        undefined,
        { maxReportedCollisions: 100 },
      );
      expect(result.collisions.length).toBeLessThanOrEqual(100);
      expect(result.suppressedCollisions ?? 0).toBeGreaterThan(0);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });
});
