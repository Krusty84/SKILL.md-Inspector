import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  commands: new Map<string, (...args: unknown[]) => unknown>(),
  state: { folders: [] as Array<{ uri: { toString(): string }; name: string; index: number }> },
  showOpenDialog: vi.fn(),
  showInformationMessage: vi.fn(),
  showErrorMessage: vi.fn(),
  updateWorkspaceFolders: vi.fn(),
}));

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly value: string) {}
    static parse(value: string): Uri { return new Uri(value); }
    static joinPath(parent: Uri, ...parts: string[]): Uri { return new Uri(`${parent.value.replace(/\/$/, '')}/${parts.join('/')}`); }
    toString(): string { return this.value; }
    get path(): string { return this.value.replace(/^\w+:\/\//, ''); }
    get fsPath(): string { return this.path; }
  }
  return {
    Uri,
    ViewColumn: { Beside: 2 },
    commands: {
      registerCommand: vi.fn((id: string, callback: (...args: unknown[]) => unknown) => { hoisted.commands.set(id, callback); return { dispose: vi.fn() }; }),
      executeCommand: vi.fn(),
    },
    window: {
      showOpenDialog: hoisted.showOpenDialog,
      showInformationMessage: hoisted.showInformationMessage,
      showErrorMessage: hoisted.showErrorMessage,
    },
    workspace: {
      get workspaceFolders() { return hoisted.state.folders; },
      updateWorkspaceFolders: hoisted.updateWorkspaceFolders,
      fs: { isWritableFileSystem: vi.fn(() => true) },
    },
  };
});

import * as vscode from 'vscode';
import { registerWorkspaceCommands } from '../src/commands/workspace/registerWorkspaceCommands';

function register(): (...args: unknown[]) => unknown {
  const context = { subscriptions: [] } as unknown as vscode.ExtensionContext;
  const view = { selection: [], onDidChangeSelection: vi.fn(() => ({ dispose: vi.fn() })) };
  const provider = {};
  const output = { appendLine: vi.fn() };
  registerWorkspaceCommands(context, { provider, view, output } as never);
  return hoisted.commands.get('skillMdInspector.workspace.selectSkillsFolder')!;
}

beforeEach(() => {
  hoisted.commands.clear();
  hoisted.state.folders = [];
  hoisted.showOpenDialog.mockReset();
  hoisted.showInformationMessage.mockReset();
  hoisted.showErrorMessage.mockReset();
  hoisted.updateWorkspaceFolders.mockReset().mockReturnValue(true);
});

describe('Select SKILLs Folder command', () => {
  it('opens a single-folder picker and adds the selected folder to the workspace', async () => {
    const selected = vscode.Uri.parse('file:///skills');
    hoisted.showOpenDialog.mockResolvedValue([selected]);

    await register()();

    expect(hoisted.showOpenDialog).toHaveBeenCalledWith({
      canSelectFiles: false,
      canSelectFolders: true,
      canSelectMany: false,
      openLabel: 'Select SKILLs Folder',
      title: 'Select SKILLs Folder',
    });
    expect(hoisted.updateWorkspaceFolders).toHaveBeenCalledWith(0, 0, { uri: selected });
  });

  it('does not duplicate an existing workspace folder', async () => {
    const selected = vscode.Uri.parse('file:///skills');
    hoisted.state.folders = [{ uri: selected, name: 'skills', index: 0 }];
    hoisted.showOpenDialog.mockResolvedValue([selected]);

    await register()();

    expect(hoisted.updateWorkspaceFolders).not.toHaveBeenCalled();
    expect(hoisted.showInformationMessage).toHaveBeenCalledWith('This folder is already open in the workspace.');
  });

  it('handles cancellation without changing the workspace', async () => {
    hoisted.showOpenDialog.mockResolvedValue(undefined);

    await register()();

    expect(hoisted.updateWorkspaceFolders).not.toHaveBeenCalled();
    expect(hoisted.showInformationMessage).not.toHaveBeenCalled();
  });
});
