import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { buildTraceGraphViewModel, truncateGraphLabel } from '../../src/opencode/buildTraceGraphViewModel';
import { normalizeSession } from '../../src/opencode/buildTrajectory';
import type { NormalizedOpenCodeSession, OpenCodeMetrics, TrajectoryNode } from '../../src/opencode/model';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { buildVisibleTraceGraph, createTraceGraphExpansionState, expandOneLevel, expandedCollapsedIdsForMode, findUnexpectedOverlaps, hideSubtree, searchTraceGraph, showSubtree, traceGraphExpansionActions } from '../../src/opencode/traceGraphState';

function normalizedFixture(): NormalizedOpenCodeSession {
  const parsed = parseSessionExport({
    info: { id: 'graph', title: 'Graph fixture' },
    messages: [
      { info: { role: 'user' }, parts: [{ type: 'text', text: 'Please inspect' }] },
      {
        info: { role: 'assistant' },
        parts: [
          { type: 'step-start' },
          { type: 'tool', tool: 'skill', callID: 'skill-a', state: { status: 'completed', input: { name: 'code-review' } } },
          { type: 'reasoning', text: 'first thought' },
          { type: 'tool', tool: 'read', state: { status: 'completed' } },
          { type: 'step-finish' },
          { type: 'step-start' },
          { type: 'tool', tool: 'bash', state: { status: 'error', error: 'failed' } },
          { type: 'retry' },
          { type: 'file', path: 'src/index.ts' },
          { type: 'tool', tool: 'skill', callID: 'skill-b', state: { status: 'completed', input: { name: 'testing' } } },
          { type: 'tool', tool: 'edit', state: { status: 'completed' } },
          { type: 'mystery-action' },
          { type: 'step-finish' },
        ],
      },
      { info: { role: 'user' }, parts: [{ type: 'text', text: 'Thanks' }] },
      { info: { role: 'assistant' }, parts: [{ type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'empty' } } }] },
    ],
  });
  return normalizeSession(parsed.session!, parsed.diagnostics);
}

describe('trace graph model', () => {
  it('builds deterministic compound nodes and stable, valid edges', () => {
    const session = normalizedFixture();
    const first = buildTraceGraphViewModel(session);
    const second = buildTraceGraphViewModel(session);
    expect(second).toEqual(first);
    expect(first.nodes.find((node) => node.kind === 'step')?.parentId).toMatch(/^message-/);
    expect(first.edges.filter((edge) => edge.kind === 'message-transition')).toHaveLength(3);
    const edgeIds = first.edges.map((edge) => edge.id);
    expect(new Set(edgeIds).size).toBe(edgeIds.length);
    const nodeIds = new Set(first.nodes.map((node) => node.id));
    expect(first.edges.every((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))).toBe(true);
    expect(first.initialState.direction).toBe('top-to-bottom');
    expect(first.nodes.every((node) => node.fullLabel === node.label && node.displayLabel.length <= node.fullLabel.length)).toBe(true);
    expect(first.nodes.some((node) => node.kind === 'unknown')).toBe(true);
    expect(first.nodes.some((node) => node.status === 'error')).toBe(true);
    expect(first.edges.some((edge) => edge.kind === 'retry')).toBe(true);
  });

  it('preserves action source order and marks skill edges as temporal only', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const byId = new Map(model.nodes.map((node) => [node.id, node]));
    for (const edge of model.edges.filter((candidate) => candidate.kind === 'sequence')) {
      expect(byId.get(edge.source)!.sourceOrder).toBeLessThan(byId.get(edge.target)!.sourceOrder);
    }
    const temporal = model.edges.filter((edge) => edge.kind === 'temporal-after-skill');
    expect(temporal.length).toBeGreaterThan(0);
    expect(temporal.every((edge) => edge.temporalOnly && edge.label === 'Observed after skill load')).toBe(true);
  });

  it('aggregates secondary parts and remaps collapsed graphs without dangling edges', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const assistant = model.nodes.find((node) => node.kind === 'assistant-message')!;
    expect(assistant.aggregate).toMatchObject({ reasoningParts: 1, files: 1, errors: 1, skills: 2 });
    const collapsed = buildVisibleTraceGraph(model, 'overview', [assistant.id]);
    expect(collapsed.nodes.some((node) => node.parentId === assistant.id)).toBe(false);
    const visibleIds = new Set(collapsed.nodes.map((node) => node.id));
    expect(collapsed.edges.every((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))).toBe(true);
    const expanded = buildVisibleTraceGraph(model, 'overview', []);
    expect(expanded.nodes.length).toBeGreaterThan(collapsed.nodes.length);
    expect(expanded.nodes.some((node) => node.kind === 'reasoning')).toBe(false);
    const step = model.nodes.find((node) => node.kind === 'step' && node.aggregate?.skills)!;
    const collapsedStep = buildVisibleTraceGraph(model, 'overview', [step.id]);
    expect(collapsedStep.nodes.some((node) => node.parentId === step.id)).toBe(false);
    const stepVisibleIds = new Set(collapsedStep.nodes.map((node) => node.id));
    expect(collapsedStep.edges.every((edge) => stepVisibleIds.has(edge.source) && stepVisibleIds.has(edge.target))).toBe(true);
  });

  it('filters overview, skills, errors, and full modes without mutating the model', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const snapshot = JSON.stringify(model);
    const overview = buildVisibleTraceGraph(model, 'overview', []);
    const skills = buildVisibleTraceGraph(model, 'skills', []);
    const errors = buildVisibleTraceGraph(model, 'errors', []);
    const full = buildVisibleTraceGraph(model, 'full', []);
    expect(overview.nodes.some((node) => node.kind === 'text')).toBe(false);
    expect(skills.nodes.some((node) => node.kind === 'skill')).toBe(true);
    expect(skills.edges.some((edge) => edge.kind === 'temporal-after-skill')).toBe(true);
    expect(errors.nodes.some((node) => node.status === 'error')).toBe(true);
    expect(errors.nodes.filter((node) => node.kind === 'skill')).toHaveLength(0);
    expect(full.nodes).toHaveLength(model.nodes.length);
    expect(full.edges.some((edge) => edge.kind === 'sequence' && model.nodes.find((node) => node.id === edge.source)?.kind === 'reasoning')).toBe(true);
    expect(JSON.stringify(model)).toBe(snapshot);
  });

  it('expands skill and error ancestors when entering focused modes', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const allContainers = model.nodes.filter((node) => node.collapsible).map((node) => node.id);
    const skillsCollapsed = expandedCollapsedIdsForMode(model, 'skills', allContainers);
    const errorsCollapsed = expandedCollapsedIdsForMode(model, 'errors', allContainers);
    const skills = buildVisibleTraceGraph(model, 'skills', skillsCollapsed);
    const errors = buildVisibleTraceGraph(model, 'errors', errorsCollapsed);
    expect(skills.nodes.some((node) => node.kind === 'skill')).toBe(true);
    expect(errors.nodes.some((node) => node.status === 'error')).toBe(true);
  });

  it('searches all compact fields case-insensitively in source order', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    expect(searchTraceGraph(model, 'GRAPH FIXTURE')).toEqual(['session']);
    expect(searchTraceGraph(model, 'READ')).toHaveLength(1);
    expect(searchTraceGraph(model, 'code-review')).toHaveLength(1);
    expect(searchTraceGraph(model, 'mystery-action')).toHaveLength(1);
    const long = model.nodes.find((node) => node.kind === 'tool')!;
    long.displayLabel = 'hidden';
    long.fullLabel = 'A uniquely searchable full label';
    expect(searchTraceGraph(model, 'uniquely searchable')).toEqual([long.id]);
    const before = JSON.stringify(model);
    searchTraceGraph(model, 'error');
    expect(JSON.stringify(model)).toBe(before);
  });


  it('truncates display labels deterministically while preserving full labels', () => {
    expect(truncateGraphLabel('short', 40)).toBe('short');
    const value = 'Tool: execute an extremely long command with many arguments';
    expect(truncateGraphLabel(value, 36)).toBe('Tool: execute an extremely long com…');
    expect(truncateGraphLabel('🙂🙂🙂🙂', 3)).toBe('🙂🙂…');
    expect(truncateGraphLabel('éééé', 3)).toBe('éé…');
  });

  it('supports progressive expansion state and context command availability', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const assistant = model.nodes.find((node) => node.kind === 'assistant-message' && node.aggregate?.skills)!;
    let state = createTraceGraphExpansionState([assistant.id]);
    expect(buildVisibleTraceGraph(model, 'overview', state).nodes.some((node) => node.parentId === assistant.id)).toBe(false);
    expect(traceGraphExpansionActions(state, assistant.id, model, 'overview')).toMatchObject({ expand: true, showContents: true, hideContents: false });
    state = expandOneLevel(state, assistant.id, model);
    const oneLevel = buildVisibleTraceGraph(model, 'overview', state);
    expect(oneLevel.nodes.some((node) => node.parentId === assistant.id)).toBe(true);
    const step = model.nodes.find((node) => node.kind === 'step' && node.parentId === assistant.id)!;
    state = hideSubtree(state, step.id, model);
    expect(buildVisibleTraceGraph(model, 'overview', state).nodes.some((node) => node.parentId === step.id)).toBe(false);
    expect(traceGraphExpansionActions(state, step.id, model, 'overview')).toMatchObject({ expand: true, showContents: true, hideContents: false });
    state = showSubtree(state, assistant.id, model, 'overview');
    const shown = buildVisibleTraceGraph(model, 'overview', state);
    expect(shown.nodes.some((node) => node.parentId === step.id)).toBe(true);
    expect(traceGraphExpansionActions(state, assistant.id, model, 'overview')).toMatchObject({ expand: false, showContents: false, hideContents: true });
    const leaf = model.nodes.find((node) => node.kind === 'tool')!;
    expect(traceGraphExpansionActions(state, leaf.id, model, 'overview')).toMatchObject({ expand: false, showContents: false, hideContents: false });
  });

  it('remaps hidden descendant edges without dangling or duplicate edges', () => {
    const model = buildTraceGraphViewModel(normalizedFixture());
    const assistant = model.nodes.find((node) => node.kind === 'assistant-message' && node.aggregate?.skills)!;
    const collapsed = buildVisibleTraceGraph(model, 'overview', createTraceGraphExpansionState([assistant.id]));
    const visibleIds = new Set(collapsed.nodes.map((node) => node.id));
    expect(collapsed.edges.every((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))).toBe(true);
    expect(new Set(collapsed.edges.map((edge) => edge.id)).size).toBe(collapsed.edges.length);
    const skills = buildVisibleTraceGraph(model, 'skills', createTraceGraphExpansionState());
    expect(skills.edges.some((edge) => edge.temporalOnly)).toBe(true);
  });

  it('detects unexpected rectangle overlap while ignoring containment', () => {
    expect(findUnexpectedOverlaps([
      { id: 'a', parentIds: [], x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: 'b', parentIds: [], x1: 12, y1: 0, x2: 20, y2: 10 },
    ])).toEqual([]);
    expect(findUnexpectedOverlaps([
      { id: 'a', parentIds: [], x1: 0, y1: 0, x2: 10, y2: 10 },
      { id: 'b', parentIds: [], x1: 10, y1: 0, x2: 20, y2: 10 },
    ])).toEqual([]);
    expect(findUnexpectedOverlaps([
      { id: 'parent', parentIds: [], x1: 0, y1: 0, x2: 20, y2: 20 },
      { id: 'child', parentIds: ['parent'], x1: 5, y1: 5, x2: 10, y2: 10 },
      { id: 'other', parentIds: [], x1: 8, y1: 8, x2: 15, y2: 15 },
    ])).toEqual([{ first: 'parent', second: 'other' }, { first: 'child', second: 'other' }]);
  });

  it('honors the existing reasoning default without expanding large sessions', () => {
    expect(buildTraceGraphViewModel(normalizedFixture(), false).initialState.mode).toBe('full');
    expect(buildTraceGraphViewModel(syntheticSession(501), false).initialState.mode).toBe('overview');
  });
});

describe('skill temporal segments', () => {
  it('continues across steps, stops at the next skill, and stays within one assistant message', () => {
    const session = normalizedFixture();
    expect(session.skills).toHaveLength(3);
    expect(session.skills[0].callId).toBe('skill-a');
    expect(session.skills[0].followingNodeIds.map((id) => session.nodes.find((node) => node.id === id)?.toolName ?? session.nodes.find((node) => node.id === id)?.kind)).toEqual(['read', 'bash', 'retry', 'file']);
    expect(session.skills[1].followingNodeIds.map((id) => session.nodes.find((node) => node.id === id)?.toolName ?? session.nodes.find((node) => node.id === id)?.kind)).toEqual(['edit', 'unknown']);
    expect(session.skills[2].followingNodeIds).toEqual([]);
    expect(session.skills[0].messageId).not.toBe(session.skills[2].messageId);
  });
});

describe('large trace graph models', () => {
  it.each([501, 1001])('collapses a deterministic synthetic %i-node session without losing aggregate counts', (count) => {
    const session = syntheticSession(count);
    const first = buildTraceGraphViewModel(session);
    const second = buildTraceGraphViewModel(session);
    expect(first.large).toBe(true);
    expect(first).toEqual(second);
    const message = first.nodes.find((node) => node.kind === 'assistant-message')!;
    expect(first.initialState.collapsedNodeIds).toContain(message.id);
    expect(message.aggregate?.descendants).toBe(count - 2);
    const visible = buildVisibleTraceGraph(first, 'overview', first.initialState.collapsedNodeIds);
    expect(visible.nodes.length).toBeLessThan(count);
  });
});

function syntheticSession(count: number): NormalizedOpenCodeSession {
  const root: TrajectoryNode = { id: 'session', kind: 'session', sourceOrder: 0, label: 'Large', children: ['message-0'] };
  const message: TrajectoryNode = { id: 'message-0', kind: 'assistant-message', parentId: 'session', sourceOrder: 1, label: 'assistant message', children: [] };
  const nodes = [root, message];
  for (let index = 2; index < count; index += 1) {
    const node: TrajectoryNode = { id: `tool-${index}`, kind: 'tool', parentId: message.id, sourceOrder: index, label: `tool ${index}`, toolName: `tool-${index}`, status: 'completed', children: [] };
    nodes.push(node);
    message.children.push(node.id);
  }
  const metrics: OpenCodeMetrics = { messageCount: 1, userMessageCount: 0, assistantMessageCount: 1, stepCount: 0, toolCallCount: count - 2, toolErrorCount: 0, skillCallCount: 0, uniqueLoadedSkills: 0, retryCount: 0, compactionCount: 0, unknownPartCount: 0 };
  return { title: 'Large', sanitization: 'not-detected', diagnostics: [], nodes, rootNodeId: 'session', rawByReference: new Map(), messages: [], metrics, skills: [] };
}
