import { describe, expect, it } from 'vitest';
import packageJson from '../package.json';
import catalog from '../src/quality/defaultHeuristicDictionaries.json';

// `contributes.configuration` is an array of titled categories (labeled sections in
// the Settings UI); merge their property maps so a setting can be looked up by id
// regardless of which section it lives in.
const configProperties = Object.assign(
  {},
  ...packageJson.contributes.configuration.map((category) => category.properties),
) as Record<string, any>;

describe('package manifest context menus and templates', () => {
  it('declares the SKILL.md Inspector submenu in editor and explorer contexts', () => {
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/context',
      label: 'SKILL.md Inspector',
    });
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/workspaceFileSkillContext',
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
    const setting = configProperties['skillMdInspector.templates'];
    expect(setting.items.properties).toHaveProperty('frontmatter');
    expect(setting.items.properties).toHaveProperty('body');
    expect(setting.items.properties).not.toHaveProperty('content');
    const commands = packageJson.contributes.commands.map((command) => command.command);
    expect(commands).toContain('skillMdInspector.openTemplateSettings');
    expect(commands).toContain('skillMdInspector.resetTemplates');
  });

  it('groups settings into ordered, labeled Settings-UI sections', () => {
    // VS Code renders each `contributes.configuration` entry as a labeled section,
    // sequenced by the entry's `order`. Pin the sections and their members so the
    // grouping cannot silently regress.
    const configuration = packageJson.contributes.configuration as unknown as ReadonlyArray<{
      title: string;
      order: number;
      properties: Record<string, { order?: number }>;
    }>;
    const H = 'skillMdInspector.heuristics.dictionaryValues.';
    const expected = [
      {
        title: 'Validation',
        order: 1,
        keys: [
          'skillMdInspector.validation.enabled',
          'skillMdInspector.validation.runOnSave',
          'skillMdInspector.profile',
        ],
      },
      {
        title: 'Heuristics',
        order: 2,
        keys: [
          `${H}acronyms`,
          `${H}actionVerbForms`,
          `${H}actionVerbs`,
          `${H}artifactHints`,
          `${H}artifactSupportTerms`,
          `${H}collisionStopwords`,
          `${H}exclusiveTriggerPhrases`,
          `${H}frontLoadedFillerTerms`,
          `${H}irregularSingularForms`,
          `${H}lowSignalArtifactTerms`,
          `${H}multiWordArtifacts`,
          `${H}negativeBoundaryPhrases`,
          `${H}overbroadTriggerPhrases`,
          `${H}positiveTriggerPhrases`,
          `${H}restrictiveBoundaryPhrases`,
          `${H}scopeStopwords`,
          `${H}scopeVagueTerms`,
          `${H}uppercaseOnlyAcronyms`,
          `${H}vagueTerms`,
        ],
      },
      {
        title: 'Discovery & resources',
        order: 3,
        keys: [
          'skillMdInspector.discovery.exclude',
          'skillMdInspector.resources.directories',
          'skillMdInspector.resources.exclude',
        ],
      },
      {
        title: 'Severity',
        order: 4,
        keys: [
          'skillMdInspector.severityOverrides',
          'skillMdInspector.severity.allowSpecificationOverrides',
        ],
      },
      { title: 'Templates', order: 5, keys: ['skillMdInspector.templates'] },
      {
        title: 'Content quality',
        order: 6,
        keys: [
          'skillMdInspector.body.strictness',
          'skillMdInspector.description.language',
          'skillMdInspector.description.maxLength',
          'skillMdInspector.description.minLength',
          'skillMdInspector.name.maxLength',
        ],
      },
      {
        title: 'Collision detection',
        order: 7,
        keys: [
          'skillMdInspector.collision.boundarySeparationWeight',
          'skillMdInspector.collision.ngramSize',
          'skillMdInspector.collision.threshold',
          'skillMdInspector.collision.weights',
          'skillMdInspector.names.similarityThreshold',
        ],
      },
      {
        title: 'Links',
        order: 8,
        keys: [
          'skillMdInspector.links.onlineCheck.enabled',
          'skillMdInspector.links.onlineCheck.maxConcurrency',
        ],
      },
      {
        title: 'Views',
        order: 9,
        keys: [
          'skillMdInspector.navigator.additionalRoots',
          'skillMdInspector.openCode.maxDiscoveredSessions',
          'skillMdInspector.openCode.maxPreviewCharacters',
          'skillMdInspector.openCode.maxSessionFileSizeMb',
          'skillMdInspector.openCode.scanRecursively',
        ],
      },
      {
        title: 'Experimental',
        order: 10,
        keys: ['skillMdInspector.experimental.llmReview.enabled'],
      },
    ];
    // Sections appear in the declared order with ascending `order`.
    expect(configuration.map((category) => ({ title: category.title, order: category.order }))).toEqual(
      expected.map((entry) => ({ title: entry.title, order: entry.order })),
    );
    // Each section contains exactly its settings (membership, order-independent).
    expected.forEach((entry, index) => {
      expect(Object.keys(configuration[index].properties).sort()).toEqual([...entry.keys].sort());
    });
    // Validation keeps the enable toggles above the Profile selector.
    const validation = configuration[0].properties;
    expect(validation['skillMdInspector.validation.enabled'].order).toBe(1);
    expect(validation['skillMdInspector.validation.runOnSave'].order).toBe(2);
    expect(validation['skillMdInspector.profile'].order).toBe(3);
    // Every setting lives in exactly one section (46 total, no duplicates).
    const allKeys = configuration.flatMap((category) => Object.keys(category.properties));
    expect(allKeys.length).toBe(46);
    expect(new Set(allKeys).size).toBe(46);
  });

  it('keeps online link checks opt-in and globally bounded per operation', () => {
    const properties = configProperties;
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
          submenu: 'skillMdInspector/workspaceFileSkillContext',
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
        submenu: 'skillMdInspector/workspaceFileSkillContext',
        when: 'view == skillMdInspectorWorkspace && (viewItem == skillMdInspector.skillFile || viewItem == skillMdInspector.favoriteSkillFile)',
        group: '9_inspector@10',
      }),
    );
    expect(viewItems).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/favoriteSkillContext',
        when: 'view == skillMdInspectorFavorites && viewItem == skillMdInspector.favoriteSkillFile',
        group: '9_inspector@10',
      }),
    );
    expect(
      viewItems
        .filter((item) => item.submenu === 'skillMdInspector/workspaceFileSkillContext')
        .map((item) => item.when)
        .join(' '),
    ).not.toContain('activeViewlet');

    const skillItemMenu = packageJson.contributes.menus['skillMdInspector/workspaceFileSkillContext'];
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
      id: 'skillMdInspector/workspaceFolderSkillContext',
      label: 'SKILL.md Inspector',
    });
    const folderMenu = packageJson.contributes.menus['skillMdInspector/workspaceFolderSkillContext'];
    expect(folderMenu.map((item) => item.command)).toEqual([
      'skillMdInspector.validateWorkspaceSkills',
      'skillMdInspector.showWorkspaceReport',
    ]);
    expect(packageJson.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/workspaceFolderSkillContext',
        when: 'view == skillMdInspectorWorkspace && (viewItem == skillMdInspector.workspaceRoot || viewItem == skillMdInspector.workspaceDirectory)',
        group: '9_inspector@10',
      }),
    );
  });

  it('gives the INSTALLED AGENTS view a trimmed SKILL.md file submenu and the folder submenu', () => {
    // File case: only Validate Current SKILL.md, Show SKILL.md Report, Add or Remove Favorite.
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/installedAgentsFileSkillContext',
      label: 'SKILL.md Inspector',
    });
    const installedSkillMenu =
      packageJson.contributes.menus['skillMdInspector/installedAgentsFileSkillContext'];
    expect(installedSkillMenu.map((item) => item.command)).toEqual([
      'skillMdInspector.validateCurrentSkill',
      'skillMdInspector.showSkillReport',
      'skillMdInspector.toggleFavorite',
    ]);
    expect(packageJson.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/installedAgentsFileSkillContext',
        when: 'view == skillMdInspectorInstalledAgents && (viewItem == skillMdInspector.skillFile || viewItem == skillMdInspector.favoriteSkillFile)',
        group: '9_inspector@10',
      }),
    );

    // Folder case: every folder-looking row (agent, group, skill, nested subfolder) gets the
    // installed folder submenu.
    expect(packageJson.contributes.menus['view/item/context']).toContainEqual(
      expect.objectContaining({
        submenu: 'skillMdInspector/installedAgentsFolderSkillContext',
        when: 'view == skillMdInspectorInstalledAgents && (viewItem == skillMdInspector.agent || viewItem == skillMdInspector.agentGroup || viewItem == skillMdInspector.skillFolder || viewItem == skillMdInspector.installedAgentsDirectory)',
        group: '9_inspector@10',
      }),
    );
  });

  it('gives FAVORITES files and INSTALLED folders their own submenus, with no duplicate ids', () => {
    // Favorites files: own submenu, same 5 commands as workspace files.
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/favoriteSkillContext',
      label: 'SKILL.md Inspector',
    });
    expect(
      packageJson.contributes.menus['skillMdInspector/favoriteSkillContext'].map(
        (item) => item.command,
      ),
    ).toEqual([
      'skillMdInspector.validateCurrentSkill',
      'skillMdInspector.insertTemplate',
      'skillMdInspector.improveDescriptionLocally',
      'skillMdInspector.showSkillReport',
      'skillMdInspector.toggleFavorite',
    ]);

    // Installed folders: own submenu wired to the installed-scope commands (which act on the
    // clicked row's skills, not the workspace).
    expect(packageJson.contributes.submenus).toContainEqual({
      id: 'skillMdInspector/installedAgentsFolderSkillContext',
      label: 'SKILL.md Inspector',
    });
    expect(
      packageJson.contributes.menus['skillMdInspector/installedAgentsFolderSkillContext'].map(
        (item) => item.command,
      ),
    ).toEqual([
      'skillMdInspector.installedAgents.validateSkills',
      'skillMdInspector.installedAgents.showReport',
    ]);

    // Regression guard: VS Code drops a submenu contributed to view/item/context more than once
    // (that duplicate silently broke the installed-folder and favorites menus).
    const submenuIds = packageJson.contributes.menus['view/item/context']
      .filter((item) => item.submenu)
      .map((item) => item.submenu);
    expect(new Set(submenuIds).size).toBe(submenuIds.length);
  });
});

describe('heuristic dictionary manifest consistency', () => {
  const properties = configProperties;

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
