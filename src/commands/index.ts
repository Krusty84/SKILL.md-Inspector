import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';
import { validateCurrentSkill } from './validateCurrentSkill';
import { validateWorkspaceSkills } from './validateWorkspaceSkills';
import { insertTemplate } from './insertTemplate';
import { showSkillReport } from './showSkillReport';
import { improveDescriptionLocally } from './improveDescription';
import { showWorkspaceReport } from './showWorkspaceReport';
import { exportSkillsIndex } from './exportSkillsIndex';
import { openTemplateSettings } from './openTemplateSettings';
import { resetTemplates } from './resetTemplates';
import { openHeuristicDictionarySettings } from './openHeuristicDictionarySettings';

/** Registers all extension commands and ties their disposables to `context`. */
export function registerCommands(
  context: vscode.ExtensionContext,
  provider: DiagnosticsProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('skillMdInspector.validateCurrentSkill', (uri?: vscode.Uri) =>
      validateCurrentSkill(provider, uri),
    ),
    vscode.commands.registerCommand('skillMdInspector.validateWorkspaceSkills', () =>
      validateWorkspaceSkills(provider),
    ),
    vscode.commands.registerCommand('skillMdInspector.insertTemplate', (uri?: vscode.Uri) =>
      insertTemplate(uri),
    ),
    vscode.commands.registerCommand('skillMdInspector.showSkillReport', (uri?: vscode.Uri) =>
      showSkillReport(uri),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.improveDescriptionLocally',
      (uri?: vscode.Uri) => improveDescriptionLocally(uri),
    ),
    vscode.commands.registerCommand('skillMdInspector.showWorkspaceReport', () =>
      showWorkspaceReport(),
    ),
    vscode.commands.registerCommand('skillMdInspector.exportSkillsIndex', () =>
      exportSkillsIndex(),
    ),
    vscode.commands.registerCommand('skillMdInspector.openTemplateSettings', () =>
      openTemplateSettings(),
    ),
    vscode.commands.registerCommand('skillMdInspector.resetTemplates', (uri?: vscode.Uri) =>
      resetTemplates(uri),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.openHeuristicDictionarySettings',
      openHeuristicDictionarySettings,
    ),
  );
}
