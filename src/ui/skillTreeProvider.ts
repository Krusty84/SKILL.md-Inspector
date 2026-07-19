import * as path from 'node:path';
import * as vscode from 'vscode';
import { computeWorkspaceAnalysis } from '../analysis/workspaceAnalysis';
import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillCollision,
  NameConflict,
  SimilarNames,
  ResourceNode,
} from '../types/Workspace';

type TreeNode =
  | { type: 'message'; text: string }
  | { type: 'nameConflicts'; conflicts: NameConflict[] }
  | { type: 'nameConflict'; conflict: NameConflict }
  | { type: 'similarNames'; similar: SimilarNames[] }
  | { type: 'similar'; pair: SimilarNames }
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
      case 'nameConflicts': {
        const item = new vscode.TreeItem(
          `Duplicate names (${node.conflicts.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon('error');
        return item;
      }
      case 'nameConflict': {
        const c = node.conflict;
        const item = new vscode.TreeItem(c.normalized, vscode.TreeItemCollapsibleState.None);
        item.description = `${c.entries.length} skills`;
        item.tooltip = c.entries.map((e) => `${e.name} — ${e.path}`).join('\n');
        item.iconPath = new vscode.ThemeIcon('error');
        return item;
      }
      case 'similarNames': {
        const item = new vscode.TreeItem(
          `Similar names (${node.similar.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      }
      case 'similar': {
        const s = node.pair;
        const item = new vscode.TreeItem(`${s.a} ↔ ${s.b}`, vscode.TreeItemCollapsibleState.None);
        item.description = s.similarity.toFixed(2);
        item.tooltip = `${s.aPath}\n${s.bPath}`;
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      }
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
        const m = c.metrics;
        const item = new vscode.TreeItem(`${c.a} ↔ ${c.b}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${c.risk} · ${c.similarity.toFixed(2)} · ${c.confidence} conf`;
        const sep =
          m.boundarySeparation > 0 ? `, boundary sep ${m.boundarySeparation.toFixed(2)}` : '';
        item.tooltip =
          `Risk ${c.risk} · confidence ${c.confidence}\n` +
          `Metrics — Jaccard ${m.jaccard.toFixed(2)}, cosine ${m.cosine.toFixed(2)}, ` +
          `char n-gram ${m.charNgram.toFixed(2)}, name ${m.nameSimilarity.toFixed(2)}${sep}\n` +
          `Shared: ${c.sharedTerms.join(', ')}\n${c.recommendation}`;
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
    if (node.type === 'nameConflicts') {
      return node.conflicts.map((conflict) => ({ type: 'nameConflict', conflict }));
    }
    if (node.type === 'similarNames') {
      return node.similar.map((pair) => ({ type: 'similar', pair }));
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
    if (this.analysis.nameConflicts.length > 0) {
      nodes.push({ type: 'nameConflicts', conflicts: this.analysis.nameConflicts });
    }
    if (this.analysis.similarNames.length > 0) {
      nodes.push({ type: 'similarNames', similar: this.analysis.similarNames });
    }
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
    const quality = skill.staticDescriptionQuality;
    const instructions = skill.authoringQuality.instructions;
    const scoreAdjustment =
      quality.state === 'scored' && quality.rawScore !== quality.adjustedScore
        ? `Raw Static Description Quality: ${quality.rawScore}/100  \n`
        : '';
    const gradeLimitations =
      quality.state === 'scored' && quality.gradeLimitations.length > 0
        ? `Grade limitations:  \n${quality.gradeLimitations
            .map(
              (limitation) =>
                `- ${escapeMarkdown(limitation.code)} — ceiling ${limitation.ceiling}/100. ${escapeMarkdown(limitation.reason)}  \n`,
            )
            .join('')}`
        : '';
    const descriptionSummary =
      quality.state === 'scored'
        ? `Adjusted Static Description Quality: ${quality.adjustedScore}/100 (${quality.label}) · heuristic coverage ${quality.coverage}  \n`
        : `Description quality: Not scored — ${escapeMarkdown(quality.notScoredReason)}  \n`;
    const instructionSummary =
      instructions.state === 'scored'
        ? `Instruction authoring quality: ${instructions.score}/100 (${instructions.label})  \n`
        : `Instruction structure: Not scored — ${escapeMarkdown(instructions.notScoredReason)}  \n`;
    const treeScore = quality.state === 'scored' ? String(quality.adjustedScore) : 'Not scored';
    item.description = `Validation ${skill.validationStatus} · SDQ ${treeScore} · ${skill.errors}E/${skill.warnings}W · ${skill.profile}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${escapeMarkdown(skill.name)}**  \n`,
        `Validation status: ${skill.validationStatus}  \n`,
        descriptionSummary,
        scoreAdjustment,
        gradeLimitations,
        instructionSummary,
        `Errors: ${skill.errors} · Warnings: ${skill.warnings} · Info: ${skill.information}  \n`,
        `Format/portability compatibility: ${skill.portability.map((p) => `${p.profile} ${statusGlyph(p.status)}`).join(' · ')}  \n`,
        `_Compatibility checks profile-specific format constraints; they do not include general description or instruction-body quality._  \n`,
        `_Description quality is deterministic and does not guarantee an agent will select this skill at runtime._`,
      ].join(''),
    );
    item.iconPath = new vscode.ThemeIcon(
      skill.validationStatus === 'fail'
        ? 'error'
        : skill.validationStatus === 'warning'
          ? 'warning'
          : 'pass',
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

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_{}[\]<>]/g, '\\$&');
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
