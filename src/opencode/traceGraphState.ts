import type { TraceGraphEdge, TraceGraphMode, TraceGraphNode, TraceGraphViewModel } from './model';

export interface VisibleTraceGraph {
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
}

export interface TraceGraphExpansionState {
  collapsedNodeIds: Set<string>;
  fullyShownNodeIds: Set<string>;
}

export interface GraphRect { id: string; parentIds: string[]; x1: number; y1: number; x2: number; y2: number }

const OVERVIEW_KINDS = new Set(['session', 'user-message', 'assistant-message', 'step', 'skill', 'tool', 'subtask', 'agent', 'retry', 'compaction', 'unknown']);
const GRAPH_RECT_EPSILON = 0.5;

export function createTraceGraphExpansionState(collapsedNodeIds: Iterable<string> = []): TraceGraphExpansionState {
  return { collapsedNodeIds: new Set(collapsedNodeIds), fullyShownNodeIds: new Set() };
}

export function buildVisibleTraceGraph(model: TraceGraphViewModel, mode: TraceGraphMode, collapsedNodeIds: Iterable<string> | TraceGraphExpansionState): VisibleTraceGraph {
  const state = isExpansionState(collapsedNodeIds) ? collapsedNodeIds : createTraceGraphExpansionState(collapsedNodeIds);
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const collapsed = state.collapsedNodeIds;
  const modeIds = idsForMode(model, mode, nodeById);
  const visibleIds = new Set<string>();
  for (const node of model.nodes) {
    if (!modeIds.has(node.id) || hasCollapsedAncestor(node, collapsed, nodeById)) continue;
    visibleIds.add(node.id);
  }
  const remappedEdges = new Map<string, TraceGraphEdge>();
  for (const edge of model.edges) {
    if (edge.kind === 'sequence') continue;
    if (!edgeAllowed(edge, mode)) continue;
    const source = visibleEndpoint(edge.source, visibleIds, collapsed, nodeById);
    const target = visibleEndpoint(edge.target, visibleIds, collapsed, nodeById);
    if (!source || !target || source === target) continue;
    const id = `${edge.kind}:${source}->${target}`;
    if (!remappedEdges.has(id)) remappedEdges.set(id, { ...edge, id, source, target });
  }
  addVisibleSequenceEdges(remappedEdges, model.nodes, visibleIds, collapsed, nodeById);
  return { nodes: model.nodes.filter((node) => visibleIds.has(node.id)), edges: [...remappedEdges.values()] };
}

export function expandOneLevel(state: TraceGraphExpansionState, nodeId: string, model: TraceGraphViewModel): TraceGraphExpansionState {
  const next = cloneExpansionState(state);
  const node = model.nodes.find((candidate) => candidate.id === nodeId);
  if (!node?.collapsible) return next;
  next.collapsedNodeIds.delete(nodeId);
  next.fullyShownNodeIds.delete(nodeId);
  return next;
}

export function showSubtree(state: TraceGraphExpansionState, nodeId: string, model: TraceGraphViewModel, mode: TraceGraphMode): TraceGraphExpansionState {
  const next = cloneExpansionState(state);
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const allowed = idsForMode(model, mode, nodeById);
  for (const descendant of descendants(nodeId, model, nodeById)) {
    if (allowed.has(descendant.id)) next.collapsedNodeIds.delete(descendant.id);
  }
  next.collapsedNodeIds.delete(nodeId);
  next.fullyShownNodeIds.add(nodeId);
  return next;
}

export function hideSubtree(state: TraceGraphExpansionState, nodeId: string, model: TraceGraphViewModel): TraceGraphExpansionState {
  const next = cloneExpansionState(state);
  const node = model.nodes.find((candidate) => candidate.id === nodeId);
  if (!node?.collapsible) return next;
  next.collapsedNodeIds.add(nodeId);
  next.fullyShownNodeIds.delete(nodeId);
  for (const descendant of descendants(nodeId, model)) {
    next.fullyShownNodeIds.delete(descendant.id);
  }
  return next;
}

export function traceGraphExpansionActions(state: TraceGraphExpansionState, nodeId: string, model: TraceGraphViewModel, mode: TraceGraphMode): { expand: boolean; showContents: boolean; hideContents: boolean } {
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const node = nodeById.get(nodeId);
  const allowed = idsForMode(model, mode, nodeById);
  const childNodes = model.nodes.filter((candidate) => candidate.parentId === nodeId && allowed.has(candidate.id));
  const allowedDescendants = descendants(nodeId, model, nodeById).filter((candidate) => allowed.has(candidate.id));
  if (!node || !node.collapsible || !allowedDescendants.length) return { expand: false, showContents: false, hideContents: false };
  const collapsed = state.collapsedNodeIds.has(nodeId);
  const visible = buildVisibleTraceGraph(model, mode, state).nodes;
  const visibleIds = new Set(visible.map((candidate) => candidate.id));
  const hiddenDirect = childNodes.some((child) => !visibleIds.has(child.id));
  const hiddenDescendant = allowedDescendants.some((child) => !visibleIds.has(child.id));
  const visibleDescendant = allowedDescendants.some((child) => visibleIds.has(child.id));
  return {
    expand: collapsed ? childNodes.length > 0 : hiddenDirect,
    showContents: hiddenDescendant,
    hideContents: visibleDescendant || (!collapsed && allowedDescendants.length > 0),
  };
}

export function findUnexpectedOverlaps(rects: GraphRect[]): Array<{ first: string; second: string }> {
  const overlaps: Array<{ first: string; second: string }> = [];
  for (let i = 0; i < rects.length; i += 1) {
    for (let j = i + 1; j < rects.length; j += 1) {
      const first = rects[i];
      const second = rects[j];
      if (isAncestor(first, second) || isAncestor(second, first)) continue;
      if (first.x1 < second.x2 - GRAPH_RECT_EPSILON && first.x2 > second.x1 + GRAPH_RECT_EPSILON && first.y1 < second.y2 - GRAPH_RECT_EPSILON && first.y2 > second.y1 + GRAPH_RECT_EPSILON) overlaps.push({ first: first.id, second: second.id });
    }
  }
  return overlaps;
}

function isExpansionState(value: Iterable<string> | TraceGraphExpansionState): value is TraceGraphExpansionState { return 'collapsedNodeIds' in value && 'fullyShownNodeIds' in value; }
function cloneExpansionState(state: TraceGraphExpansionState): TraceGraphExpansionState { return { collapsedNodeIds: new Set(state.collapsedNodeIds), fullyShownNodeIds: new Set(state.fullyShownNodeIds) }; }
function isAncestor(ancestor: GraphRect, child: GraphRect): boolean { return child.parentIds.includes(ancestor.id); }
function descendants(nodeId: string, model: TraceGraphViewModel, existing?: Map<string, TraceGraphNode>): TraceGraphNode[] { const byId = existing ?? new Map(model.nodes.map((node) => [node.id, node])); const result: TraceGraphNode[] = []; const visit = (id: string): void => { for (const child of model.nodes.filter((node) => node.parentId === id)) { result.push(child); visit(child.id); } }; if (byId.has(nodeId)) visit(nodeId); return result; }

function addVisibleSequenceEdges(edges: Map<string, TraceGraphEdge>, nodes: TraceGraphNode[], visibleIds: Set<string>, collapsed: Set<string>, nodeById: Map<string, TraceGraphNode>): void {
  const messages = nodes.filter((node) => node.kind === 'assistant-message' && visibleIds.has(node.id) && !collapsed.has(node.id));
  for (const message of messages) {
    const candidates = nodes.filter((node) => {
      if (!visibleIds.has(node.id) || node.id === message.id) return false;
      if (assistantMessageAncestor(node, nodeById)?.id !== message.id) return false;
      if (collapsed.has(node.id)) return true;
      return node.kind !== 'step' && node.kind !== 'session' && node.kind !== 'assistant-message' && node.kind !== 'user-message';
    }).sort((a, b) => a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id));
    for (let index = 1; index < candidates.length; index += 1) {
      const source = candidates[index - 1].id;
      const target = candidates[index].id;
      const id = `sequence:${source}->${target}`;
      if (!edges.has(id)) edges.set(id, { id, source, target, kind: 'sequence' });
    }
  }
}

function assistantMessageAncestor(node: TraceGraphNode, nodeById: Map<string, TraceGraphNode>): TraceGraphNode | undefined { let current: TraceGraphNode | undefined = node; while (current) { if (current.kind === 'assistant-message') return current; current = current.parentId ? nodeById.get(current.parentId) : undefined; } return undefined; }

export function searchTraceGraph(model: TraceGraphViewModel, query: string): string[] {
  const normalized = query.trim().toLocaleLowerCase();
  if (!normalized) return [];
  return model.nodes.filter((node) => [node.fullLabel, node.label, node.toolName, node.skillName, node.preview, node.status, node.originalType].some((value) => value?.toLocaleLowerCase().includes(normalized))).sort((a, b) => a.sourceOrder - b.sourceOrder || a.id.localeCompare(b.id)).map((node) => node.id);
}

export function expandedCollapsedIdsForMode(model: TraceGraphViewModel, mode: TraceGraphMode, collapsedNodeIds: Iterable<string>): Set<string> {
  const result = new Set(collapsedNodeIds);
  if (mode !== 'skills' && mode !== 'errors') return result;
  const nodeById = new Map(model.nodes.map((node) => [node.id, node]));
  const targets = model.nodes.filter((node) => mode === 'skills' ? node.kind === 'skill' : node.status === 'error');
  for (const target of targets) { let current: TraceGraphNode | undefined = target; while (current) { result.delete(current.id); current = current.parentId ? nodeById.get(current.parentId) : undefined; } }
  return result;
}

export function relevantPathNodeIds(model: TraceGraphViewModel, nodeId: string, operation: 'predecessors' | 'successors' | 'local' | 'skill' | 'error'): Set<string> {
  const result = new Set([nodeId]);
  if (operation === 'skill') {
    for (const edge of model.edges) if (edge.kind === 'temporal-after-skill' && edge.source === nodeId) result.add(edge.target);
  } else if (operation === 'local' || operation === 'error') {
    const allowedKinds = new Set(['sequence', 'message-transition', 'subtask', 'retry']);
    for (const edge of model.edges) if (allowedKinds.has(edge.kind) && (edge.source === nodeId || edge.target === nodeId)) result.add(edge.source).add(edge.target);
  } else {
    const allowedKinds = new Set(['sequence', 'message-transition', 'subtask', 'retry']);
    const forward = operation === 'successors';
    const pending = [nodeId];
    while (pending.length) {
      const current = pending.shift()!;
      for (const edge of model.edges) {
        if (!allowedKinds.has(edge.kind)) continue;
        const next = forward && edge.source === current ? edge.target : !forward && edge.target === current ? edge.source : undefined;
        if (next && !result.has(next)) { result.add(next); pending.push(next); }
      }
    }
  }
  addAncestors(result, model.nodes);
  return result;
}

function idsForMode(model: TraceGraphViewModel, mode: TraceGraphMode, nodeById: Map<string, TraceGraphNode>): Set<string> {
  if (mode === 'full') return new Set(model.nodes.map((node) => node.id));
  if (mode === 'overview') return new Set(model.nodes.filter((node) => OVERVIEW_KINDS.has(node.kind)).map((node) => node.id));
  const ids = new Set<string>();
  if (mode === 'skills') { for (const node of model.nodes) if (node.kind === 'skill') ids.add(node.id); for (const edge of model.edges) if (edge.kind === 'temporal-after-skill') ids.add(edge.source).add(edge.target); }
  else { const errors = model.nodes.filter((node) => node.status === 'error'); for (const error of errors) { ids.add(error.id); for (const edge of model.edges) if ((edge.kind === 'sequence' || edge.kind === 'retry') && (edge.source === error.id || edge.target === error.id)) ids.add(edge.source).add(edge.target); } }
  addAncestors(ids, model.nodes, nodeById); return ids;
}
function addAncestors(ids: Set<string>, nodes: TraceGraphNode[], existing?: Map<string, TraceGraphNode>): void { const nodeById = existing ?? new Map(nodes.map((node) => [node.id, node])); for (const id of [...ids]) { let current = nodeById.get(id); while (current?.parentId) { ids.add(current.parentId); current = nodeById.get(current.parentId); } } }
function hasCollapsedAncestor(node: TraceGraphNode, collapsed: Set<string>, nodeById: Map<string, TraceGraphNode>): boolean { let parentId = node.parentId; while (parentId) { if (collapsed.has(parentId)) return true; parentId = nodeById.get(parentId)?.parentId; } return false; }
function visibleEndpoint(id: string, visible: Set<string>, collapsed: Set<string>, nodeById: Map<string, TraceGraphNode>): string | undefined { if (visible.has(id)) return id; let current = nodeById.get(id); while (current?.parentId) { if (collapsed.has(current.parentId) && visible.has(current.parentId)) return current.parentId; current = nodeById.get(current.parentId); } return undefined; }
function edgeAllowed(edge: TraceGraphEdge, mode: TraceGraphMode): boolean { if (edge.kind === 'related-file') return mode === 'full'; if (mode === 'skills') return edge.kind === 'temporal-after-skill' || edge.kind === 'sequence' || edge.kind === 'message-transition'; if (mode === 'errors') return edge.kind !== 'temporal-after-skill'; return true; }
