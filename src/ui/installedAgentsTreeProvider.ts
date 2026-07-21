import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { resolveBuiltInAgentSources } from '../navigator/builtInAgentSources';
import { discoverExternalFiles } from '../navigator/discoverExternalFiles';
import { expandConfiguredPath } from '../navigator/expandConfiguredPath';
import { FAVORITES_KEY, restoreFavorites } from '../navigator/favoritesStore';
import { normalizeAdditionalRoots } from '../navigator/normalizeAdditionalRoots';
import type { AgentSource, DiscoveredFile } from '../navigator/types';
import { createWorkspaceExcludeMatcher } from '../navigator/workspaceExcludes';
import type {
  WorkspaceDirectoryNode,
  WorkspaceFileNode,
} from '../navigator/workspaceExplorerTypes';
import { compareWorkspaceNodes, isDirectoryType } from '../navigator/workspaceSorting';
import { isPathInsideDir } from '../parser/linkPaths';
import { loadingTreeItem, SingleFlight } from './treeLoading';

export type InstalledAgentsNode =
  | { type: 'message'; label: string }
  | { type: 'loading'; label: string }
  | { type: 'agent'; label: string; id: string }
  | { type: 'group'; label: string; agentId: string }
  | { type: 'file'; file: DiscoveredFile; favorite: boolean }
  | { type: 'skill'; uri: vscode.Uri; name: string; skillMdPath: string }
  | WorkspaceDirectoryNode
  | WorkspaceFileNode;

export class InstalledAgentsTreeProvider implements vscode.TreeDataProvider<InstalledAgentsNode> {
  private readonly emitter = new vscode.EventEmitter<InstalledAgentsNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private loaded = false;
  private loadAttempted = false;
  private readonly discoveryLoad = new SingleFlight();
  private installedFiles: DiscoveredFile[] = [];
  private messages: string[] = [];
  private readonly fsCache = new Map<string, InstalledAgentsNode[]>();

  constructor(
    private readonly context: vscode.ExtensionContext,
    private readonly output: vscode.OutputChannel,
  ) {}

  refresh(): Promise<void> {
    this.fsCache.clear();
    return this.startDiscovery();
  }

  /**
   * Absolute paths of the SKILL.md files in scope of a right-clicked folder-ish
   * node, used by the installed-agents validate/report commands: a skill folder
   * resolves to its own SKILL.md, an agent/group to all of its skills, and a
   * nested subfolder to the SKILL.md files beneath it (often none).
   */
  resolveSkillMdPathsForNode(node: InstalledAgentsNode): string[] {
    const skills = this.installedFiles.filter((f) => f.fileName === 'SKILL.md');
    let matched: string[];
    switch (node.type) {
      case 'skill':
        matched = [node.skillMdPath];
        break;
      case 'agent':
        matched = skills
          .filter((f) => f.sourceId.startsWith(`${node.id}:`))
          .map((f) => f.absolutePath);
        break;
      case 'group':
        matched = skills
          .filter(
            (f) =>
              f.sourceId.startsWith(`${node.agentId}:`) && f.sourceLabel.endsWith(`/${node.label}`),
          )
          .map((f) => f.absolutePath);
        break;
      case 'workspaceDirectory':
        matched = skills
          .filter((f) => isPathInsideDir(node.uri.fsPath, f.absolutePath))
          .map((f) => f.absolutePath);
        break;
      default:
        matched = [];
    }
    return [...new Set(matched)];
  }

  getChildren(node?: InstalledAgentsNode): InstalledAgentsNode[] | Promise<InstalledAgentsNode[]> {
    if (!node) {
      if (!this.loaded && !this.loadAttempted) void this.startDiscovery();
      if (!this.loaded && this.discoveryLoad.isRunning)
        return [{ type: 'loading', label: 'Discovering installed agent skills…' }];
      if (!this.loaded)
        return [{ type: 'message', label: 'Unable to discover installed agent skills.' }];
      return this.installedChildren();
    }
    if (node.type === 'agent')
      return unique(
        this.installedFiles
          .filter((f) => f.sourceId.startsWith(`${node.id}:`))
          .map((f) => f.sourceLabel.split('/')[1]),
      ).map((label) => ({ type: 'group', label, agentId: node.id }));
    if (node.type === 'group')
      return this.installedFiles
        .filter(
          (f) =>
            f.sourceId.startsWith(`${node.agentId}:`) && f.sourceLabel.endsWith(`/${node.label}`),
        )
        .map((file) =>
          file.fileName === 'SKILL.md'
            ? {
                type: 'skill' as const,
                uri: vscode.Uri.file(path.dirname(file.absolutePath)),
                name: path.basename(path.dirname(file.absolutePath)),
                skillMdPath: file.absolutePath,
              }
            : { type: 'file' as const, file, favorite: this.isFavorite(file.absolutePath) },
        );
    if (node.type === 'skill' || node.type === 'workspaceDirectory') return this.readDir(node.uri);
    return [];
  }

  getTreeItem(node: InstalledAgentsNode): vscode.TreeItem {
    if (node.type === 'message')
      return new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.None);
    if (node.type === 'loading') return loadingTreeItem(node.label);
    if (node.type === 'agent') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.iconPath = new vscode.ThemeIcon('hubot');
      item.contextValue = 'skillMdInspector.agent';
      return item;
    }
    if (node.type === 'group') {
      const item = new vscode.TreeItem(node.label, vscode.TreeItemCollapsibleState.Collapsed);
      item.contextValue = 'skillMdInspector.agentGroup';
      return item;
    }
    if (node.type === 'skill') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = node.uri;
      item.tooltip = node.uri.fsPath;
      item.contextValue = 'skillMdInspector.skillFolder';
      return item;
    }
    if (node.type === 'workspaceDirectory') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.Collapsed);
      item.resourceUri = node.uri;
      item.tooltip = node.uri.fsPath;
      item.contextValue = 'skillMdInspector.installedAgentsDirectory';
      return item;
    }
    if (node.type === 'workspaceFile') {
      const item = new vscode.TreeItem(node.name, vscode.TreeItemCollapsibleState.None);
      item.resourceUri = node.uri;
      item.tooltip = node.uri.fsPath;
      item.command = { command: 'vscode.open', title: 'Open', arguments: [node.uri] };
      item.contextValue =
        node.name === 'SKILL.md'
          ? this.isFavorite(node.uri.fsPath)
            ? 'skillMdInspector.favoriteSkillFile'
            : 'skillMdInspector.skillFile'
          : 'skillMdInspector.installedAgentsFile';
      return item;
    }
    return this.fileItem(node.file, node.favorite);
  }

  private startDiscovery(): Promise<void> {
    const wasRunning = this.discoveryLoad.isRunning;
    this.loadAttempted = true;
    const operation = this.discoveryLoad.run(async () => {
      try {
        const result = await vscode.window.withProgress(
          { location: { viewId: 'skillMdInspectorInstalledAgents' } },
          () => this.discoverInstalled(),
        );
        this.installedFiles = result.files;
        this.messages = result.messages;
        this.loaded = true;
      } finally {
        this.emitter.fire(undefined);
      }
    });
    if (!wasRunning) {
      this.emitter.fire(undefined);
      void operation.catch((error: unknown) => {
        this.output.appendLine(`Installed agent skills discovery failed: ${String(error)}`);
      });
    }
    return operation;
  }

  private installedChildren(): InstalledAgentsNode[] {
    if (this.installedFiles.length === 0)
      return [
        { type: 'message', label: this.messages[0] ?? 'No supported local agent files found.' },
      ];
    return unique(this.installedFiles.map((f) => f.sourceId.split(':')[0])).map((id) => ({
      type: 'agent',
      id,
      label:
        this.installedFiles
          .find((f) => f.sourceId.startsWith(`${id}:`))
          ?.sourceLabel.split('/')[0] ?? id,
    }));
  }

  private fileItem(file: DiscoveredFile, favorite: boolean): vscode.TreeItem {
    const label =
      file.fileName === 'SKILL.md' ? path.basename(path.dirname(file.absolutePath)) : file.fileName;
    const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
    const uri = vscode.Uri.file(file.absolutePath);
    item.resourceUri = uri;
    item.description = file.relativePath;
    item.tooltip = `${file.absolutePath}\nSource: ${file.sourceLabel}`;
    item.command = { command: 'vscode.open', title: 'Open', arguments: [uri] };
    item.contextValue =
      file.fileName === 'SKILL.md'
        ? favorite
          ? 'skillMdInspector.favoriteSkillFile'
          : 'skillMdInspector.skillFile'
        : 'skillMdInspector.installedAgentsFile';
    return item;
  }

  private toFsNode(
    parent: vscode.Uri,
    name: string,
    fileType: vscode.FileType,
  ): WorkspaceDirectoryNode | WorkspaceFileNode {
    const uri = vscode.Uri.joinPath(parent, name);
    if (isDirectoryType(fileType))
      return {
        type: 'workspaceDirectory',
        id: `installed-directory:${uri.toString()}`,
        uri,
        name,
        parentUri: parent,
      };
    return {
      type: 'workspaceFile',
      id: `installed-file:${uri.toString()}`,
      uri,
      name,
      fileType,
      parentUri: parent,
    };
  }

  private async readDir(uri: vscode.Uri): Promise<InstalledAgentsNode[]> {
    const key = uri.toString();
    const cached = this.fsCache.get(key);
    if (cached) return cached;
    try {
      const matcher = createWorkspaceExcludeMatcher({
        uri,
        name: path.basename(uri.fsPath),
        index: 0,
      });
      const entries = await vscode.workspace.fs.readDirectory(uri);
      const children = entries
        .map(([name, fileType]) => this.toFsNode(uri, name, fileType))
        .filter((child) => !matcher.excludes(child.uri, child.name))
        .sort(compareWorkspaceNodes);
      this.fsCache.set(key, children);
      return children;
    } catch (error) {
      this.output.appendLine(`Unable to read installed skill folder ${key}: ${String(error)}`);
      return [{ type: 'message', label: 'Unable to read this folder.' }];
    }
  }

  private async discoverInstalled(): Promise<{
    files: DiscoveredFile[];
    messages: string[];
  }> {
    const messages: string[] = [];
    const sources = this.sources();
    const files: DiscoveredFile[] = [];
    for (const source of sources) {
      try {
        const result = await discoverExternalFiles(source);
        messages.push(...result.messages);
        for (const file of result.files) {
          files.push({
            ...file,
            sourceId: `${source.agentId}:${source.id}`,
            sourceLabel: `${source.agentLabel}/${source.groupLabel}`,
          });
        }
      } catch (error) {
        this.output.appendLine(String(error));
      }
    }
    return { files: deduplicateDiscoveredFiles(files), messages };
  }

  private sources(): AgentSource[] {
    const homeDir = os.homedir();
    const builtIns = resolveBuiltInAgentSources({
      homeDir,
      env: process.env,
      platform: process.platform,
    });
    const raw = vscode.workspace
      .getConfiguration('skillMdInspector')
      .get<unknown>('navigator.additionalRoots');
    const normalized = normalizeAdditionalRoots(raw);
    if (normalized.ignoredCount > 0)
      void vscode.window.showWarningMessage(
        'Some SKILL.md Inspector additional roots were ignored because they are malformed.',
      );
    const additional = normalized.roots
      .map((root): AgentSource | undefined => {
        const expanded = expandConfiguredPath(root.path, {
          homeDir,
          cwd: homeDir,
          env: process.env,
        });
        return expanded
          ? {
              id: root.id,
              agentId: root.id,
              agentLabel: root.label,
              groupLabel: 'Configured Files',
              rootPath: expanded,
              files: root.files,
              recursive: root.recursive,
            }
          : undefined;
      })
      .filter((source): source is AgentSource => !!source);
    return [...builtIns, ...additional];
  }

  private isFavorite(fsPath: string): boolean {
    return restoreFavorites(this.context.globalState.get(FAVORITES_KEY)).some(
      (entry) => vscode.Uri.parse(entry.uri).fsPath === fsPath,
    );
  }
}
function unique(values: string[]): string[] {
  return [...new Set(values)].filter(Boolean);
}

export function deduplicateDiscoveredFiles(
  files: readonly DiscoveredFile[],
  platform: NodeJS.Platform = process.platform,
): DiscoveredFile[] {
  const seen = new Set<string>();
  return files.filter((file) => {
    const canonicalPath =
      platform === 'win32' ? file.absolutePath.toLowerCase() : file.absolutePath;
    if (seen.has(canonicalPath)) return false;
    seen.add(canonicalPath);
    return true;
  });
}
