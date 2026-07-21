import * as vscode from 'vscode';
import type { DiagnosticsProvider } from '../../diagnostics/diagnosticsProvider';
import type {
  InstalledAgentsNode,
  InstalledAgentsTreeProvider,
} from '../../ui/installedAgentsTreeProvider';
import { validateInstalledSkills } from './validateInstalledSkills';
import { showInstalledReport } from './showInstalledReport';

export const INSTALLED_AGENTS_COMMAND_IDS = [
  'skillMdInspector.installedAgents.validateSkills',
  'skillMdInspector.installedAgents.showReport',
] as const;

/**
 * Registers the INSTALLED AGENTS folder context-menu commands. They receive the
 * clicked tree node and act on that node's scope, so the handlers need both the
 * installed provider (to resolve the scope) and the diagnostics provider.
 */
export function registerInstalledAgentsCommands(
  context: vscode.ExtensionContext,
  deps: {
    installedProvider: InstalledAgentsTreeProvider;
    diagnostics: DiagnosticsProvider;
  },
): void {
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillMdInspector.installedAgents.validateSkills',
      (node?: InstalledAgentsNode) =>
        validateInstalledSkills(deps.installedProvider, deps.diagnostics, node),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.installedAgents.showReport',
      (node?: InstalledAgentsNode) => showInstalledReport(deps.installedProvider, node),
    ),
  );
}
