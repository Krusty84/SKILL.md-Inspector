import { mkdtemp, writeFile, mkdir, realpath, symlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBuiltInAgentSources } from '../src/navigator/builtInAgentSources';
import { discoverExternalFiles } from '../src/navigator/discoverExternalFiles';
import { expandConfiguredPath } from '../src/navigator/expandConfiguredPath';
import {
  addFavorite,
  removeFavorite,
  restoreFavorites,
  updateFavoriteUri,
} from '../src/navigator/favoritesStore';
import { normalizeAdditionalRoots } from '../src/navigator/normalizeAdditionalRoots';
import type { AgentFileName } from '../src/navigator/types';
import packageJson from '../package.json';

describe('navigator pure modules', () => {
  it('resolves built-in agent sources', () => {
    const sources = resolveBuiltInAgentSources({
      homeDir: '/home/me',
      env: { CODEX_HOME: '/tmp/codex' },
      platform: 'linux',
    });
    expect(sources).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ rootPath: '/tmp/codex', files: ['AGENTS.md'], recursive: false }),
        expect.objectContaining({
          id: 'codex-home-skills',
          rootPath: '/tmp/codex/skills',
          files: ['SKILL.md'],
          recursive: true,
        }),
        expect.objectContaining({
          id: 'codex-user-skills',
          rootPath: path.join('/home/me', '.agents', 'skills'),
        }),
        expect.objectContaining({ id: 'codex-admin-skills', rootPath: '/etc/codex/skills' }),
        expect.objectContaining({
          id: 'opencode-global',
          agentId: 'opencode',
          agentLabel: 'OpenCode',
          groupLabel: 'Global Instructions',
          rootPath: path.join('/home/me', '.config', 'opencode'),
          files: ['AGENTS.md'],
          recursive: false,
        }),
        expect.objectContaining({
          id: 'opencode-skills',
          agentId: 'opencode',
          agentLabel: 'OpenCode',
          groupLabel: 'Skills',
          rootPath: path.join('/home/me', '.config', 'opencode', 'skills'),
          files: ['SKILL.md'],
          recursive: true,
        }),
        expect.objectContaining({
          id: 'claude-global',
          rootPath: path.join('/home/me', '.claude'),
          files: ['CLAUDE.md'],
          recursive: false,
        }),
        expect.objectContaining({
          id: 'claude-skills',
          rootPath: path.join('/home/me', '.claude', 'skills'),
          files: ['SKILL.md'],
          recursive: true,
        }),
        expect.objectContaining({ rootPath: path.join('/home/me', '.copilot', 'skills') }),
      ]),
    );
    const defaultSources = resolveBuiltInAgentSources({
      homeDir: '/h',
      env: {},
      platform: 'win32',
    });
    expect(defaultSources).toContainEqual(
      expect.objectContaining({ id: 'codex-global', rootPath: path.join('/h', '.codex') }),
    );
    expect(defaultSources).toContainEqual(
      expect.objectContaining({
        id: 'codex-home-skills',
        rootPath: path.join('/h', '.codex', 'skills'),
      }),
    );
    expect(defaultSources.some((source) => source.rootPath === '/etc/codex/skills')).toBe(false);
  });

  it('expands configured paths safely and deterministically', () => {
    const context = { homeDir: '/home/me', cwd: '/base', env: { AGENT: 'tool' } };
    expect(expandConfiguredPath('~/.custom', context)).toBe(path.resolve('/home/me/.custom'));
    expect(expandConfiguredPath('/opt/${env:AGENT}', context)).toBe(path.resolve('/opt/tool'));
    expect(expandConfiguredPath('relative/root', context)).toBe(
      path.resolve('/base/relative/root'),
    );
    expect(expandConfiguredPath('${env:MISSING}/x', context)).toBe(path.resolve('/x'));
    expect(expandConfiguredPath('$(agent home)', context)).toBeUndefined();
  });

  it('normalizes additional roots and ignores malformed entries', () => {
    const result = normalizeAdditionalRoots([
      { id: 'a', label: 'A', path: '~/.a' },
      { id: 'b', label: 'B', path: '/b', files: ['SKILL.md'], recursive: false },
      { id: 'c', label: 'C', path: '/c', files: ['CLAUDE.md'], recursive: false },
      { id: '', label: 'Bad', path: '/bad' },
    ]);
    expect(result.roots).toEqual([
      {
        id: 'a',
        label: 'A',
        path: '~/.a',
        files: ['SKILL.md', 'AGENTS.md', 'CLAUDE.md'],
        recursive: true,
      },
      { id: 'b', label: 'B', path: '/b', files: ['SKILL.md'], recursive: false },
      { id: 'c', label: 'C', path: '/c', files: ['CLAUDE.md'], recursive: false },
    ]);
    expect(result.ignoredCount).toBe(1);
    const claudeFileName: AgentFileName = 'CLAUDE.md';
    expect(claudeFileName).toBe('CLAUDE.md');
  });

  it('discovers external files within bounds', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-nav-'));
    await mkdir(path.join(root, 'a', 'b'), { recursive: true });
    await writeFile(path.join(root, 'a', 'SKILL.md'), '---\nname: a\n---');
    await writeFile(path.join(root, 'a', 'b', 'AGENTS.md'), '# agents');
    await writeFile(path.join(root, 'CLAUDE.md'), '# claude');
    await writeFile(path.join(root, 'README.md'), '# readme');
    await symlink(path.join(root, 'a'), path.join(root, 'a', 'loop'), 'dir').catch(() => undefined);
    const result = await discoverExternalFiles(
      {
        id: 's',
        agentId: 'agent',
        agentLabel: 'Agent',
        groupLabel: 'Skills',
        rootPath: root,
        files: ['SKILL.md', 'AGENTS.md', 'CLAUDE.md'],
        recursive: true,
      },
      { maxResults: 10, maxDepth: 12 },
    );
    expect(result.files.map((file) => file.relativePath)).toEqual([
      'a/b/AGENTS.md',
      'CLAUDE.md',
      'a/SKILL.md',
    ]);
    expect(result.files.find((file) => file.fileName === 'CLAUDE.md')).toEqual(
      expect.objectContaining({
        fileName: 'CLAUDE.md',
        absolutePath: await realpath(path.join(root, 'CLAUDE.md')),
      }),
    );
    const claude = await discoverExternalFiles({
      id: 'claude',
      agentId: 'claude',
      agentLabel: 'Claude Code',
      groupLabel: 'Global Instructions',
      rootPath: root,
      files: ['CLAUDE.md'],
      recursive: false,
    });
    expect(claude.files.map((file) => file.relativePath)).toEqual(['CLAUDE.md']);
    const limited = await discoverExternalFiles(
      {
        id: 's',
        agentId: 'agent',
        agentLabel: 'Agent',
        groupLabel: 'Skills',
        rootPath: root,
        files: ['SKILL.md', 'AGENTS.md'],
        recursive: true,
      },
      { maxResults: 1, maxDepth: 12 },
    );
    expect(limited.messages).toContain('Results truncated. Narrow the configured search root.');
  });

  it('maintains favorites without duplicates and preserves missing entries', () => {
    const first = addFavorite([], 'file:///tmp/skill/SKILL.md');
    expect(first.added).toBe(true);
    expect(addFavorite(first.entries, 'file:///tmp/skill/SKILL.md').added).toBe(false);
    expect(addFavorite(first.entries, 'file:///tmp/skill/AGENTS.md').added).toBe(false);
    const renamed = updateFavoriteUri(
      first.entries,
      'file:///tmp/skill/SKILL.md',
      'file:///tmp/new/SKILL.md',
    );
    expect(renamed[0]?.uri).toBe('file:///tmp/new/SKILL.md');
    expect(removeFavorite(renamed, 'file:///tmp/new/SKILL.md')).toEqual([]);
    expect(restoreFavorites([{ uri: 'file:///missing/SKILL.md' }])).toEqual([
      { uri: 'file:///missing/SKILL.md' },
    ]);
  });
});

describe('navigator manifest', () => {
  it('declares containers, views, commands, menus, and additional roots schema', () => {
    expect(packageJson.contributes.viewsContainers.activitybar[0]).toMatchObject({
      id: 'skillMdInspector',
      title: 'SKILL.md INSPECTOR',
      icon: 'media/skill-md-inspector.svg',
    });
    expect(packageJson.contributes.viewsContainers.panel[0]).toMatchObject({
      id: 'skillMdInspectorPanel',
      icon: 'media/skill-md-inspector.svg',
    });
    expect(packageJson.contributes.views.skillMdInspector.map((view) => view.id)).toEqual([
      'skillMdInspectorFavorites',
      'skillMdInspectorWorkspace',
      'skillMdInspectorInstalledAgents',
      'skillMdInspectorOpenCodeSessions',
    ]);
    expect(packageJson.contributes.views.skillMdInspector.map((view) => view.name)).toEqual([
      'FAVORITES',
      'WORKSPACE',
      'INSTALLED AGENTS',
      'OPENCODE SESSIONS',
    ]);
    expect(packageJson.contributes.views.skillMdInspectorPanel[0].id).toBe(
      'skillMdInspectorSkills',
    );
    expect(packageJson.contributes.views).not.toHaveProperty('explorer');
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        'skillMdInspector.addToFavorites',
        'skillMdInspector.removeFromFavorites',
        'skillMdInspector.clearFavorites',
        'skillMdInspector.refreshNavigator',
      ]),
    );
    expect(packageJson.contributes.menus['view/title']).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.refreshFavorites',
        when: 'view == skillMdInspectorFavorites',
      }),
    );
    expect(packageJson.contributes.menus['view/title']).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.refreshWorkspace',
        when: 'view == skillMdInspectorWorkspace',
      }),
    );
    expect(packageJson.contributes.menus['view/title']).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.refreshInstalledAgents',
        when: 'view == skillMdInspectorInstalledAgents',
      }),
    );
    expect(
      packageJson.contributes.menus['view/item/context'].map((item) =>
        'command' in item ? item.command : undefined,
      ),
    ).not.toContain('skillMdInspector.addToFavorites');
    expect(packageJson.contributes.configuration.properties).toHaveProperty(
      'skillMdInspector.navigator.additionalRoots',
    );
    expect(
      packageJson.contributes.configuration.properties['skillMdInspector.navigator.additionalRoots']
        .items.properties.files.items.enum,
    ).toContain('CLAUDE.md');
  });
});
