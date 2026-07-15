import type {
  NodeKind,
  NormalizedOpenCodeSession,
  SessionHeaderViewModel,
  TraceGraphAggregate,
  TraceGraphEdge,
  TraceGraphEdgeKind,
  TraceGraphNode,
  TraceGraphViewModel,
  TrajectoryNode,
} from './model';
import { buildSessionPathViewModel } from './buildSessionPathViewModel';

const LARGE_SESSION_THRESHOLD = 500;
const OVERVIEW_ONLY_THRESHOLD = 1000;
export const TRACE_GRAPH_LABEL_LIMITS = {
  action: 40,
  skill: 44,
  message: 56,
  step: 48,
  session: 56,
  aggregate: 64,
} as const;

const ACTION_KINDS = new Set<NodeKind>(['skill', 'tool', 'subtask', 'agent', 'retry', 'compaction', 'unknown']);

export function buildTraceGraphViewModel(session: NormalizedOpenCodeSession, hideReasoningByDefault = true): TraceGraphViewModel {
  const sourceNodes = [...session.nodes].sort((a, b) => a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id));
  const sourceById = new Map(sourceNodes.map((node) => [node.id, node]));
  const large = sourceNodes.length > LARGE_SESSION_THRESHOLD;
  const collapsedNodeIds = initialCollapsedNodes(sourceNodes, sourceById, large);
  const nodes = sourceNodes.map((node) => toGraphNode(node, sourceById, collapsedNodeIds.has(node.id)));
  const edges = buildEdges(session, sourceNodes, sourceById);
  return {
    session: sessionHeader(session),
    path: buildSessionPathViewModel(session),
    metrics: session.metrics,
    diagnostics: session.diagnostics,
    nodes,
    edges,
    initialState: {
      mode: hideReasoningByDefault || large ? 'overview' : 'full',
      direction: 'top-to-bottom',
      collapsedNodeIds: [...collapsedNodeIds],
    },
    large,
  };
}

function sessionHeader(session: NormalizedOpenCodeSession): SessionHeaderViewModel {
  return {
    title: session.title,
    id: session.id,
    parentId: session.parentId,
    version: session.version,
    model: session.model,
    provider: session.provider,
    agent: session.agent,
    created: session.created,
    updated: session.updated,
    durationMs: session.metrics.sessionDurationMs,
    sanitization: session.sanitization,
  };
}

function toGraphNode(node: TrajectoryNode, sourceById: Map<string, TrajectoryNode>, initiallyCollapsed: boolean): TraceGraphNode {
  const collapsible = node.kind === 'session' || node.kind === 'user-message' || node.kind === 'assistant-message' || node.kind === 'step';
  return {
    id: node.id,
    parentId: node.parentId,
    kind: node.kind,
    label: node.label,
    fullLabel: node.label,
    displayLabel: truncateGraphLabel(node.label, maxLabelCharacters(node.kind)),
    description: node.description,
    preview: node.preview,
    sourceOrder: node.sourceOrder,
    status: node.status,
    toolName: node.toolName,
    skillName: node.skillName,
    start: node.start,
    end: node.end,
    durationMs: node.durationMs,
    synthetic: node.synthetic,
    incomplete: node.incomplete,
    originalType: node.originalType,
    collapsible,
    initiallyCollapsed,
    aggregate: collapsible ? aggregateFor(node, sourceById) : undefined,
  };
}

function aggregateFor(root: TrajectoryNode, sourceById: Map<string, TrajectoryNode>): TraceGraphAggregate {
  const aggregate: TraceGraphAggregate = { directChildren: root.children.length, descendants: 0, tools: 0, skills: 0, errors: 0, files: 0, textParts: 0, reasoningParts: 0, retries: 0 };
  const visit = (id: string): void => {
    const node = sourceById.get(id);
    if (!node) return;
    aggregate.descendants += 1;
    if (node.kind === 'tool') aggregate.tools += 1;
    if (node.kind === 'skill') aggregate.skills += 1;
    if (node.kind === 'file') aggregate.files += 1;
    if (node.kind === 'text') aggregate.textParts += 1;
    if (node.kind === 'reasoning') aggregate.reasoningParts += 1;
    if (node.kind === 'retry') aggregate.retries += 1;
    if (node.status === 'error') aggregate.errors += 1;
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return aggregate;
}

function initialCollapsedNodes(nodes: TrajectoryNode[], sourceById: Map<string, TrajectoryNode>, large: boolean): Set<string> {
  const collapsed = new Set<string>();
  if (!large) return collapsed;
  for (const node of nodes) {
    if (node.kind !== 'step' && node.kind !== 'user-message' && node.kind !== 'assistant-message') continue;
    const relevant = hasRelevantDescendant(node, sourceById);
    if (!relevant || nodes.length > OVERVIEW_ONLY_THRESHOLD) collapsed.add(node.id);
  }
  return collapsed;
}

function hasRelevantDescendant(root: TrajectoryNode, sourceById: Map<string, TrajectoryNode>): boolean {
  const pending = [...root.children];
  while (pending.length) {
    const node = sourceById.get(pending.shift()!);
    if (!node) continue;
    if (node.kind === 'skill' || node.status === 'error') return true;
    pending.push(...node.children);
  }
  return false;
}

function buildEdges(session: NormalizedOpenCodeSession, nodes: TrajectoryNode[], sourceById: Map<string, TrajectoryNode>): TraceGraphEdge[] {
  const edges = new Map<string, TraceGraphEdge>();
  const add = (kind: TraceGraphEdgeKind, source: string, target: string, label?: string, temporalOnly?: boolean): void => {
    if (source === target || !sourceById.has(source) || !sourceById.has(target)) return;
    const id = `${kind}:${source}->${target}`;
    if (!edges.has(id)) edges.set(id, { id, source, target, kind, label, temporalOnly });
  };
  const messages = nodes.filter((node) => node.parentId === session.rootNodeId && node.kind !== 'session');
  for (let index = 1; index < messages.length; index += 1) add('message-transition', messages[index - 1].id, messages[index].id, 'Next message');
  for (const message of messages.filter((node) => node.kind === 'assistant-message')) {
    const actions = descendantsOf(message, sourceById).filter((node) => node.children.length === 0).sort(bySourceOrder);
    for (let index = 1; index < actions.length; index += 1) add('sequence', actions[index - 1].id, actions[index].id);
    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index];
      if (action.kind === 'subtask' || action.kind === 'agent') add('subtask', action.parentId ?? message.id, action.id, 'Branch');
      if (action.kind === 'retry') {
        const previousAction = [...actions.slice(0, index)].reverse().find((node) => ACTION_KINDS.has(node.kind));
        if (previousAction) add('retry', previousAction.id, action.id, 'Retry');
      }
    }
    const all = descendantsOf(message, sourceById).sort(bySourceOrder);
    for (let index = 0; index < all.length; index += 1) {
      if (all[index].kind !== 'file') continue;
      const related = [...all.slice(0, index)].reverse().find((node) => ACTION_KINDS.has(node.kind));
      if (related) add('related-file', related.id, all[index].id, 'Related file');
    }
  }
  for (const observation of session.skills) {
    if (!observation.partId) continue;
    for (const target of observation.followingNodeIds) add('temporal-after-skill', observation.partId, target, 'Observed after skill load', true);
  }
  return [...edges.values()].sort((a, b) => edgeOrder(a, sourceById) - edgeOrder(b, sourceById) || a.id.localeCompare(b.id));
}

function descendantsOf(root: TrajectoryNode, sourceById: Map<string, TrajectoryNode>): TrajectoryNode[] {
  const result: TrajectoryNode[] = [];
  const visit = (id: string): void => {
    const node = sourceById.get(id);
    if (!node) return;
    result.push(node);
    for (const child of node.children) visit(child);
  };
  for (const child of root.children) visit(child);
  return result;
}

function bySourceOrder(a: TrajectoryNode, b: TrajectoryNode): number {
  return a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id);
}

function edgeOrder(edge: TraceGraphEdge, sourceById: Map<string, TrajectoryNode>): number {
  return sourceById.get(edge.source)?.sourceOrder ?? Number.MAX_SAFE_INTEGER;
}


function maxLabelCharacters(kind: NodeKind): number {
  if (kind === 'skill') return TRACE_GRAPH_LABEL_LIMITS.skill;
  if (kind === 'step') return TRACE_GRAPH_LABEL_LIMITS.step;
  if (kind === 'session' || kind === 'user-message' || kind === 'assistant-message') return TRACE_GRAPH_LABEL_LIMITS.message;
  return TRACE_GRAPH_LABEL_LIMITS.action;
}

export function truncateGraphLabel(value: string, maxCharacters: number): string {
  if (maxCharacters <= 1) return value ? '…' : '';
  const graphemes = splitGraphemes(value);
  if (graphemes.length <= maxCharacters) return value;
  return `${graphemes.slice(0, maxCharacters - 1).join('')}…`;
}

function splitGraphemes(value: string): string[] {
  const Segmenter = Intl.Segmenter;
  if (Segmenter) return [...new Segmenter(undefined, { granularity: 'grapheme' }).segment(value)].map((segment) => segment.segment);
  return Array.from(value);
}
