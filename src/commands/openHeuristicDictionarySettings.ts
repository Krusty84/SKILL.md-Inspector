import * as vscode from 'vscode';

/** Opens the standard Settings UI filtered to the visible heuristic dictionaries. */
export async function openHeuristicDictionarySettings(): Promise<void> {
  await vscode.commands.executeCommand(
    'workbench.action.openSettings',
    'skillMdInspector.heuristics.dictionaryValues',
  );
}
