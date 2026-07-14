import { existsSync } from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import * as vscode from 'vscode';
import { resolveBuiltInAgentSources } from '../navigator/builtInAgentSources';
import { discoverExternalFiles } from '../navigator/discoverExternalFiles';
import { expandConfiguredPath } from '../navigator/expandConfiguredPath';
import { normalizeAdditionalRoots } from '../navigator/normalizeAdditionalRoots';
import { FAVORITES_KEY, restoreFavorites } from '../navigator/favoritesStore';
import type { AgentSource, DiscoveredFile, FavoriteEntry } from '../navigator/types';

type Node = { type: 'section'; label: string } | { type: 'message'; label: string } | { type: 'workspace'; folder: vscode.WorkspaceFolder } | { type: 'agent'; label: string; id: string } | { type: 'group'; label: string; agentId: string } | { type: 'file'; file: DiscoveredFile; favorite: boolean } | { type: 'favorite'; uri: string; exists: boolean; fsPath?: string };

export class AgentFilesTreeProvider implements vscode.TreeDataProvider<Node> {
  private readonly emitter = new vscode.EventEmitter<Node | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private loaded = false;
  private workspaceFiles: DiscoveredFile[] = [];
  private installedFiles: DiscoveredFile[] = [];
  private messages: string[] = [];
  constructor(private readonly context: vscode.ExtensionContext, private readonly output: vscode.OutputChannel) {}
  refresh(): void { this.loaded = false; this.emitter.fire(undefined); }
  async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.workspaceFiles = await this.discoverWorkspace();
    this.installedFiles = await this.discoverInstalled();
    this.loaded = true;
  }
  async getChildren(node?: Node): Promise<Node[]> {
    await this.ensureLoaded();
    if (!node) return [{ type: 'section', label: 'Favorites' }, { type: 'section', label: 'Workspace' }, { type: 'section', label: 'Installed Agents' }];
    if (node.type === 'section' && node.label === 'Favorites') return this.favoriteChildren();
    if (node.type === 'section' && node.label === 'Workspace') return vscode.workspace.workspaceFolders?.map((folder) => ({ type: 'workspace', folder })) ?? [{ type: 'message', label: 'No workspace folder is open.' }];
    if (node.type === 'section' && node.label === 'Installed Agents') return this.installedChildren();
    if (node.type === 'workspace') return this.workspaceFiles.filter((file) => file.sourceId === node.folder.uri.toString()).map((file) => ({ type: 'file', file, favorite: this.isFavorite(file.absolutePath) }));
    if (node.type === 'agent') return unique(this.installedFiles.filter((f) => f.sourceId.startsWith(`${node.id}:`)).map((f) => f.sourceLabel.split('/')[1])).map((label) => ({ type: 'group', label, agentId: node.id }));
    if (node.type === 'group') return this.installedFiles.filter((f) => f.sourceId.startsWith(`${node.agentId}:`) && f.sourceLabel.endsWith(`/${node.label}`)).map((file) => ({ type: 'file', file, favorite: this.isFavorite(file.absolutePath) }));
    return [];
  }
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.type === 'section') { const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Expanded); item.contextValue = 'skillMdInspector.navigator.section'; return item; }
    if (node.type === 'message') return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    if (node.type === 'workspace') { const item = new vscode.TreeItem(node.folder.name, vscode.TreeItemCollapsibleState.Collapsed); item.iconPath = new vscode.ThemeIcon('folder'); item.contextValue = 'skillMdInspector.navigator.workspace'; return item; }
    if (node.type === 'agent') { const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed); item.iconPath = new vscode.ThemeIcon('hubot'); item.contextValue = 'skillMdInspector.navigator.agent'; return item; }
    if (node.type === 'group') { const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed); item.contextValue = 'skillMdInspector.navigator.directory'; return item; }
    if (node.type === 'favorite') return this.favoriteItem(node);
    return this.fileItem(node.file, node.favorite);
  }
  getParent(): Node | undefined { return undefined; }
  private fileItem(file: DiscoveredFile, favorite: boolean): vscode.TreeItem { const label = file.fileName === 'SKILL.md' ? path.basename(path.dirname(file.absolutePath)) : 'AGENTS.md'; const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None); const uri = vscode.Uri.file(file.absolutePath); item.resourceUri = uri; item.description = file.relativePath; item.tooltip = `${file.absolutePath}\nSource: ${file.sourceLabel}`; item.iconPath = new vscode.ThemeIcon(file.fileName === 'SKILL.md' ? (favorite ? 'star-full' : 'tools') : 'book'); item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] }; item.contextValue = file.fileName === 'SKILL.md' ? (favorite ? 'skillMdInspector.navigator.favorite' : 'skillMdInspector.navigator.skillFile') : 'skillMdInspector.navigator.agentsFile'; return item; }
  private favoriteItem(node: Extract<Node, { type: 'favorite' }>): vscode.TreeItem { const item = new vscode.TreeItem(node.fsPath ? path.basename(path.dirname(node.fsPath)) : 'Missing Favorite', vscode.TreeItemCollapsibleState.None); item.description = node.exists && node.fsPath ? path.dirname(node.fsPath) : 'Missing'; item.tooltip = node.fsPath ?? node.uri; item.iconPath = new vscode.ThemeIcon(node.exists ? 'star-full' : 'warning'); item.contextValue = node.exists ? 'skillMdInspector.navigator.favorite' : 'skillMdInspector.navigator.missingFavorite'; if (node.exists && node.fsPath) { const uri = vscode.Uri.file(node.fsPath); item.resourceUri = uri; item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] }; } else { item.command = { command: 'skillMdInspector.openFavorite', title: 'Open Favorite', arguments: [node.uri] }; } return item; }
  private favoriteChildren(): Node[] { const entries = restoreFavorites(this.context.globalState.get(FAVORITES_KEY)); if (entries.length === 0) return [{ type: 'message', label: 'No favorite SKILL.md files yet.' }]; return entries.map((entry) => { const uri = vscode.Uri.parse(entry.uri); const fsPath = uri.scheme === 'file' ? uri.fsPath : undefined; return { type: 'favorite', uri: entry.uri, fsPath, exists: !!fsPath && this.exists(fsPath) }; }); }
  private installedChildren(): Node[] { if (this.installedFiles.length === 0) return [{ type: 'message', label: this.messages[0] ?? 'No supported local agent files found.' }]; return unique(this.installedFiles.map((f) => f.sourceId.split(':')[0])).map((id) => ({ type: 'agent', id, label: this.installedFiles.find((f) => f.sourceId.startsWith(`${id}:`))?.sourceLabel.split('/')[0] ?? id })); }
  private async discoverWorkspace(): Promise<DiscoveredFile[]> { const folders = vscode.workspace.workspaceFolders ?? []; const excludes = `{${vscode.workspace.getConfiguration('skillMdInspector').get<string[]>('discovery.exclude', []).join(',')}}`; const files: DiscoveredFile[] = []; for (const folder of folders) { for (const name of ['SKILL.md', 'AGENTS.md'] as const) { const found = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, `**/${name}`), excludes); for (const uri of found) files.push({ sourceId: folder.uri.toString(), sourceLabel: folder.name, fileName: name, absolutePath: uri.fsPath, relativePath: path.relative(folder.uri.fsPath, uri.fsPath) }); } } return files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, undefined, { sensitivity: 'base' })); }
  private async discoverInstalled(): Promise<DiscoveredFile[]> { this.messages = []; const sources = this.sources(); const files: DiscoveredFile[] = []; for (const source of sources) { try { const result = await discoverExternalFiles(source); this.messages.push(...result.messages); files.push(...result.files.map((file) => ({ ...file, sourceId: `${source.agentId}:${source.id}`, sourceLabel: `${source.agentLabel}/${source.groupLabel}` }))); } catch (error) { this.output.appendLine(String(error)); } } return files; }
  private sources(): AgentSource[] { const homeDir = os.homedir(); const builtIns = resolveBuiltInAgentSources({ homeDir, env: process.env, platform: process.platform }); const raw = vscode.workspace.getConfiguration('skillMdInspector').get<unknown>('navigator.additionalRoots'); const normalized = normalizeAdditionalRoots(raw); if (normalized.ignoredCount > 0) void vscode.window.showWarningMessage('Some SKILL.md Inspector additional roots were ignored because they are malformed.'); const additional = normalized.roots.map((root): AgentSource | undefined => { const expanded = expandConfiguredPath(root.path, { homeDir, cwd: homeDir, env: process.env }); return expanded ? { id: root.id, agentId: root.id, agentLabel: root.label, groupLabel: 'Configured Files', rootPath: expanded, files: root.files, recursive: root.recursive } : undefined; }).filter((source): source is AgentSource => !!source); return [...builtIns, ...additional]; }
  private favorites(): FavoriteEntry[] { return restoreFavorites(this.context.globalState.get(FAVORITES_KEY)); }
  private isFavorite(fsPath: string): boolean { return this.favorites().some((entry) => vscode.Uri.parse(entry.uri).fsPath === fsPath); }
  private exists(fsPath: string): boolean { try { return existsSync(fsPath); } catch { return false; } }
}
function unique(values: string[]): string[] { return [...new Set(values)].filter(Boolean); }
