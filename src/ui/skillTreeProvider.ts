import * as path from 'node:path';
import * as vscode from 'vscode';
import { computeWorkspaceAnalysis } from '../analysis/workspaceAnalysis';
import type { WorkspaceAnalysis, WorkspaceSkill, SkillCollision, ResourceNode } from '../types/Workspace';

type TreeNode =
  | { type: 'message'; text: string }
  | { type: 'collisions'; collisions: SkillCollision[] }
  | { type: 'collision'; collision: SkillCollision }
  | { type: 'skill'; skill: WorkspaceSkill }
  | { type: 'resource'; node: ResourceNode; skillDir: string };

/** Tree view of workspace skills with status, score, and resource graph (§13.1). */
export class SkillTreeProvider implements vscode.TreeDataProvider<TreeNode> {
  private readonly emitter = new vscode.EventEmitter<TreeNode | undefined>();
  readonly onDidChangeTreeData = this.emitter.event;
  private analysis: WorkspaceAnalysis | undefined;
  private loaded = false;

  refresh(): void {
    this.loaded = false;
    this.analysis = undefined;
    this.emitter.fire(undefined);
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.type) {
      case 'message':
        return new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
      case 'collisions': {
        const item = new vscode.TreeItem(
          `Potential collisions (${node.collisions.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      }
      case 'collision': {
        const c = node.collision;
        const item = new vscode.TreeItem(`${c.a} ↔ ${c.b}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${c.risk} · ${c.similarity.toFixed(2)}`;
        item.tooltip = `Shared: ${c.sharedTerms.join(', ')}\n${c.recommendation}`;
        item.iconPath = new vscode.ThemeIcon(riskIcon(c.risk));
        return item;
      }
      case 'skill':
        return this.skillItem(node.skill);
      case 'resource':
        return this.resourceItem(node.node, node.skillDir);
    }
  }

  getChildren(node?: TreeNode): TreeNode[] {
    if (!node) {
      return this.rootChildren();
    }
    if (node.type === 'collisions') {
      return node.collisions.map((collision) => ({ type: 'collision', collision }));
    }
    if (node.type === 'skill') {
      const skillDir = path.dirname(node.skill.absolutePath);
      return node.skill.resourceGraph.nodes.map((resource) => ({
        type: 'resource',
        node: resource,
        skillDir,
      }));
    }
    return [];
  }

  private rootChildren(): TreeNode[] {
    if (!this.loaded) {
      this.analysis = computeWorkspaceAnalysis()?.analysis;
      this.loaded = true;
    }
    if (!this.analysis) {
      return [{ type: 'message', text: 'Open a folder to scan for SKILL.md files.' }];
    }
    if (this.analysis.skills.length === 0) {
      return [{ type: 'message', text: 'No SKILL.md files found in this workspace.' }];
    }
    const nodes: TreeNode[] = [];
    if (this.analysis.collisions.length > 0) {
      nodes.push({ type: 'collisions', collisions: this.analysis.collisions });
    }
    for (const skill of this.analysis.skills) {
      nodes.push({ type: 'skill', skill });
    }
    return nodes;
  }

  private skillItem(skill: WorkspaceSkill): vscode.TreeItem {
    const item = new vscode.TreeItem(
      skill.name,
      skill.resourceGraph.nodes.length > 0
        ? vscode.TreeItemCollapsibleState.Collapsed
        : vscode.TreeItemCollapsibleState.None,
    );
    item.description = `TQ ${skill.triggerQualityScore} · ${skill.errors}E/${skill.warnings}W · ${skill.profile}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${skill.name}**  \n`,
        `Trigger Quality: ${skill.triggerQualityScore}/100 (${skill.triggerQualityLabel})  \n`,
        `Errors: ${skill.errors} · Warnings: ${skill.warnings} · Info: ${skill.information}  \n`,
        `Portability: ${skill.portability.map((p) => `${p.profile} ${statusGlyph(p.status)}`).join(' · ')}`,
      ].join(''),
    );
    item.iconPath = new vscode.ThemeIcon(
      skill.errors > 0 ? 'error' : skill.warnings > 0 ? 'warning' : 'pass',
    );
    item.resourceUri = vscode.Uri.file(skill.absolutePath);
    item.command = {
      command: 'vscode.open',
      title: 'Open SKILL.md',
      arguments: [vscode.Uri.file(skill.absolutePath)],
    };
    item.contextValue = 'skillMdInspector.skill';
    return item;
  }

  private resourceItem(node: ResourceNode, skillDir: string): vscode.TreeItem {
    const item = new vscode.TreeItem(node.path, vscode.TreeItemCollapsibleState.None);
    const flags = node.flags.length > 0 ? ` [${node.flags.join(', ')}]` : '';
    item.description = `${node.kind}${flags}`;
    item.iconPath = new vscode.ThemeIcon(resourceIcon(node.kind));
    if (node.kind === 'referenced' || node.kind === 'unreferenced') {
      const fileUri = vscode.Uri.file(path.join(skillDir, node.path));
      item.resourceUri = fileUri;
      item.command = { command: 'vscode.open', title: 'Open file', arguments: [fileUri] };
    }
    return item;
  }
}

function riskIcon(risk: SkillCollision['risk']): string {
  return risk === 'High' ? 'error' : 'warning';
}

function resourceIcon(kind: ResourceNode['kind']): string {
  switch (kind) {
    case 'missing':
      return 'error';
    case 'unreferenced':
    case 'absolute':
      return 'warning';
    case 'remote':
      return 'globe';
    default:
      return 'file';
  }
}

function statusGlyph(status: 'pass' | 'warning' | 'fail'): string {
  return status === 'pass' ? '✓' : status === 'warning' ? '⚠' : '✗';
}
