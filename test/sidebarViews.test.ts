import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import { activatesFor } from './helpers/activationContract';

describe('sidebar view contributions', () => {
  it('declares independent SKILL.md Inspector views and preserves the analysis panel', () => {
    expect(packageJson.contributes.viewsContainers.activitybar[0].title).toBe('SKILL.md Inspector');
    expect(packageJson.contributes.views.skillMdInspector).toEqual([
      expect.objectContaining({ id: 'skillMdInspectorFavorites', name: 'FAVORITES' }),
      expect.objectContaining({ id: 'skillMdInspectorWorkspace', name: 'WORKSPACE' }),
      expect.objectContaining({ id: 'skillMdInspectorInstalledAgents', name: 'INSTALLED AGENTS' }),
      expect.objectContaining({
        id: 'skillMdInspectorOpenCodeSessions',
        name: 'OPENCODE SESSIONS',
      }),
    ]);
    expect(
      packageJson.contributes.views.skillMdInspector.some(
        (view) => view.id === 'skillMdInspectorNavigator',
      ),
    ).toBe(false);
    expect(packageJson.contributes.views.skillMdInspectorPanel).toContainEqual(
      expect.objectContaining({ id: 'skillMdInspectorSkills' }),
    );
  });

  it('activates before any contributed tree view requests its data provider', () => {
    const viewIds = Object.values(packageJson.contributes.views)
      .flat()
      .map((view) => view.id);

    // Since VS Code 1.74, contributed views activate the extension implicitly;
    // explicit onView: entries are only required for older engines.
    for (const viewId of viewIds) {
      expect(activatesFor(packageJson, `onView:${viewId}`), `onView:${viewId}`).toBe(true);
    }
  });

  it('keeps favorites actions scoped to the favorites view title and inspector submenu', () => {
    expect(packageJson.contributes.menus['view/title']).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.clearFavorites',
        when: 'view == skillMdInspectorFavorites && skillMdInspector.hasFavorites',
      }),
    );
    expect(packageJson.contributes.menus['view/title']).not.toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.clearFavorites',
        when: expect.stringContaining('skillMdInspectorWorkspace'),
      }),
    );
    expect(
      packageJson.contributes.menus['view/item/context'].map((item) =>
        'command' in item ? item.command : undefined,
      ),
    ).not.toContain('skillMdInspector.addToFavorites');
    expect(
      (packageJson.contributes.menus['editor/context'] as { command?: string }[]).map(
        (item) => item.command,
      ),
    ).not.toContain('skillMdInspector.addToFavorites');
    expect(
      (packageJson.contributes.menus['explorer/context'] as { command?: string }[]).map(
        (item) => item.command,
      ),
    ).not.toContain('skillMdInspector.addToFavorites');
    // The tree item submenu now uses the same single toggle as the editor menu,
    // aligning the two favorite actions that previously differed.
    expect(packageJson.contributes.menus['skillMdInspector/workspaceFileSkillContext']).toContainEqual(
      expect.objectContaining({ command: 'skillMdInspector.toggleFavorite' }),
    );
    expect(packageJson.contributes.menus['skillMdInspector/context']).toContainEqual(
      expect.objectContaining({ command: 'skillMdInspector.toggleFavorite' }),
    );
  });

  it('scopes context submenus to SKILL.md files and the active Inspector container', () => {
    const expectedWhen =
      'resourceFilename == SKILL.md && activeViewlet == workbench.view.extension.skillMdInspector';
    expect(packageJson.contributes.menus['editor/context']).toContainEqual(
      expect.objectContaining({ submenu: 'skillMdInspector/context', when: expectedWhen }),
    );
    expect(packageJson.contributes.menus['explorer/context']).toContainEqual(
      expect.objectContaining({ submenu: 'skillMdInspector/context', when: expectedWhen }),
    );
    expect(expectedWhen).not.toContain('sideBarFocus');
    expect(JSON.stringify(packageJson)).not.toContain('skillMdInspector.sidebarActive');
    expect(packageJson.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/workspaceFileSkillContext',
        when: 'view == skillMdInspectorWorkspace && (viewItem == skillMdInspector.skillFile || viewItem == skillMdInspector.favoriteSkillFile)',
      }),
    );
  });
});
