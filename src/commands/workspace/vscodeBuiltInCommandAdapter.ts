import * as vscode from 'vscode';

export const builtInCommandIds = {
  openMarkdownPreview: 'markdown.showPreview',
  findMarkdownFileReferences: 'markdown.findAllFileReferences',
  openWith: 'explorer.openWith',
  revealInOS: 'revealFileInOS',
  selectForCompare: 'selectForCompare',
  compareFiles: 'compareFiles',
  openTimeline: 'files.openTimeline',
  openImagesPreview: 'workbench.action.openImagesInCarousel',
  findInFiles: 'workbench.action.findInFiles',
} as const;

export type BuiltInCommandId = typeof builtInCommandIds[keyof typeof builtInCommandIds];

export interface BuiltInCommandAdapter {
  isAvailable(commandId: BuiltInCommandId): boolean;
  execute(commandId: BuiltInCommandId, ...args: unknown[]): Thenable<unknown>;
}

export type WorkspaceContextCapability = {
  commandId: BuiltInCommandId;
  contextKey: string;
  label: string;
};

export const workspaceContextCapabilities: readonly WorkspaceContextCapability[] = [
  { commandId: builtInCommandIds.openMarkdownPreview, contextKey: 'skillMdInspector.canOpenMarkdownPreview', label: 'Markdown preview' },
  { commandId: builtInCommandIds.findMarkdownFileReferences, contextKey: 'skillMdInspector.canFindMarkdownFileReferences', label: 'Markdown file references' },
  { commandId: builtInCommandIds.openWith, contextKey: 'skillMdInspector.canOpenWith', label: 'Open With' },
  { commandId: builtInCommandIds.revealInOS, contextKey: 'skillMdInspector.canRevealInOS', label: 'Reveal in OS' },
  { commandId: builtInCommandIds.compareFiles, contextKey: 'skillMdInspector.canCompareFiles', label: 'file compare' },
  { commandId: builtInCommandIds.openTimeline, contextKey: 'skillMdInspector.canOpenTimeline', label: 'Timeline' },
  { commandId: builtInCommandIds.openImagesPreview, contextKey: 'skillMdInspector.canOpenImagesPreview', label: 'Images Preview' },
];

export async function createBuiltInCommandAdapter(output: vscode.OutputChannel): Promise<BuiltInCommandAdapter> {
  const availableCommands = new Set(await vscode.commands.getCommands(true));
  for (const capability of workspaceContextCapabilities) {
    const available = availableCommands.has(capability.commandId);
    await vscode.commands.executeCommand('setContext', capability.contextKey, available);
    if (!available) output.appendLine(`Optional WORKSPACE context action unavailable: ${capability.label} (${capability.commandId}).`);
  }
  return {
    isAvailable: (commandId) => availableCommands.has(commandId),
    execute: (commandId, ...args) => vscode.commands.executeCommand(commandId, ...args),
  };
}

export async function executeOptionalBuiltIn(adapter: BuiltInCommandAdapter, commandId: BuiltInCommandId, unavailableMessage: string, ...args: unknown[]): Promise<unknown> {
  if (!adapter.isAvailable(commandId)) {
    void vscode.window.showWarningMessage(unavailableMessage);
    return undefined;
  }
  return adapter.execute(commandId, ...args);
}
