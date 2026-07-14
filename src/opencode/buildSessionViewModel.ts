import * as vscode from 'vscode';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { discoverSkillPaths } from '../workspace/discoverSkills';
import type { NormalizedOpenCodeSession, NodeDetailsViewModel, SessionViewModel, SkillCandidate, SkillMatch, TrajectoryNode } from './model';
import { normalizeName, preview } from './util';

export async function attachSkillMatches(session: NormalizedOpenCodeSession): Promise<void> {
  const candidates = new Map<string, SkillCandidate[]>();
  const roots = (vscode.workspace.workspaceFolders ?? []).filter((f) => f.uri.scheme === 'file').map((f) => f.uri.fsPath);
  for (const root of roots) {
    for (const skillPath of discoverSkillPaths(root)) {
      try {
        const content = Buffer.from(await vscode.workspace.fs.readFile(vscode.Uri.file(skillPath))).toString('utf8');
        const cfg = readConfig(vscode.Uri.file(skillPath));
        const analysis = analyzeSkill(skillPath, content, cfg.profile, { mode: 'text-only' });
        const candidate: SkillCandidate = { uri: vscode.Uri.file(skillPath).toString(), path: skillPath, name: analysis.document.frontmatter?.name, validationStatus: analysis.diagnostics.some((d) => d.severity === 'error') ? 'errors' : analysis.diagnostics.length ? 'warnings' : 'valid', profile: cfg.profile.id };
        const key = normalizeName(analysis.document.frontmatter?.name || path.basename(path.dirname(skillPath)));
        candidates.set(key, [...(candidates.get(key) ?? []), candidate]);
      } catch { /* ignore unreadable skills */ }
    }
  }
  for (const skill of session.skills) {
    const found = skill.skillName ? candidates.get(normalizeName(skill.skillName)) ?? [] : [];
    const match: SkillMatch = found.length === 0 ? { status: 'none', candidates: [] } : found.length === 1 ? { status: 'single', candidates: found } : { status: 'multiple', candidates: found, warning: 'Multiple SKILL.md files match this skill name.' };
    skill.matchingSkills = [match];
  }
}

export function buildSessionViewModel(session: NormalizedOpenCodeSession, hideReasoningByDefault = true): SessionViewModel {
  return { session: { title: session.title, id: session.id, parentId: session.parentId, version: session.version, model: session.model, provider: session.provider, agent: session.agent, created: session.created, updated: session.updated, durationMs: session.metrics.sessionDurationMs, sanitization: session.sanitization }, metrics: session.metrics, diagnostics: session.diagnostics, nodes: session.nodes.map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId, sourceOrder: n.sourceOrder, label: n.label, description: n.description, start: n.start, end: n.end, durationMs: n.durationMs, status: n.status, toolName: n.toolName, skillName: n.skillName, children: n.children, preview: n.preview, synthetic: n.synthetic, incomplete: n.incomplete, originalType: n.originalType })), skills: session.skills, large: session.nodes.length > 500, hideReasoningByDefault };
}

export function buildNodeDetails(session: NormalizedOpenCodeSession, nodeId: string): NodeDetailsViewModel | undefined {
  const node = session.nodes.find((n) => n.id === nodeId); if (!node) return undefined;
  const raw = node.rawReference ? session.rawByReference.get(node.rawReference) : undefined;
  const skill = node.kind === 'skill' ? session.skills.find((s) => s.partId === node.id) : undefined;
  return { nodeId, title: node.label, kind: node.kind, fields: fieldsFor(node), json: preview(raw, 50000), matchingSkills: skill?.matchingSkills.flatMap((m) => m.candidates), followingNodes: skill?.followingNodeIds.map((id) => session.nodes.find((n) => n.id === id)).filter((n): n is TrajectoryNode => !!n).map((n) => ({ id: n.id, kind: n.kind, parentId: n.parentId, sourceOrder: n.sourceOrder, label: n.label, description: n.description, start: n.start, end: n.end, durationMs: n.durationMs, status: n.status, toolName: n.toolName, skillName: n.skillName, children: n.children, preview: n.preview })), warning: node.kind === 'skill' ? 'Actions observed after skill load are temporal observations, not causal proof.' : undefined };
}
function fieldsFor(n: TrajectoryNode): Array<{ label: string; value: string }> { return [['Kind', n.kind], ['Status', n.status], ['Tool', n.toolName], ['Skill', n.skillName], ['Start', n.start?.toString()], ['End', n.end?.toString()], ['Duration', n.durationMs !== undefined ? `${n.durationMs} ms` : undefined], ['Original type', n.originalType]].filter((x): x is [string,string] => x[1] !== undefined).map(([label,value]) => ({ label, value })); }
