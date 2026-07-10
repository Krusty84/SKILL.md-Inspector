import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../diagnostics/diagnosticsProvider';
import { validateCurrentSkill } from './validateCurrentSkill';
import { validateWorkspaceSkills } from './validateWorkspaceSkills';
import { insertTemplate } from './insertTemplate';
import { showSkillReport } from './showSkillReport';
import { improveDescriptionLocally } from './improveDescription';
import { showWorkspaceReport } from './showWorkspaceReport';
import { exportSkillsIndex } from './exportSkillsIndex';

/** Registers all extension commands and ties their disposables to `context`. */
export function registerCommands(
  context: vscode.ExtensionContext,
  provider: DiagnosticsProvider,
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand('skillMdInspector.validateCurrentSkill', () =>
      validateCurrentSkill(provider),
    ),
    vscode.commands.registerCommand('skillMdInspector.validateWorkspaceSkills', () =>
      validateWorkspaceSkills(provider),
    ),
    vscode.commands.registerCommand('skillMdInspector.insertTemplate', () => insertTemplate()),
    vscode.commands.registerCommand('skillMdInspector.showSkillReport', () => showSkillReport()),
    vscode.commands.registerCommand('skillMdInspector.improveDescriptionLocally', () =>
      improveDescriptionLocally(),
    ),
    vscode.commands.registerCommand('skillMdInspector.showWorkspaceReport', () =>
      showWorkspaceReport(),
    ),
    vscode.commands.registerCommand('skillMdInspector.exportSkillsIndex', () => exportSkillsIndex()),
  );
}
