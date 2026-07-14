import * as vscode from 'vscode';
import { parentUri } from '../../navigator/workspaceExplorer';
import type { WorkspaceExplorerNode } from '../../navigator/workspaceExplorerTypes';
import type { WorkspaceTreeProvider } from '../../ui/workspaceTreeProvider';
import { addFolders, selectSkillsFolder } from './addWorkspaceFolders';

export type WorkspaceCommandTarget = WorkspaceExplorerNode | vscode.Uri | undefined;

type WorkspaceClipboard = { operation: 'copy' | 'cut'; uris: vscode.Uri[] };

type Deps = { provider: WorkspaceTreeProvider; view: vscode.TreeView<WorkspaceExplorerNode | { type: 'message'; label: string }>; output: vscode.OutputChannel };

let clipboard: WorkspaceClipboard | undefined;

export function registerWorkspaceCommands(context: vscode.ExtensionContext, deps: Deps): void {
  const d = deps;
  context.subscriptions.push(
    vscode.commands.registerCommand('skillMdInspector.workspace.newFile', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => newEntry(d, 'file', target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.newFolder', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => newEntry(d, 'folder', target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.selectSkillsFolder', () => selectSkillsFolder(d.output)),
    vscode.commands.registerCommand('skillMdInspector.workspace.addFolders', () => addFolders(d.output)),
    vscode.commands.registerCommand('skillMdInspector.workspace.openFolderInNewWindow', (target?: WorkspaceCommandTarget) => openFolderInNewWindow(d, target)),
    vscode.commands.registerCommand('skillMdInspector.workspace.removeFolder', (target?: WorkspaceCommandTarget) => removeFolder(d, target)),
    vscode.commands.registerCommand('skillMdInspector.workspace.open', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => openFiles(d, false, target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.openToSide', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => openFiles(d, true, target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.rename', (target?: WorkspaceCommandTarget) => rename(d, target)),
    vscode.commands.registerCommand('skillMdInspector.workspace.delete', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => deleteTargets(d, target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.copy', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => setClipboard(d, 'copy', target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.cut', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => setClipboard(d, 'cut', target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.paste', (target?: WorkspaceCommandTarget) => paste(d, target)),
    vscode.commands.registerCommand('skillMdInspector.workspace.copyPath', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => copyPath(d, false, target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.copyRelativePath', (target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]) => copyPath(d, true, target, selected)),
    vscode.commands.registerCommand('skillMdInspector.workspace.openInTerminal', (target?: WorkspaceCommandTarget) => openTerminal(d, target)),
    vscode.commands.registerCommand('skillMdInspector.workspace.refreshFolder', (target?: WorkspaceCommandTarget) => refreshFolder(d, target)),
  );
  context.subscriptions.push(d.view.onDidChangeSelection((event) => {
    const uri = event.selection.filter(isExplorerNode).find(isResourceNode)?.uri;
    void vscode.commands.executeCommand('setContext', 'skillMdInspector.workspaceSelectionWritable', uri ? vscode.workspace.fs.isWritableFileSystem(uri.scheme) !== false : false);
  }));
  void vscode.commands.executeCommand('setContext', 'skillMdInspector.workspaceClipboardHasItems', false);
}

function resolveTargets(d: Deps, primary?: WorkspaceCommandTarget, selected?: readonly WorkspaceExplorerNode[]): WorkspaceExplorerNode[] {
  const base = selected?.length ? selected : d.view.selection.filter(isExplorerNode);
  const nodes = [...base];
  const primaryNode = primary instanceof vscode.Uri ? d.provider.getNodeForUri(primary) : primary;
  if (primaryNode && isExplorerNode(primaryNode) && isResourceNode(primaryNode) && !nodes.some((node) => isResourceNode(node) && key(node.uri) === key(primaryNode.uri))) nodes.unshift(primaryNode);
  return unique(nodes).filter((node) => node.type !== 'workspaceError');
}

async function resolveDestination(d: Deps, explicit?: WorkspaceExplorerNode, selection: readonly WorkspaceExplorerNode[] = []): Promise<vscode.Uri | undefined> {
  const explicitUri = destinationOf(explicit);
  if (explicitUri) return explicitUri;
  const selected = unique(selection).map(destinationOf).filter((uri): uri is vscode.Uri => !!uri);
  const dirs = uniqueUris(selected);
  if (dirs.length === 1) return dirs[0];
  if (dirs.length > 1) return pickUri('Select destination', dirs);
  const folders = vscode.workspace.workspaceFolders ?? [];
  if (folders.length === 1) return folders[0].uri;
  if (folders.length > 1) return pickUri('Select workspace folder', folders.map((folder) => folder.uri));
  await vscode.window.showInformationMessage('Add a folder to the workspace before creating files.');
  await addFolders(d.output);
  return undefined;
}

async function newEntry(d: Deps, kind: 'file' | 'folder', target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]): Promise<void> {
  const targets = resolveTargets(d, target, selected);
  const destination = await resolveDestination(d, targets[0], targets);
  if (!destination || !await writable(destination, `${kind === 'file' ? 'create a file' : 'create a folder'}`)) return;
  const value = (await vscode.window.showInputBox({ prompt: kind === 'file' ? 'File name' : 'Folder name' }))?.trim();
  if (value === undefined) return;
  const parsed = safeRelative(destination, value, true);
  if (!parsed.ok) { void vscode.window.showErrorMessage(parsed.message); return; }
  try {
    await vscode.workspace.fs.stat(parsed.uri);
    void vscode.window.showErrorMessage('A file or folder with this name already exists.');
    return;
  } catch { /* missing is expected */ }
  try {
    await vscode.workspace.fs.createDirectory(parentUri(parsed.uri));
    if (kind === 'file') await vscode.workspace.fs.writeFile(parsed.uri, new Uint8Array());
    else await vscode.workspace.fs.createDirectory(parsed.uri);
    d.provider.invalidate(destination); d.provider.refreshNode(d.provider.getNodeForUri(destination) ?? d.provider.getRootForUri(destination) ?? targets[0]);
    const node = d.provider.getNodeForUri(parsed.uri);
    if (node) await d.view.reveal(node, { select: true });
    if (kind === 'file') await vscode.commands.executeCommand('vscode.open', parsed.uri);
  } catch (error) { report(d.output, `Unable to create ${kind} “${value}”`, error); }
}

async function openFolderInNewWindow(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const node = target instanceof vscode.Uri ? d.provider.getNodeForUri(target) : target;
  let uri = destinationOf(node);
  if (!uri) uri = (await vscode.window.showOpenDialog({ canSelectFiles: false, canSelectFolders: true, canSelectMany: false, openLabel: 'Open', title: 'Open Folder in New Window' }))?.[0];
  if (uri) await vscode.commands.executeCommand('vscode.openFolder', uri, { forceNewWindow: true });
}

async function removeFolder(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const node = target instanceof vscode.Uri ? d.provider.getRootForUri(target) : target;
  if (!node || node.type !== 'workspaceRoot') return;
  const choice = await vscode.window.showWarningMessage(`Remove “${node.folder.name}” from the workspace?`, { modal: true }, 'Remove Folder');
  if (choice !== 'Remove Folder') return;
  try { if (!vscode.workspace.updateWorkspaceFolders(node.folder.index, 1)) throw new Error('VS Code rejected the workspace folder update.'); }
  catch (error) { report(d.output, `Unable to remove “${node.folder.name}”`, error); }
}

async function openFiles(d: Deps, side: boolean, target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]): Promise<void> {
  for (const node of resolveTargets(d, target, selected).filter((n) => n.type === 'workspaceFile')) await vscode.commands.executeCommand('vscode.open', node.uri, ...(side ? [vscode.ViewColumn.Beside] : []));
}

async function rename(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const node = (target instanceof vscode.Uri ? d.provider.getNodeForUri(target) : target);
  if (!node || node.type === 'workspaceRoot' || node.type === 'workspaceError') return;
  if (!await writable(node.uri, 'rename')) return;
  const name = (await vscode.window.showInputBox({ prompt: 'New name', value: node.name }))?.trim();
  if (name === undefined) return;
  if (!name || name === '.' || name === '..' || /[\\/]/.test(name)) { void vscode.window.showErrorMessage('Invalid filename.'); return; }
  const targetUri = vscode.Uri.joinPath(node.parentUri, name);
  try { await vscode.workspace.fs.stat(targetUri); void vscode.window.showErrorMessage('A file or folder with this name already exists.'); return; } catch { /* expected */ }
  try {
    await vscode.workspace.fs.rename(node.uri, targetUri, { overwrite: false });
    d.provider.invalidate(node.parentUri); d.provider.refresh();
    const renamed = d.provider.getNodeForUri(targetUri); if (renamed) await d.view.reveal(renamed, { select: true });
  } catch (error) { report(d.output, `Unable to rename “${node.name}”`, error); }
}

async function deleteTargets(d: Deps, target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]): Promise<void> {
  const targets = pruneNested(resolveTargets(d, target, selected).filter((node) => node.type !== 'workspaceRoot' && node.type !== 'workspaceError')); 
  if (targets.length === 0) return;
  const label = targets.length === 1 ? `“${targets[0].name}”` : `${targets.length} selected items`;
  const choice = await vscode.window.showWarningMessage(`Move ${label} to Trash?`, { modal: true }, 'Move to Trash');
  if (choice !== 'Move to Trash') return;
  const parents = new Set<string>();
  for (const node of targets) {
    if (!await writable(node.uri, 'delete')) continue;
    try { await vscode.workspace.fs.delete(node.uri, { recursive: true, useTrash: true }); parents.add(key(node.parentUri)); }
    catch (error) { report(d.output, `Unable to delete “${node.name}”`, error); }
  }
  for (const p of parents) d.provider.invalidate(vscode.Uri.parse(p));
  d.provider.refresh();
}

async function setClipboard(d: Deps, operation: 'copy' | 'cut', target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]): Promise<void> {
  clipboard = { operation, uris: pruneNested(resolveTargets(d, target, selected).filter(isResourceNode)).map((node) => node.uri) };
  await vscode.commands.executeCommand('setContext', 'skillMdInspector.workspaceClipboardHasItems', clipboard.uris.length > 0);
}

async function paste(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  if (!clipboard?.uris.length) return;
  const node = target instanceof vscode.Uri ? d.provider.getNodeForUri(target) ?? d.provider.getRootForUri(target) : target;
  const dest = destinationOf(node);
  if (!dest || !await writable(dest, 'paste')) return;
  const remaining: vscode.Uri[] = [];
  for (const source of clipboard.uris) {
    const targetUri = vscode.Uri.joinPath(dest, basename(source));
    if (isSameOrDescendant(dest, source)) { void vscode.window.showErrorMessage('Cannot paste a folder into itself or one of its descendants.'); remaining.push(source); continue; }
    let overwrite = false;
    try {
      await vscode.workspace.fs.stat(targetUri);
      const choice = await vscode.window.showWarningMessage(`“${basename(source)}” already exists.`, 'Skip', 'Replace', 'Cancel');
      if (choice === 'Cancel' || !choice) { remaining.push(source, ...clipboard.uris.slice(clipboard.uris.indexOf(source) + 1)); break; }
      if (choice === 'Skip') { remaining.push(source); continue; }
      overwrite = true;
    } catch { /* no conflict */ }
    try {
      if (clipboard.operation === 'copy') await vscode.workspace.fs.copy(source, targetUri, { overwrite });
      else await vscode.workspace.fs.rename(source, targetUri, { overwrite });
      d.provider.invalidate(dest); d.provider.invalidateParent(source);
    } catch (error) { remaining.push(source); report(d.output, `Unable to paste “${basename(source)}”`, error); }
  }
  if (clipboard.operation === 'cut') clipboard = remaining.length ? { operation: 'cut', uris: remaining } : undefined;
  await vscode.commands.executeCommand('setContext', 'skillMdInspector.workspaceClipboardHasItems', !!clipboard?.uris.length);
  d.provider.refresh();
}

async function copyPath(d: Deps, relative: boolean, target?: WorkspaceCommandTarget, selected?: WorkspaceExplorerNode[]): Promise<void> {
  const text = resolveTargets(d, target, selected).filter(isResourceNode).map((node) => relative ? vscode.workspace.asRelativePath(node.uri, true) : node.uri.scheme === 'file' ? node.uri.fsPath : node.uri.toString()).join('\n');
  if (text) await vscode.env.clipboard.writeText(text);
}

async function openTerminal(d: Deps, target?: WorkspaceCommandTarget): Promise<void> {
  const node = target instanceof vscode.Uri ? d.provider.getNodeForUri(target) ?? d.provider.getRootForUri(target) : target;
  const cwd = destinationOf(node);
  if (!cwd) return;
  try { const terminal = vscode.window.createTerminal({ cwd }); terminal.show(); }
  catch (error) { report(d.output, 'Unable to open integrated terminal here', error); }
}

function refreshFolder(d: Deps, target?: WorkspaceCommandTarget): void {
  const node = target instanceof vscode.Uri ? d.provider.getNodeForUri(target) ?? d.provider.getRootForUri(target) : target;
  if (node && (node.type === 'workspaceRoot' || node.type === 'workspaceDirectory')) { d.provider.invalidate(node.uri); d.provider.refreshNode(node); }
}

function destinationOf(node: WorkspaceCommandTarget): vscode.Uri | undefined {
  if (node instanceof vscode.Uri) return node;
  if (!node || node.type === 'workspaceError') return undefined;
  if (node.type === 'workspaceRoot' || node.type === 'workspaceDirectory') return node.uri;
  return node.parentUri;
}

function safeRelative(base: vscode.Uri, value: string, allowNested: boolean): { ok: true; uri: vscode.Uri } | { ok: false; message: string } {
  if (!value || value === '.' || value === '..') return { ok: false, message: 'Invalid filename.' };
  if (/^([a-zA-Z][a-zA-Z0-9+.-]*:|[\\/])/.test(value)) return { ok: false, message: 'Absolute paths are not allowed.' };
  if (!allowNested && /[\\/]/.test(value)) return { ok: false, message: 'Path separators are not allowed.' };
  const parts = value.split(/[\\/]+/).filter(Boolean);
  if (parts.some((part) => part === '.' || part === '..')) return { ok: false, message: 'Path traversal is not allowed.' };
  const uri = vscode.Uri.joinPath(base, ...parts);
  return isSameOrDescendant(uri, base) ? { ok: true, uri } : { ok: false, message: 'Path traversal is not allowed.' };
}

async function writable(uri: vscode.Uri, action: string): Promise<boolean> {
  if (vscode.workspace.fs.isWritableFileSystem(uri.scheme) === false) { void vscode.window.showErrorMessage(`Unable to ${action}: the filesystem is read-only.`); return false; }
  return true;
}

function isExplorerNode(value: unknown): value is WorkspaceExplorerNode { return !!value && typeof value === 'object' && 'type' in value && String((value as { type: string }).type).startsWith('workspace'); }
function isResourceNode(node: WorkspaceExplorerNode): node is Exclude<WorkspaceExplorerNode, { type: 'workspaceError' }> { return node.type !== 'workspaceError'; }
function unique(nodes: readonly WorkspaceExplorerNode[]): WorkspaceExplorerNode[] { const seen = new Set<string>(); return nodes.filter((node) => { const k = isResourceNode(node) ? key(node.uri) : node.id; if (seen.has(k)) return false; seen.add(k); return true; }); }
function uniqueUris(uris: readonly vscode.Uri[]): vscode.Uri[] { const seen = new Set<string>(); return uris.filter((uri) => { const k = key(uri); if (seen.has(k)) return false; seen.add(k); return true; }); }
function pruneNested<T extends { uri: vscode.Uri }>(nodes: readonly T[]): T[] { return nodes.filter((node, index) => nodes.findIndex((other) => key(other.uri) === key(node.uri)) === index).filter((node) => !nodes.some((other) => key(other.uri) !== key(node.uri) && isSameOrDescendant(node.uri, other.uri))); }
function isSameOrDescendant(uri: vscode.Uri, ancestor: vscode.Uri): boolean { const u = key(uri); const a = key(ancestor); return u === a || u.startsWith(a.endsWith('/') ? a : `${a}/`); }
function key(uri: vscode.Uri): string { return uri.toString(); }
function basename(uri: vscode.Uri): string { return uri.path.split('/').filter(Boolean).pop() ?? uri.toString(); }
async function pickUri(title: string, uris: vscode.Uri[]): Promise<vscode.Uri | undefined> { const picked = await vscode.window.showQuickPick(uris.map((uri) => ({ label: basename(uri), description: uri.toString(), uri })), { title }); return picked?.uri; }
function report(output: vscode.OutputChannel, message: string, error: unknown): void { output.appendLine(`${message}: ${String(error)}`); void vscode.window.showErrorMessage(`${message}: ${error instanceof Error ? error.message : String(error)}`); }
