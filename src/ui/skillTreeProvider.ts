import * as path from 'node:path';
import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { computeWorkspaceAnalysis } from '../analysis/workspaceAnalysis';
import type { AuthoringLabel } from '../authoring/authoringQuality';
import type {
  HeuristicCoverage,
  StaticDescriptionQualityLabel,
} from '../types/StaticDescriptionQuality';
import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillCollision,
  NameConflict,
  SimilarNames,
  ResourceNode,
} from '../types/Workspace';
import { loadingTreeItem, SingleFlight } from './treeLoading';
import {
  authoringHygieneDefinition,
  descriptionCompletenessDefinition,
  lowTextCoverageDefinition,
} from './metricDefinitions';

type TreeNode =
  | { type: 'message'; text: string }
  | { type: 'loading'; text: string }
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
  private hasAnalysisResult = false;
  private analysisAttempted = false;
  private readonly analysisLoad = new SingleFlight();

  constructor(private readonly output?: vscode.OutputChannel) {}

  refresh(): Promise<void> {
    return this.startAnalysis();
  }

  getTreeItem(node: TreeNode): vscode.TreeItem {
    switch (node.type) {
      case 'message':
        return new vscode.TreeItem(node.text, vscode.TreeItemCollapsibleState.None);
      case 'loading':
        return loadingTreeItem(node.text);
      case 'nameConflicts': {
        const item = new vscode.TreeItem(
          l10n.t('Duplicate names ({0})', node.conflicts.length),
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon('error');
        return item;
      }
      case 'nameConflict': {
        const c = node.conflict;
        const item = new vscode.TreeItem(c.normalized, vscode.TreeItemCollapsibleState.None);
        item.description = l10n.t('{0} skills', c.entries.length);
        item.tooltip = c.entries.map((e) => `${e.name} — ${e.path}`).join('\n');
        item.iconPath = new vscode.ThemeIcon('error');
        return item;
      }
      case 'similarNames': {
        const item = new vscode.TreeItem(
          l10n.t('Similar names ({0})', node.similar.length),
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
          l10n.t('Potential collisions ({0})', node.collisions.length),
          vscode.TreeItemCollapsibleState.Expanded,
        );
        item.iconPath = new vscode.ThemeIcon('warning');
        return item;
      }
      case 'collision': {
        const c = node.collision;
        const m = c.metrics;
        const item = new vscode.TreeItem(`${c.a} ↔ ${c.b}`, vscode.TreeItemCollapsibleState.None);
        item.description = `${riskText(c.risk)} · ${c.similarity.toFixed(2)} · ${l10n.t(
          '{0} conf',
          confidenceText(c.confidence),
        )}`;
        const sep =
          m.boundarySeparation > 0
            ? `, ${l10n.t('boundary sep {0}', m.boundarySeparation.toFixed(2))}`
            : '';
        const coverage =
          c.textCoverage === 'low'
            ? `\n${l10n.t('Text coverage low — {0}', lowTextCoverageDefinition())}`
            : '';
        item.tooltip =
          `${l10n.t('Risk {0}', riskText(c.risk))} · ${l10n.t('confidence {0}', confidenceText(c.confidence))}\n` +
          `${l10n.t(
            'Metrics — Jaccard {0}, cosine {1}, char n-gram {2}, name {3}',
            m.jaccard.toFixed(2),
            m.cosine.toFixed(2),
            m.charNgram.toFixed(2),
            m.nameSimilarity.toFixed(2),
          )}${sep}\n` +
          `${l10n.t('Shared: {0}', c.sharedTerms.join(', '))}${coverage}\n${c.recommendation}`;
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
    if (!this.hasAnalysisResult) {
      if (!this.analysisAttempted) void this.startAnalysis();
      if (this.analysisLoad.isRunning) {
        return [{ type: 'loading', text: l10n.t('Analyzing workspace skills…') }];
      }
      return [{ type: 'message', text: l10n.t('Unable to analyze workspace skills.') }];
    }
    if (!this.analysis) {
      return [{ type: 'message', text: l10n.t('Open a folder to scan for SKILL.md files.') }];
    }
    if (this.analysis.skills.length === 0) {
      return [{ type: 'message', text: l10n.t('No SKILL.md files found in this workspace.') }];
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

  private startAnalysis(): Promise<void> {
    const wasRunning = this.analysisLoad.isRunning;
    this.analysisAttempted = true;
    // runLatest: a refresh requested while an analysis is in flight (e.g. two
    // quick saves) queues one trailing re-run instead of being dropped, so the
    // panel always ends on the newest state.
    const operation = this.analysisLoad.runLatest(async () => {
      try {
        const result = await vscode.window.withProgress(
          { location: { viewId: 'skillMdInspectorSkills' } },
          async () => (await computeWorkspaceAnalysis())?.analysis,
        );
        this.analysis = result;
        this.hasAnalysisResult = true;
      } finally {
        this.emitter.fire(undefined);
      }
    });
    if (!wasRunning) {
      this.emitter.fire(undefined);
    }
    void operation.catch((error: unknown) => {
      this.output?.appendLine(`Workspace skills analysis failed: ${String(error)}`);
    });
    return operation;
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
        ? `${l10n.t('Raw description completeness: {0}/100', quality.rawScore)}  \n`
        : '';
    const gradeLimitations =
      quality.state === 'scored' && quality.gradeLimitations.length > 0
        ? `${l10n.t('Grade limitations:')}  \n${quality.gradeLimitations
            .map(
              (limitation) =>
                `- ${escapeMarkdown(limitation.code)} — ${l10n.t('ceiling {0}/100.', limitation.ceiling)} ${escapeMarkdown(limitation.reason)}  \n`,
            )
            .join('')}`
        : '';
    const descriptionSummary =
      quality.state === 'scored'
        ? `${l10n.t(
            'Adjusted description completeness: {0}/100 ({1})',
            quality.adjustedScore,
            qualityLabelText(quality.label),
          )} · ${l10n.t('heuristic coverage {0}', coverageText(quality.coverage))}  \n`
        : `${l10n.t('Description completeness: Not scored')} — ${escapeMarkdown(quality.notScoredReason)}  \n`;
    const instructionSummary =
      instructions.state === 'scored'
        ? `${l10n.t(
            'Authoring hygiene: {0}/100 ({1})',
            instructions.score,
            instructionLabelText(instructions.label),
          )}  \n`
        : `${l10n.t('Instruction structure: Not scored')} — ${escapeMarkdown(instructions.notScoredReason)}  \n`;
    const treeScore =
      quality.state === 'scored' ? String(quality.adjustedScore) : l10n.t('Not scored');
    item.description = `${l10n.t('Validation {0}', validationStatusText(skill.validationStatus))} · ${l10n.t(
      'Completeness {0}',
      treeScore,
    )} · ${l10n.t({
      message: '{0}E/{1}W',
      args: [skill.errors, skill.warnings],
      comment: ['Abbreviated error/warning counts'],
    })} · ${skill.profile}`;
    item.tooltip = new vscode.MarkdownString(
      [
        `**${escapeMarkdown(skill.name)}**  \n`,
        `${l10n.t('Validation status: {0}', validationStatusText(skill.validationStatus))}  \n`,
        descriptionSummary,
        scoreAdjustment,
        gradeLimitations,
        instructionSummary,
        `${l10n.t('Errors: {0}', skill.errors)} · ${l10n.t('Warnings: {0}', skill.warnings)} · ${l10n.t('Info: {0}', skill.information)}  \n`,
        `${l10n.t(
          '_Description completeness: {0} It is deterministic and does not guarantee an agent will select this skill at runtime._',
          descriptionCompletenessDefinition(),
        )}  \n`,
        l10n.t('_Authoring hygiene: {0}_', authoringHygieneDefinition()),
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
      title: l10n.t('Open SKILL.md'),
      arguments: [vscode.Uri.file(skill.absolutePath)],
    };
    item.contextValue = 'skillMdInspector.skill';
    return item;
  }

  private resourceItem(node: ResourceNode, skillDir: string): vscode.TreeItem {
    const item = new vscode.TreeItem(node.path, vscode.TreeItemCollapsibleState.None);
    const flags =
      node.flags.length > 0 ? ` [${node.flags.map(resourceFlagText).join(', ')}]` : '';
    item.description = `${resourceKindText(node.kind)}${flags}`;
    item.iconPath = new vscode.ThemeIcon(resourceIcon(node.kind));
    if (node.kind === 'referenced' || node.kind === 'unreferenced') {
      const fileUri = vscode.Uri.file(path.join(skillDir, node.path));
      item.resourceUri = fileUri;
      item.command = { command: 'vscode.open', title: l10n.t('Open file'), arguments: [fileUri] };
    }
    return item;
  }
}

function riskIcon(risk: SkillCollision['risk']): string {
  return risk === 'High' ? 'error' : 'warning';
}

/**
 * Reader-facing words for enum values that previously leaked into the tree
 * verbatim. Each branch is a literal l10n.t() call so the extractor sees the
 * key, and each English default is byte-identical to the raw enum member it
 * replaces (icons and contextValues keep using the raw values).
 */
function validationStatusText(status: WorkspaceSkill['validationStatus']): string {
  switch (status) {
    case 'pass':
      return l10n.t('pass');
    case 'warning':
      return l10n.t('warning');
    case 'fail':
      return l10n.t('fail');
  }
}

/** Lower-case, unlike the reports' quality labels: the tree showed the raw value. */
function qualityLabelText(label: StaticDescriptionQualityLabel): string {
  switch (label) {
    case 'excellent':
      return l10n.t('excellent');
    case 'good':
      return l10n.t('good');
    case 'acceptable':
      return l10n.t('acceptable');
    case 'weak':
      return l10n.t('weak');
    case 'poor':
      return l10n.t('poor');
  }
}

/** Kebab-case like the raw stored label the tree always showed. */
function instructionLabelText(label: AuthoringLabel): string {
  switch (label) {
    case 'clean':
      return l10n.t('clean');
    case 'minor-issues':
      return l10n.t('minor-issues');
    case 'issues':
      return l10n.t('issues');
    case 'defects':
      return l10n.t('defects');
  }
}

function coverageText(coverage: HeuristicCoverage): string {
  switch (coverage) {
    case 'high':
      return l10n.t('high');
    case 'medium':
      return l10n.t('medium');
    case 'low':
      return l10n.t('low');
  }
}

function riskText(risk: SkillCollision['risk']): string {
  switch (risk) {
    case 'High':
      return l10n.t('High');
    case 'Medium':
      return l10n.t('Medium');
    case 'Low':
      return l10n.t('Low');
  }
}

function confidenceText(confidence: SkillCollision['confidence']): string {
  switch (confidence) {
    case 'high':
      return l10n.t('high');
    case 'medium':
      return l10n.t('medium');
    case 'low':
      return l10n.t('low');
  }
}

function resourceKindText(kind: ResourceNode['kind']): string {
  switch (kind) {
    case 'referenced':
      return l10n.t('referenced');
    case 'unreferenced':
      return l10n.t('unreferenced');
    case 'missing':
      return l10n.t('missing');
    case 'absolute':
      return l10n.t('absolute');
    case 'remote':
      return l10n.t('remote');
  }
}

function resourceFlagText(flag: ResourceNode['flags'][number]): string {
  switch (flag) {
    case 'script':
      return l10n.t('script');
    case 'binary':
      return l10n.t('binary');
    case 'large':
      return l10n.t('large');
    case 'remote':
      return l10n.t('remote');
  }
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

