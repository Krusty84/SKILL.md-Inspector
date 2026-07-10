import * as vscode from 'vscode';
import { DiagnosticsProvider } from './diagnostics/diagnosticsProvider';
import { SkillCodeActionProvider } from './codeActions/skillCodeActions';
import { registerCommands } from './commands';
import { isSkillFile } from './diagnostics/mapping';
import { readConfig } from './config';
import { SkillTreeProvider } from './ui/skillTreeProvider';

const CHANGE_DEBOUNCE_MS = 300;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new DiagnosticsProvider();
  context.subscriptions.push(provider);

  registerCommands(context, provider);

  const treeProvider = new SkillTreeProvider();
  const skillWatcher = vscode.workspace.createFileSystemWatcher('**/SKILL.md');
  skillWatcher.onDidCreate(() => treeProvider.refresh());
  skillWatcher.onDidDelete(() => treeProvider.refresh());
  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('skillMdInspectorSkills', treeProvider),
    vscode.commands.registerCommand('skillMdInspector.refreshSkills', () => treeProvider.refresh()),
    skillWatcher,
  );

  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      { language: 'markdown', scheme: 'file' },
      new SkillCodeActionProvider(),
      { providedCodeActionKinds: SkillCodeActionProvider.providedCodeActionKinds },
    ),
  );

  // Debounced re-validation while typing, keyed by document URI.
  const pending = new Map<string, ReturnType<typeof setTimeout>>();
  const scheduleValidate = (document: vscode.TextDocument): void => {
    if (!isSkillFile(document)) {
      return;
    }
    const key = document.uri.toString();
    const existing = pending.get(key);
    if (existing) {
      clearTimeout(existing);
    }
    pending.set(
      key,
      setTimeout(() => {
        pending.delete(key);
        provider.validate(document);
      }, CHANGE_DEBOUNCE_MS),
    );
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument((document) => provider.validate(document)),
    vscode.workspace.onDidChangeTextDocument((event) => scheduleValidate(event.document)),
    vscode.workspace.onDidSaveTextDocument((document) => {
      if (isSkillFile(document)) {
        if (readConfig(document.uri).runOnSave) {
          provider.validate(document);
        }
        treeProvider.refresh();
      }
    }),
    vscode.workspace.onDidCloseTextDocument((document) => {
      if (isSkillFile(document)) {
        provider.clear(document.uri);
      }
    }),
    vscode.workspace.onDidChangeConfiguration((event) => {
      if (event.affectsConfiguration('skillMdInspector')) {
        revalidateVisible(provider);
        treeProvider.refresh();
      }
    }),
    new vscode.Disposable(() => {
      for (const timer of pending.values()) {
        clearTimeout(timer);
      }
      pending.clear();
    }),
  );

  revalidateVisible(provider);
}

function revalidateVisible(provider: DiagnosticsProvider): void {
  for (const editor of vscode.window.visibleTextEditors) {
    provider.validate(editor.document);
  }
}

export function deactivate(): void {
  // Disposables registered on the extension context are cleaned up by VS Code.
}
