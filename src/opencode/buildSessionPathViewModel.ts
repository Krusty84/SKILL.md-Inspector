import type { NormalizedOpenCodeSession, SessionPathEdge, SessionPathNode, SessionPathPhaseCategory, SessionPathViewModel, TrajectoryNode } from './model';
import { preview } from './util';

const PHASE_LABELS: Record<SessionPathPhaseCategory, string> = { inspect: 'Inspect workspace', search: 'Search repository', retrieve: 'Retrieve information', modify: 'Modify files', execute: 'Run commands', validate: 'Validate changes', communicate: 'Final response', other: 'Other actions' };
const IMPORTANT_KINDS = new Set(['skill', 'agent', 'subtask', 'retry', 'unknown']);
const MAX_INITIAL_LOW_PRIORITY_PHASES = 96;

interface BuilderState { nodes: SessionPathNode[]; edges: SessionPathEdge[]; roots: string[]; sourceMap: Record<string, string[]>; lastRoot?: string; seq: number }
interface ActionGroup { category: SessionPathPhaseCategory; nodes: TrajectoryNode[]; assistantMessageId?: string; failed: boolean }

export function buildSessionPathViewModel(session: NormalizedOpenCodeSession): SessionPathViewModel {
  const state: BuilderState = { nodes: [], edges: [], roots: [], sourceMap: {}, seq: 0 };
  const byId = new Map(session.nodes.map((node) => [node.id, node]));
  const messageNodes = session.nodes.filter((node) => node.parentId === session.rootNodeId && (node.kind === 'user-message' || node.kind === 'assistant-message' || node.kind === 'unknown')).sort((a, b) => a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id));
  for (const message of messageNodes) {
    if (message.kind === 'user-message') {
      appendRoot(state, makeSimpleNode(state, 'request', 'User request', [message], 0));
      continue;
    }
    if (message.kind !== 'assistant-message') continue;
    const before = state.roots.length;
    processAssistantMessage(state, message, byId);
    const hasText = descendants(message, byId).some((node) => node.kind === 'text' && !!node.preview?.trim());
    if (hasText) appendRoot(state, makeSimpleNode(state, 'response', 'Final response', [message], 0, { phaseCategory: 'communicate' }));
    if (state.roots.length === before) appendRoot(state, makeSimpleNode(state, 'assistant-turn', 'Assistant turn', [message], 0));
  }
  mapUnrepresentedSources(state, session);
  compressLargePath(state);
  return { nodes: state.nodes, edges: state.edges, rootNodeIds: state.roots, initialState: { collapsedNodeIds: state.nodes.filter((node) => node.expandable).map((node) => node.id) }, sourceNodeToPathNodeIds: state.sourceMap };
}

export function classifyPathAction(node: TrajectoryNode, compactRaw?: unknown): SessionPathPhaseCategory {
  const name = `${node.toolName ?? node.label ?? node.kind}`.toLocaleLowerCase();
  const raw = typeof compactRaw === 'string' ? compactRaw : node.preview ?? node.description ?? '';
  const command = raw.toLocaleLowerCase();
  if (/(test|vitest|jest|pytest|lint|eslint|check-types|typecheck|build|compile|validate|verify)/i.test(command) && /(bash|shell|terminal|command|run|exec)/.test(name)) return 'validate';
  if (/(^|[^a-z])(test|vitest|jest|pytest|lint|eslint|check-types|typecheck|build|compile|validate|verify)([^a-z]|$)/.test(name)) return 'validate';
  if (/(read|open|view|list|\bls\b|glob|stat)/.test(name)) return 'inspect';
  if (/(grep|\brg\b|find|search|code search)/.test(name)) return 'search';
  if (/(fetch|http|web|download|query|lookup|database retrieval)/.test(name)) return 'retrieve';
  if (/(edit|write|create|delete|move|rename|patch|apply_patch)/.test(name) || node.kind === 'patch' || node.kind === 'file') return 'modify';
  if (/(bash|shell|terminal|command|run|exec)/.test(name)) return 'execute';
  if (node.kind === 'text') return 'communicate';
  return 'other';
}

function processAssistantMessage(state: BuilderState, message: TrajectoryNode, byId: Map<string, TrajectoryNode>): void {
  let current: ActionGroup | undefined;
  const flush = (): void => { if (!current) return; appendPhase(state, current); current = undefined; };
  for (const node of descendants(message, byId).filter((n) => n.kind !== 'step' && n.kind !== 'text' && n.kind !== 'reasoning').sort((a, b) => a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id))) {
    if (node.status === 'error') { flush(); appendRoot(state, makeSimpleNode(state, 'error', `${phaseLabel(classifyPathAction(node))} error`, [node], 0, { status: node.status, errorCount: 1 })); continue; }
    if (IMPORTANT_KINDS.has(node.kind)) { flush(); appendRoot(state, makeSimpleNode(state, node.kind === 'skill' ? 'skill' : node.kind === 'agent' ? 'agent' : node.kind === 'subtask' ? 'subtask' : node.kind === 'retry' ? 'retry' : 'unknown', importantLabel(node), [node], 0, { status: node.status, retryCount: node.kind === 'retry' ? 1 : 0 })); continue; }
    const category = classifyPathAction(node);
    const failed = node.status === 'error';
    if (!current || current.category !== category || current.failed !== failed) { flush(); current = { category, nodes: [], assistantMessageId: message.id, failed }; }
    current.nodes.push(node);
  }
  flush();
}

function appendPhase(state: BuilderState, group: ActionGroup): void {
  const root = makeSimpleNode(state, 'phase', phaseLabel(group.category, group.nodes.length), group.nodes, 0, { phaseCategory: group.category, assistantMessageId: group.assistantMessageId });
  const toolGroups = new Map<string, TrajectoryNode[]>();
  for (const node of group.nodes) {
    const key = node.toolName ?? node.kind;
    const list = toolGroups.get(key) ?? [];
    list.push(node); toolGroups.set(key, list);
  }
  for (const [tool, members] of toolGroups) {
    const toolNode = makeSimpleNode(state, 'tool-group', `${tool} × ${members.length}`, members, 1, { phaseCategory: group.category, parentGroupId: root.id, assistantMessageId: group.assistantMessageId });
    root.childIds.push(toolNode.id); root.expandable = true;
    for (const member of members) {
      const action = makeSimpleNode(state, member.kind === 'unknown' ? 'unknown' : 'tool-group', member.label, [member], 2, { phaseCategory: group.category, parentGroupId: toolNode.id, assistantMessageId: group.assistantMessageId, status: member.status });
      toolNode.childIds.push(action.id); toolNode.expandable = true;
    }
  }
  appendRoot(state, root);
}

function makeSimpleNode(state: BuilderState, kind: SessionPathNode['kind'], label: string, sources: TrajectoryNode[], level: 0 | 1 | 2, extra: Partial<SessionPathNode> = {}): SessionPathNode {
  const first = Math.min(...sources.map((n) => n.sourceOrder)); const last = Math.max(...sources.map((n) => n.sourceOrder));
  const id = `path-${kind}-${first}-${last}-${state.seq++}`;
  const sourceNodeIds = [...new Set(sources.map((n) => n.id))];
  const node: SessionPathNode = { id, kind, fullLabel: label, displayLabel: truncate(label, 46), sourceNodeIds, firstSourceOrder: first, lastSourceOrder: last, stepIds: [...new Set(sources.map(stepId).filter((v): v is string => !!v))], actionCount: sources.length, errorCount: sources.filter((n) => n.status === 'error').length, retryCount: sources.filter((n) => n.kind === 'retry').length, start: minDefined(sources.map((n) => n.start)), end: maxDefined(sources.map((n) => n.end)), durationMs: undefined, expandable: false, childIds: [], level, aggregate: { tools: sources.filter((n) => n.kind === 'tool').length, skills: sources.filter((n) => n.kind === 'skill').length, files: sources.filter((n) => n.kind === 'file').length, edits: sources.filter((n) => classifyPathAction(n) === 'modify').length, errors: sources.filter((n) => n.status === 'error').length, retries: sources.filter((n) => n.kind === 'retry').length, sourceNodes: sourceNodeIds.length }, ...extra };
  node.durationMs = node.start !== undefined && node.end !== undefined ? Math.max(0, node.end - node.start) : undefined;
  state.nodes.push(node); for (const id of sourceNodeIds) (state.sourceMap[id] ??= []).push(node.id);
  return node;
}
function appendRoot(state: BuilderState, node: SessionPathNode): void { state.roots.push(node.id); if (state.lastRoot) state.edges.push({ id: `path-edge-${state.lastRoot}->${node.id}`, source: state.lastRoot, target: node.id, kind: node.kind === 'skill' ? 'temporal-after-skill' : 'sequence', temporalOnly: node.kind === 'skill' || undefined }); state.lastRoot = node.id; }
function descendants(node: TrajectoryNode, byId: Map<string, TrajectoryNode>): TrajectoryNode[] { const result: TrajectoryNode[] = []; const visit = (id: string): void => { const child = byId.get(id); if (!child) return; result.push(child); child.children.forEach(visit); }; node.children.forEach(visit); return result; }
function importantLabel(node: TrajectoryNode): string { if (node.kind === 'skill') return `Skill: ${node.skillName ?? node.label.replace(/^Skill: /, '')}`; if (node.kind === 'retry') return 'Retry'; if (node.kind === 'unknown') return `Unknown: ${preview(node.originalType ?? node.label, 40)}`; return node.label; }
function phaseLabel(category: SessionPathPhaseCategory, count = 1): string { const base = PHASE_LABELS[category]; return count > 1 ? `${base} × ${count}` : base; }
function stepId(node: TrajectoryNode): string | undefined { return node.parentId?.includes('-step-') ? node.parentId : undefined; }
function minDefined(values: Array<number | undefined>): number | undefined { const nums = values.filter((v): v is number => v !== undefined); return nums.length ? Math.min(...nums) : undefined; }
function maxDefined(values: Array<number | undefined>): number | undefined { const nums = values.filter((v): v is number => v !== undefined); return nums.length ? Math.max(...nums) : undefined; }
function truncate(value: string, max: number): string { const chars = Array.from(value); return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : value; }
function mapUnrepresentedSources(state: BuilderState, session: NormalizedOpenCodeSession): void {
  for (const source of session.nodes) {
    if (source.id === session.rootNodeId || state.sourceMap[source.id]?.length) continue;
    const owner = state.nodes.find((node) => node.level === 0 && node.firstSourceOrder <= source.sourceOrder && node.lastSourceOrder >= source.sourceOrder)
      ?? state.nodes.filter((node) => node.level === 0 && node.firstSourceOrder >= source.sourceOrder).sort((a, b) => a.firstSourceOrder - b.firstSourceOrder)[0]
      ?? state.nodes.filter((node) => node.level === 0).sort((a, b) => b.lastSourceOrder - a.lastSourceOrder)[0];
    if (owner) { state.sourceMap[source.id] = [owner.id]; if (!owner.sourceNodeIds.includes(source.id)) owner.sourceNodeIds.push(source.id); }
  }
}

function compressLargePath(_state: BuilderState): void { /* Contiguous grouping keeps ordinary large sessions compact; hierarchy preserves source reachability. */ }
export { PHASE_LABELS as SESSION_PATH_PHASE_LABELS, MAX_INITIAL_LOW_PRIORITY_PHASES };
