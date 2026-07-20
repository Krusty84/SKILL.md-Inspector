import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import catalog from '../src/quality/defaultHeuristicDictionaries.json';

describe('package manifest context menus and templates', () => {
  it('declares the SKILL.md Inspector submenu in editor and explorer contexts', () => {
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/context',
      label: 'SKILL.md Inspector',
    });
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/skillItemContext',
      label: 'SKILL.md Inspector',
    });
    const activeWhen =
      'resourceFilename == SKILL.md && activeViewlet == workbench.view.extension.skillMdInspector';
    expect(packageJson.contributes.menus['editor/context']).toContainEqual(
      expect.objectContaining({ submenu: 'skillMdInspector/context', when: activeWhen }),
    );
    expect(packageJson.contributes.menus['explorer/context']).toContainEqual(
      expect.objectContaining({ submenu: 'skillMdInspector/context', when: activeWhen }),
    );
    expect(activeWhen).not.toContain('sideBarFocus');
  });

  it('keeps only per-skill actions in the editor submenu, Show Skill Report under Validate Current Skill', () => {
    const items = packageJson.contributes.menus['skillMdInspector/context'];
    const commands = items.map((item) => item.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        'skillMdInspector.validateCurrentSkill',
        'skillMdInspector.showSkillReport',
        'skillMdInspector.insertTemplate',
        'skillMdInspector.improveDescriptionLocally',
        'skillMdInspector.exportSkillsIndex',
        'skillMdInspector.refreshSkills',
        'skillMdInspector.toggleFavorite',
      ]),
    );
    // Workspace-wide and template-management commands were moved out of the per-file menu.
    for (const removed of [
      'skillMdInspector.validateWorkspaceSkills',
      'skillMdInspector.showWorkspaceReport',
      'skillMdInspector.openTemplateSettings',
      'skillMdInspector.resetTemplates',
    ]) {
      expect(commands).not.toContain(removed);
    }
    // Show Skill Report sits directly under Validate Current Skill (same group, consecutive order).
    const groupOf = Object.fromEntries(items.map((item) => [item.command, item.group]));
    expect(groupOf['skillMdInspector.validateCurrentSkill']).toBe('1_validation@1');
    expect(groupOf['skillMdInspector.showSkillReport']).toBe('1_validation@2');
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

  it('keeps online link checks opt-in and globally bounded per operation', () => {
    const properties = packageJson.contributes.configuration.properties;
    expect(properties['skillMdInspector.links.onlineCheck.enabled']).toMatchObject({
      type: 'boolean',
      default: false,
    });
    expect(properties['skillMdInspector.links.onlineCheck.enabled'].description).toContain(
      'sends HTTP requests',
    );
    expect(properties['skillMdInspector.links.onlineCheck.maxConcurrency']).toMatchObject({
      type: 'integer',
      default: 4,
      minimum: 1,
      maximum: 10,
    });
  });

  it('declares Explorer-like WORKSPACE toolbar and context actions without reusing Explorer internals', () => {
    const viewTitle = packageJson.contributes.menus['view/title'];
    expect(viewTitle).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.workspace.selectSkillsFolder',
        when: 'view == skillMdInspectorWorkspace',
        group: 'navigation@1',
      }),
    );
    expect(viewTitle).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.workspace.newFile',
        when: 'view == skillMdInspectorWorkspace',
        group: 'navigation@2',
      }),
    );
    expect(viewTitle).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.workspace.newFolder',
        when: 'view == skillMdInspectorWorkspace',
        group: 'navigation@3',
      }),
    );
    expect(viewTitle).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.refreshWorkspace',
        when: 'view == skillMdInspectorWorkspace',
        group: 'navigation@4',
      }),
    );

    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toEqual(
      expect.arrayContaining([
        'skillMdInspector.workspace.newFile',
        'skillMdInspector.workspace.newFolder',
        'skillMdInspector.workspace.selectSkillsFolder',
        'skillMdInspector.workspace.newFileContext',
        'skillMdInspector.workspace.newFolderContext',
        'skillMdInspector.workspace.openPreview',
        'skillMdInspector.workspace.openWith',
        'skillMdInspector.workspace.openImagesPreview',
        'skillMdInspector.workspace.selectForCompare',
        'skillMdInspector.workspace.compareWithSelected',
        'skillMdInspector.workspace.findFileReferences',
        'skillMdInspector.workspace.openTimeline',
        'skillMdInspector.workspace.findInFolder',
      ]),
    );

    const workspaceContexts = packageJson.contributes.menus['view/item/context'].filter((item) =>
      item.when?.includes('view == skillMdInspectorWorkspace'),
    );
    expect(workspaceContexts).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          command: 'skillMdInspector.workspace.openToSide',
          group: 'navigation@20',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.openWith',
          group: 'navigation@30',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.selectForCompare',
          group: '3_compare@10',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.findFileReferences',
          group: '4_search@10',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.openTimeline',
          group: '4_timeline@10',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.cut',
          group: '5_cutcopypaste@10',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.copyPath',
          group: '6_copypath@10',
        }),
        expect.objectContaining({
          command: 'skillMdInspector.workspace.renameContext',
          group: '7_modification@10',
        }),
        expect.objectContaining({
          submenu: 'skillMdInspector/skillItemContext',
          group: '9_inspector@10',
        }),
      ]),
    );
    expect(JSON.stringify(packageJson.contributes.menus['view/item/context'])).not.toContain(
      'explorer/context',
    );
    expect(JSON.stringify(workspaceContexts)).not.toMatch(/Maven|Java|Checkstyle/);
  });

  it('declares the Select SKILLs Folder command and WORKSPACE welcome action', () => {
    expect(packageJson.contributes.commands).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.workspace.selectSkillsFolder',
        title: 'Select SKILLs Folder',
        icon: '$(folder-opened)',
      }),
    );
    expect(packageJson.activationEvents).toContain(
      'onCommand:skillMdInspector.workspace.selectSkillsFolder',
    );
    expect(packageJson.contributes.viewsWelcome).toContainEqual({
      view: 'skillMdInspectorWorkspace',
      contents:
        'No SKILLs folder is selected.\n\n[Select SKILLs Folder](command:skillMdInspector.workspace.selectSkillsFolder)',
      when: 'workspaceFolderCount == 0',
    });
  });

  it('keeps WORKSPACE file, folder, and root menus scoped like VS Code Explorer', () => {
    const workspaceContexts = packageJson.contributes.menus['view/item/context'].filter((item) =>
      item.when?.includes('view == skillMdInspectorWorkspace'),
    );
    const fileWhen = (command: string) =>
      workspaceContexts.find(
        (item) => item.command === command && item.when?.includes('skillMdInspector.workspaceFile'),
      )?.when ?? '';
    const folderWhen = (command: string) =>
      workspaceContexts.find(
        (item) =>
          item.command === command && item.when?.includes('skillMdInspector.workspaceDirectory'),
      )?.when ?? '';
    const rootWhen = (command: string) =>
      workspaceContexts.find(
        (item) => item.command === command && item.when?.includes('skillMdInspector.workspaceRoot'),
      )?.when ?? '';

    expect(fileWhen('skillMdInspector.workspace.newFileContext')).toBe('');
    expect(fileWhen('skillMdInspector.workspace.newFolderContext')).toBe('');
    expect(fileWhen('skillMdInspector.workspace.paste')).toBe('');
    expect(fileWhen('skillMdInspector.workspace.openPreview')).toContain('resourceExtname == .md');
    expect(fileWhen('skillMdInspector.workspace.findFileReferences')).toContain(
      'resourceExtname == .md',
    );

    expect(folderWhen('skillMdInspector.workspace.newFileContext')).toContain(
      'skillMdInspector.workspaceDirectory',
    );
    expect(folderWhen('skillMdInspector.workspace.paste')).toContain(
      'skillMdInspector.workspaceClipboardHasItems',
    );
    expect(folderWhen('skillMdInspector.workspace.openPreview')).toBe('');
    expect(folderWhen('skillMdInspector.workspace.openWith')).toBe('');
    expect(folderWhen('skillMdInspector.workspace.openTimeline')).toBe('');

    expect(rootWhen('skillMdInspector.workspace.newFileContext')).toContain(
      'skillMdInspector.workspaceRoot',
    );
    expect(rootWhen('skillMdInspector.workspace.paste')).toContain(
      'skillMdInspector.workspaceClipboardHasItems',
    );
    expect(rootWhen('skillMdInspector.workspace.copyPath')).toContain(
      'skillMdInspector.workspaceRoot',
    );
    expect(rootWhen('skillMdInspector.workspace.renameContext')).toBe('');
    expect(rootWhen('skillMdInspector.workspace.delete')).toBe('');
  });

  it('declares dedicated SKILL.md tree item submenu conditions and contents', () => {
    const viewItems = packageJson.contributes.menus['view/item/context'];
    expect(viewItems).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/skillItemContext',
        when: 'view == skillMdInspectorWorkspace && (viewItem == skillMdInspector.skillFile || viewItem == skillMdInspector.favoriteSkillFile)',
        group: '9_inspector@10',
      }),
    );
    expect(viewItems).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/skillItemContext',
        when: 'view == skillMdInspectorFavorites && viewItem == skillMdInspector.favoriteSkillFile',
        group: '9_inspector@10',
      }),
    );
    expect(viewItems).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/skillItemContext',
        when: 'view == skillMdInspectorInstalledAgents && (viewItem == skillMdInspector.skillFile || viewItem == skillMdInspector.favoriteSkillFile)',
        group: '9_inspector@10',
      }),
    );
    expect(
      viewItems
        .filter((item) => item.submenu === 'skillMdInspector/skillItemContext')
        .map((item) => item.when)
        .join(' '),
    ).not.toContain('activeViewlet');

    const skillItemMenu = packageJson.contributes.menus['skillMdInspector/skillItemContext'];
    expect(skillItemMenu).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ command: 'skillMdInspector.validateCurrentSkill' }),
        expect.objectContaining({ command: 'skillMdInspector.insertTemplate' }),
        expect.objectContaining({ command: 'skillMdInspector.improveDescriptionLocally' }),
        expect.objectContaining({ command: 'skillMdInspector.showSkillReport' }),
        // The favorite action is aligned with the editor menu: a single toggle
        // ("Add or Remove Favorite") rather than a state-aware add/remove pair.
        expect.objectContaining({ command: 'skillMdInspector.toggleFavorite' }),
      ]),
    );
    const skillItemCommands = skillItemMenu.map((item) => item.command);
    expect(skillItemCommands).not.toContain('skillMdInspector.addToFavorites');
    expect(skillItemCommands).not.toContain('skillMdInspector.removeFromFavorites');
    expect(JSON.stringify(skillItemMenu)).not.toMatch(
      /canOpenWith|canOpenTimeline|canCompareFiles/,
    );
  });

  it('exposes the workspace commands via a folder submenu in the WORKSPACE view', () => {
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/workspaceFolderContext',
      label: 'SKILL.md Inspector',
    });
    const folderMenu = packageJson.contributes.menus['skillMdInspector/workspaceFolderContext'];
    expect(folderMenu.map((item) => item.command)).toEqual([
      'skillMdInspector.validateWorkspaceSkills',
      'skillMdInspector.showWorkspaceReport',
    ]);
    expect(packageJson.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/workspaceFolderContext',
        when: 'view == skillMdInspectorWorkspace && (viewItem == skillMdInspector.workspaceRoot || viewItem == skillMdInspector.workspaceDirectory)',
        group: '9_inspector@10',
      }),
    );
  });
});

describe('heuristic dictionary manifest consistency', () => {
  const properties = packageJson.contributes.configuration.properties as Record<
    string,
    { type?: string; scope?: string; default?: unknown; items?: { type?: string } }
  >;

  it('keeps every visible setting default exactly synchronized with the catalog', () => {
    for (const [key, value] of Object.entries(catalog)) {
      const setting = properties[`skillMdInspector.heuristics.dictionaryValues.${key}`];
      expect(setting, key).toBeDefined();
      expect(setting.default, key).toEqual(value);
      expect(setting.scope, key).toBe('resource');
      expect(setting.type, key).toBe(Array.isArray(value) ? 'array' : 'object');
      if (Array.isArray(value)) {
        expect(setting.items?.type, key).toBe('string');
        if (value.length > 0) expect(setting.default, key).not.toEqual([]);
      } else if (Object.keys(value).length > 0) {
        expect(setting.default, key).not.toEqual({});
      }
    }
  });

  it('declares the standard settings command', () => {
    expect(packageJson.contributes.commands).toContainEqual(
      expect.objectContaining({
        command: 'skillMdInspector.openHeuristicDictionarySettings',
        title: 'Open Heuristic Dictionary Settings',
      }),
    );
  });
});

describe('OpenCode manifest consistency', () => {
  const contributes = packageJson.contributes;
  const allViewIds = Object.values(contributes.views)
    .flat()
    .map((view) => view.id);
  const commandIds = contributes.commands.map((command) => command.command);
  const supportedBuiltInContainers = new Set(['explorer', 'scm', 'debug', 'test', 'extensions']);
  const contributedContainers = new Set(
    Object.values(contributes.viewsContainers)
      .flat()
      .map((container) => container.id),
  );

  it('declares created tree views in contributes.views', () => {
    expect(allViewIds).toEqual(
      expect.arrayContaining([
        'skillMdInspectorFavorites',
        'skillMdInspectorWorkspace',
        'skillMdInspectorInstalledAgents',
        'skillMdInspectorOpenCodeSessions',
        'skillMdInspectorSkills',
      ]),
    );
  });

  it('uses only supported view container contribution locations and no auxiliarybar', () => {
    expect(contributes.viewsContainers).not.toHaveProperty('auxiliarybar');
    expect(Object.keys(contributes.viewsContainers).sort()).toEqual(['activitybar', 'panel']);
    for (const containerId of Object.keys(contributes.views)) {
      expect(
        contributedContainers.has(containerId) || supportedBuiltInContainers.has(containerId),
      ).toBe(true);
    }
  });

  it('declares the OpenCode sessions view under the SKILL.md Inspector activity bar container', () => {
    expect(contributes.views.skillMdInspector).toContainEqual(
      expect.objectContaining({
        id: 'skillMdInspectorOpenCodeSessions',
        name: 'OPENCODE SESSIONS',
        contextualTitle: 'OpenCode Sessions',
      }),
    );
  });

  it('declares all registered OpenCode commands', () => {
    expect(commandIds).toEqual(
      expect.arrayContaining([
        'skillMdInspector.openCode.selectSessionsFolder',
        'skillMdInspector.openCode.clearSessionsFolder',
        'skillMdInspector.openCode.refreshSessions',
        'skillMdInspector.openCode.openReport',
        'skillMdInspector.openCode.openRawJson',
        'skillMdInspector.openCode.revealInOS',
        'skillMdInspector.openCode.copySessionId',
        'skillMdInspector.openCode.copyFilePath',
      ]),
    );
  });

  it('references only declared commands from menus and view welcomes', () => {
    const menuCommands = Object.values(contributes.menus)
      .flat()
      .map((item) => ('command' in item ? item.command : undefined))
      .filter((command): command is string => typeof command === 'string');
    expect(menuCommands.filter((command) => !commandIds.includes(command))).toEqual([]);
    const welcomeCommands = contributes.viewsWelcome.flatMap((welcome) =>
      [...welcome.contents.matchAll(/command:([^)\s]+)/g)].map((match) => match[1]),
    );
    expect(welcomeCommands).toContain('skillMdInspector.openCode.selectSessionsFolder');
    expect(welcomeCommands.filter((command) => !commandIds.includes(command))).toEqual([]);
  });

  it('activates for the OpenCode view and command palette entry points', () => {
    expect(packageJson.activationEvents).toEqual(
      expect.arrayContaining([
        'onView:skillMdInspectorOpenCodeSessions',
        'onCommand:skillMdInspector.openCode.selectSessionsFolder',
        'onCommand:skillMdInspector.openCode.openReport',
        'onCommand:skillMdInspector.openCode.openRawJson',
      ]),
    );
  });
});
