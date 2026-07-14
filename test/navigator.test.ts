import { mkdtemp, writeFile, mkdir, symlink } from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { resolveBuiltInAgentSources } from '../src/navigator/builtInAgentSources';
import { discoverExternalFiles } from '../src/navigator/discoverExternalFiles';
import { expandConfiguredPath } from '../src/navigator/expandConfiguredPath';
import { addFavorite, removeFavorite, restoreFavorites, updateFavoriteUri } from '../src/navigator/favoritesStore';
import { normalizeAdditionalRoots } from '../src/navigator/normalizeAdditionalRoots';
import packageJson from '../package.json';

describe('navigator pure modules', () => {
  it('resolves built-in agent sources', () => {
    const sources = resolveBuiltInAgentSources({ homeDir: '/home/me', env: { CODEX_HOME: '/tmp/codex' }, platform: 'linux' });
    expect(sources).toEqual(expect.arrayContaining([
      expect.objectContaining({ rootPath: '/tmp/codex', files: ['AGENTS.md'], recursive: false }),
      expect.objectContaining({ rootPath: path.join('/home/me', '.agents', 'skills') }),
      expect.objectContaining({ rootPath: '/etc/codex/skills' }),
      expect.objectContaining({ rootPath: path.join('/home/me', '.claude', 'skills') }),
      expect.objectContaining({ rootPath: path.join('/home/me', '.copilot', 'skills') }),
    ]));
    expect(resolveBuiltInAgentSources({ homeDir: '/h', env: {}, platform: 'win32' }).some((s) => s.rootPath === '/etc/codex/skills')).toBe(false);
  });

  it('expands configured paths safely and deterministically', () => {
    const context = { homeDir: '/home/me', cwd: '/base', env: { AGENT: 'tool' } };
    expect(expandConfiguredPath('~/.custom', context)).toBe(path.resolve('/home/me/.custom'));
    expect(expandConfiguredPath('/opt/${env:AGENT}', context)).toBe(path.resolve('/opt/tool'));
    expect(expandConfiguredPath('relative/root', context)).toBe(path.resolve('/base/relative/root'));
    expect(expandConfiguredPath('${env:MISSING}/x', context)).toBe(path.resolve('/x'));
    expect(expandConfiguredPath('$(agent home)', context)).toBeUndefined();
  });

  it('normalizes additional roots and ignores malformed entries', () => {
    const result = normalizeAdditionalRoots([
      { id: 'a', label: 'A', path: '~/.a' },
      { id: 'b', label: 'B', path: '/b', files: ['SKILL.md'], recursive: false },
      { id: '', label: 'Bad', path: '/bad' },
    ]);
    expect(result.roots).toEqual([
      { id: 'a', label: 'A', path: '~/.a', files: ['SKILL.md', 'AGENTS.md'], recursive: true },
      { id: 'b', label: 'B', path: '/b', files: ['SKILL.md'], recursive: false },
    ]);
    expect(result.ignoredCount).toBe(1);
  });

  it('discovers external files within bounds', async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), 'skill-nav-'));
    await mkdir(path.join(root, 'a', 'b'), { recursive: true });
    await writeFile(path.join(root, 'a', 'SKILL.md'), '---\nname: a\n---');
    await writeFile(path.join(root, 'a', 'b', 'AGENTS.md'), '# agents');
    await writeFile(path.join(root, 'README.md'), '# readme');
    await symlink(path.join(root, 'a'), path.join(root, 'a', 'loop'), 'dir').catch(() => undefined);
    const result = await discoverExternalFiles({ id: 's', agentId: 'agent', agentLabel: 'Agent', groupLabel: 'Skills', rootPath: root, files: ['SKILL.md', 'AGENTS.md'], recursive: true }, { maxResults: 10, maxDepth: 12 });
    expect(result.files.map((file) => file.relativePath)).toEqual(['a/b/AGENTS.md', 'a/SKILL.md']);
    const limited = await discoverExternalFiles({ id: 's', agentId: 'agent', agentLabel: 'Agent', groupLabel: 'Skills', rootPath: root, files: ['SKILL.md', 'AGENTS.md'], recursive: true }, { maxResults: 1, maxDepth: 12 });
    expect(limited.messages).toContain('Results truncated. Narrow the configured search root.');
  });

  it('maintains favorites without duplicates and preserves missing entries', () => {
    const first = addFavorite([], 'file:///tmp/skill/SKILL.md');
    expect(first.added).toBe(true);
    expect(addFavorite(first.entries, 'file:///tmp/skill/SKILL.md').added).toBe(false);
    expect(addFavorite(first.entries, 'file:///tmp/skill/AGENTS.md').added).toBe(false);
    const renamed = updateFavoriteUri(first.entries, 'file:///tmp/skill/SKILL.md', 'file:///tmp/new/SKILL.md');
    expect(renamed[0]?.uri).toBe('file:///tmp/new/SKILL.md');
    expect(removeFavorite(renamed, 'file:///tmp/new/SKILL.md')).toEqual([]);
    expect(restoreFavorites([{ uri: 'file:///missing/SKILL.md' }])).toEqual([{ uri: 'file:///missing/SKILL.md' }]);
  });
});

describe('navigator manifest', () => {
  it('declares containers, views, commands, menus, and additional roots schema', () => {
    expect(packageJson.contributes.viewsContainers.activitybar[0]).toMatchObject({ id: 'skillMdInspector', icon: 'media/skill-md-inspector.svg' });
    expect(packageJson.contributes.viewsContainers.panel[0]).toMatchObject({ id: 'skillMdInspectorPanel', icon: 'media/skill-md-inspector.svg' });
    expect(packageJson.contributes.views.skillMdInspector[0].id).toBe('skillMdInspectorNavigator');
    expect(packageJson.contributes.views.skillMdInspectorPanel[0].id).toBe('skillMdInspectorSkills');
    expect(packageJson.contributes.views).not.toHaveProperty('explorer');
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toEqual(expect.arrayContaining(['skillMdInspector.addToFavorites', 'skillMdInspector.removeFromFavorites', 'skillMdInspector.clearFavorites', 'skillMdInspector.refreshNavigator']));
    expect(packageJson.contributes.menus['view/title'].map((item) => item.command)).toContain('skillMdInspector.refreshNavigator');
    expect(packageJson.contributes.menus['view/item/context'].map((item) => item.command)).toContain('skillMdInspector.addToFavorites');
    expect(packageJson.contributes.configuration.properties).toHaveProperty('skillMdInspector.navigator.additionalRoots');
  });
});
