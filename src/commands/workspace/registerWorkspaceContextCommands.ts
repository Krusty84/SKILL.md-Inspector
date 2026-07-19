import * as vscode from 'vscode';
import type { WorkspaceExplorerNode } from '../../navigator/workspaceExplorerTypes';
import type { WorkspaceTreeProvider } from '../../ui/workspaceTreeProvider';
import {
  builtInCommandIds,
  executeOptionalBuiltIn,
  type BuiltInCommandAdapter,
} from './vscodeBuiltInCommandAdapter';
import { WorkspaceCommandTarget } from './registerWorkspaceCommands';

type Deps = { provider: WorkspaceTreeProvider; adapter: BuiltInCommandAdapter };

let compareSource: vscode.Uri | undefined;

export function registerWorkspaceContextCommands(
  context: vscode.ExtensionContext,
  deps: Deps,
): void {
  const d = deps;
  context.subscriptions.push(
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.newFileContext',
      (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) =>
        vscode.commands.executeCommand('skillMdInspector.workspace.newFile', target, selected),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.newFolderContext',
      (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) =>
        vscode.commands.executeCommand('skillMdInspector.workspace.newFolder', target, selected),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.renameContext',
      (target?: WorkspaceCommandTarget) =>
        vscode.commands.executeCommand('skillMdInspector.workspace.rename', target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.openPreview',
      (target?: WorkspaceCommandTarget) => openPreview(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.openWith',
      (target?: WorkspaceCommandTarget) => openWith(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.revealInOS',
      (target?: WorkspaceCommandTarget) => revealInOS(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.revealInOS.windows',
      (target?: WorkspaceCommandTarget) => revealInOS(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.revealInOS.mac',
      (target?: WorkspaceCommandTarget) => revealInOS(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.revealInOS.linux',
      (target?: WorkspaceCommandTarget) => revealInOS(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.openImagesPreview',
      (target?: WorkspaceCommandTarget) => openImagesPreview(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.selectForCompare',
      (target?: WorkspaceCommandTarget) => selectForCompare(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.compareWithSelected',
      (target?: WorkspaceCommandTarget) => compareWithSelected(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.findFileReferences',
      (target?: WorkspaceCommandTarget) => findFileReferences(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.openTimeline',
      (target?: WorkspaceCommandTarget) => openTimeline(d, target),
    ),
    vscode.commands.registerCommand(
      'skillMdInspector.workspace.findInFolder',
      (target?: WorkspaceCommandTarget) => findInFolder(d, target),
    ),
  );
  void vscode.commands.executeCommand(
    'setContext',
    'skillMdInspector.workspaceHasCompareSource',
    false,
  );
}

async function openPreview(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = resourceUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.openMarkdownPreview,
    'Markdown Preview is not available.',
    uri,
  );
}
async function openWith(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = resourceUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.openWith,
    'Open With is not available.',
    uri,
  );
}
async function revealInOS(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = resourceUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.revealInOS,
    'Reveal in OS is not available for this resource.',
    uri,
  );
}
async function openImagesPreview(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = resourceUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.openImagesPreview,
    'Images Preview is not available.',
    uri,
  );
}
async function selectForCompare(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = fileUri(d, target);
  if (!uri) return;
  compareSource = uri;
  await vscode.commands.executeCommand(
    'setContext',
    'skillMdInspector.workspaceHasCompareSource',
    true,
  );
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.selectForCompare,
    'Select for Compare is not available.',
    uri,
  );
}
async function compareWithSelected(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = fileUri(d, target);
  if (!uri || !compareSource) return;
  await vscode.commands.executeCommand(
    'vscode.diff',
    compareSource,
    uri,
    `${basename(compareSource)} ↔ ${basename(uri)}`,
  );
}
async function findFileReferences(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = fileUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.findMarkdownFileReferences,
    'Markdown file references are not available.',
    uri,
  );
}
async function openTimeline(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = fileUri(d, target);
  if (!uri) return;
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.openTimeline,
    'Timeline is not available.',
    uri,
  );
}
async function findInFolder(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const uri = folderUri(d, target);
  if (!uri) return;
  const folder = vscode.workspace.getWorkspaceFolder(uri);
  const filesToInclude = folder
    ? vscode.workspace.asRelativePath(uri, false) || './'
    : uri.toString();
  await executeOptionalBuiltIn(
    d.adapter,
    builtInCommandIds.findInFiles,
    'Find in Files is not available.',
    { filesToInclude, triggerSearch: true },
  );
}

function resourceUri(_d: Deps, target?: WorkspaceCommandTarget): vscode.Uri | undefined {
  return target instanceof vscode.Uri ? target : target && 'uri' in target ? target.uri : undefined;
}
function fileUri(d: Deps, target?: WorkspaceCommandTarget): vscode.Uri | undefined {
  const node = target instanceof vscode.Uri ? d.provider.getNodeForUri(target) : target;
  return node?.type === 'workspaceFile' ? node.uri : undefined;
}
function folderUri(d: Deps, target?: WorkspaceCommandTarget): vscode.Uri | undefined {
  const node =
    target instanceof vscode.Uri
      ? (d.provider.getNodeForUri(target) ?? d.provider.getRootForUri(target))
      : target;
  return node?.type === 'workspaceRoot' || node?.type === 'workspaceDirectory'
    ? node.uri
    : undefined;
}
function basename(uri: vscode.Uri): string {
  return uri.path.split('/').filter(Boolean).pop() ?? uri.toString();
}
