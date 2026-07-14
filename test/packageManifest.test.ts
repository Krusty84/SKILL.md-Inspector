import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('package manifest context menus and templates', () => {
  it('declares the SKILL.md Inspector submenu in editor and explorer contexts', () => {
    expect(packageJson.contributes.submenus).toContainEqual({ id: 'skillMdInspector/context', label: 'SKILL.md Inspector' });
    const activeWhen = 'resourceFilename == SKILL.md && activeViewlet == workbench.view.extension.skillMdInspector';
    expect(packageJson.contributes.menus['editor/context']).toContainEqual(expect.objectContaining({ submenu: 'skillMdInspector/context', when: activeWhen }));
    expect(packageJson.contributes.menus['explorer/context']).toContainEqual(expect.objectContaining({ submenu: 'skillMdInspector/context', when: activeWhen }));
    expect(activeWhen).not.toContain('sideBarFocus');
  });

  it('places existing and template-management commands inside the submenu', () => {
    const commands = packageJson.contributes.menus['skillMdInspector/context'].map((item) => item.command);
    expect(commands).toEqual(expect.arrayContaining([
      'skillMdInspector.validateCurrentSkill',
      'skillMdInspector.validateWorkspaceSkills',
      'skillMdInspector.insertTemplate',
      'skillMdInspector.showSkillReport',
      'skillMdInspector.improveDescriptionLocally',
      'skillMdInspector.showWorkspaceReport',
      'skillMdInspector.exportSkillsIndex',
      'skillMdInspector.refreshSkills',
      'skillMdInspector.openTemplateSettings',
      'skillMdInspector.resetTemplates',
      'skillMdInspector.addToFavorites',
    ]));
  });

  it('declares template setting schema and new commands', () => {
    const setting = packageJson.contributes.configuration.properties['skillMdInspector.templates'];
    expect(setting.items.properties).toHaveProperty('frontmatter');
    expect(setting.items.properties).toHaveProperty('body');
    expect(setting.items.properties).not.toHaveProperty('content');
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toContain('skillMdInspector.openTemplateSettings');
    expect(commands).toContain('skillMdInspector.resetTemplates');
  });

  it('declares Explorer-like WORKSPACE toolbar and context actions without reusing Explorer internals', () => {
    const viewTitle = packageJson.contributes.menus['view/title'];
    expect(viewTitle).toContainEqual(expect.objectContaining({ command: 'skillMdInspector.workspace.newFile', when: 'view == skillMdInspectorWorkspace', group: 'navigation@1' }));
    expect(viewTitle).toContainEqual(expect.objectContaining({ command: 'skillMdInspector.workspace.newFolder', when: 'view == skillMdInspectorWorkspace', group: 'navigation@2' }));
    expect(viewTitle).toContainEqual(expect.objectContaining({ command: 'skillMdInspector.refreshWorkspace', when: 'view == skillMdInspectorWorkspace', group: 'navigation@3' }));
    expect(viewTitle).toContainEqual(expect.objectContaining({ command: 'skillMdInspector.workspace.addFolders', when: 'view == skillMdInspectorWorkspace', group: 'secondary@1' }));
    expect(viewTitle).toContainEqual(expect.objectContaining({ command: 'skillMdInspector.workspace.openFolderInNewWindow', when: 'view == skillMdInspectorWorkspace', group: 'secondary@2' }));

    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toEqual(expect.arrayContaining([
      'skillMdInspector.workspace.newFile',
      'skillMdInspector.workspace.newFolder',
      'skillMdInspector.workspace.addFolders',
      'skillMdInspector.workspace.openFolderInNewWindow',
      'skillMdInspector.workspace.removeFolder',
      'skillMdInspector.workspace.open',
      'skillMdInspector.workspace.openToSide',
      'skillMdInspector.workspace.rename',
      'skillMdInspector.workspace.delete',
      'skillMdInspector.workspace.copy',
      'skillMdInspector.workspace.cut',
      'skillMdInspector.workspace.paste',
      'skillMdInspector.workspace.copyPath',
      'skillMdInspector.workspace.copyRelativePath',
      'skillMdInspector.workspace.openInTerminal',
      'skillMdInspector.workspace.refreshFolder',
    ]));

    const workspaceContexts = packageJson.contributes.menus['view/item/context'].filter((item) => item.when?.includes('view == skillMdInspectorWorkspace'));
    expect(workspaceContexts).toEqual(expect.arrayContaining([
      expect.objectContaining({ command: 'skillMdInspector.workspace.open', group: '1_open@1' }),
      expect.objectContaining({ command: 'skillMdInspector.workspace.cut', group: '4_clipboard@1' }),
      expect.objectContaining({ command: 'skillMdInspector.workspace.copyPath', group: '5_path@1' }),
      expect.objectContaining({ command: 'skillMdInspector.workspace.rename', group: '6_manage@1' }),
      expect.objectContaining({ command: 'skillMdInspector.workspace.removeFolder', group: '7_workspace@2' }),
      expect.objectContaining({ submenu: 'skillMdInspector/context', group: '9_inspector@1' }),
    ]));
    expect(JSON.stringify(packageJson.contributes.menus['view/item/context'])).not.toContain('explorer/context');
  });

});
