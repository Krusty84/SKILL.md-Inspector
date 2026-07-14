import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';

describe('package manifest context menus and templates', () => {
  it('declares the SKILL.md Inspector submenu in editor and explorer contexts', () => {
    expect(packageJson.contributes.submenus).toContainEqual({ id: 'skillMdInspector/context', label: 'SKILL.md Inspector' });
    expect(packageJson.contributes.menus['editor/context']).toContainEqual(expect.objectContaining({ submenu: 'skillMdInspector/context', when: 'resourceFilename == SKILL.md' }));
    expect(packageJson.contributes.menus['explorer/context']).toContainEqual(expect.objectContaining({ submenu: 'skillMdInspector/context', when: 'resourceFilename == SKILL.md' }));
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
});
