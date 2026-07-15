import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { buildSessionPathViewModel, classifyPathAction } from '../../src/opencode/buildSessionPathViewModel';
import { normalizeSession } from '../../src/opencode/buildTrajectory';
import type { NormalizedOpenCodeSession, TrajectoryNode } from '../../src/opencode/model';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { buildVisibleSessionPath, createSessionPathExpansionState, expandPathNodeOneLevel, hidePathNodeContents, pathFocusState, searchSessionPath, showPathNodeContents } from '../../src/opencode/sessionPathState';

function session(parts: unknown[]): NormalizedOpenCodeSession {
  const parsed = parseSessionExport({ info: { id: 'path', title: 'Path fixture' }, messages: [{ info: { role: 'user' }, parts: [{ type: 'text', text: 'Do it' }] }, { info: { role: 'assistant' }, parts }] });
  return normalizeSession(parsed.session!, parsed.diagnostics);
}
function action(toolName: string, preview = ''): TrajectoryNode { return { id: toolName, kind: 'tool', sourceOrder: 1, label: toolName, toolName, preview, children: [] }; }

describe('session path model', () => {
  it('builds deterministic route nodes, edges, and source mappings', () => {
    const normalized = session([{ type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'pdfs' } } }, { type: 'tool', tool: 'read' }, { type: 'tool', tool: 'read' }, { type: 'tool', tool: 'grep' }, { type: 'tool', tool: 'edit' }, { type: 'tool', tool: 'bash', state: { input: { command: 'npm test' } } }, { type: 'text', text: 'Done' }]);
    const first = buildSessionPathViewModel(normalized);
    expect(buildSessionPathViewModel(normalized)).toEqual(first);
    expect(first.nodes.some((node) => node.kind === 'request')).toBe(true);
    expect(first.nodes.some((node) => node.kind === 'response')).toBe(true);
    expect(first.nodes.some((node) => node.kind === 'skill' && node.fullLabel.includes('pdfs'))).toBe(true);
    expect(first.nodes.some((node) => node.phaseCategory === 'inspect' && node.actionCount === 2)).toBe(true);
    expect(first.nodes.some((node) => node.phaseCategory === 'search')).toBe(true);
    expect(first.nodes.some((node) => node.phaseCategory === 'modify')).toBe(true);
    expect(first.nodes.some((node) => node.phaseCategory === 'validate')).toBe(true);
    const ids = new Set(first.nodes.map((node) => node.id));
    expect(first.edges.every((edge) => ids.has(edge.source) && ids.has(edge.target))).toBe(true);
    expect(new Set(first.edges.map((edge) => edge.id)).size).toBe(first.edges.length);
    for (const node of normalized.nodes.filter((n) => n.id !== normalized.rootNodeId)) expect(first.sourceNodeToPathNodeIds[node.id]?.length).toBeGreaterThan(0);
  });

  it('classifies representative tools and commands without mutating nodes', () => {
    const cases: Array<[TrajectoryNode, string | undefined, string]> = [[action('read'), undefined, 'inspect'], [action('glob'), undefined, 'inspect'], [action('grep'), undefined, 'search'], [action('find'), undefined, 'search'], [action('fetch'), undefined, 'retrieve'], [action('edit'), undefined, 'modify'], [action('apply_patch'), undefined, 'modify'], [action('bash'), 'echo hi', 'execute'], [action('bash'), 'npm test', 'validate'], [action('bash'), 'npm run lint', 'validate'], [action('bash'), 'npm run check-types', 'validate'], [action('bash'), 'npm run build', 'validate'], [action('mystery'), undefined, 'other']];
    for (const [node, raw, expected] of cases) { const before = JSON.stringify(node); expect(classifyPathAction(node, raw)).toBe(expected); expect(JSON.stringify(node)).toBe(before); }
    expect(classifyPathAction(action('READ'))).toBe('inspect');
  });

  it('keeps contiguous grouping boundaries for separated phases, skills, errors, retries, and turns', () => {
    const model = buildSessionPathViewModel(session([{ type: 'tool', tool: 'read' }, { type: 'tool', tool: 'edit' }, { type: 'tool', tool: 'read' }, { type: 'tool', tool: 'skill', state: { input: { name: 'x' } } }, { type: 'tool', tool: 'read', state: { status: 'error' } }, { type: 'retry' }, { type: 'tool', tool: 'read' }]));
    const level0 = model.rootNodeIds.map((id) => model.nodes.find((node) => node.id === id)!);
    expect(level0.filter((node) => node.phaseCategory === 'inspect')).toHaveLength(3);
    expect(level0.some((node) => node.kind === 'skill')).toBe(true);
    expect(level0.some((node) => node.kind === 'error')).toBe(true);
    expect(level0.some((node) => node.kind === 'retry')).toBe(true);
  });

  it('supports progressive drill-down projection without hidden layout nodes or duplicate edges', () => {
    const model = buildSessionPathViewModel(session([{ type: 'tool', tool: 'read' }, { type: 'tool', tool: 'read' }, { type: 'tool', tool: 'glob' }]));
    const phase = model.nodes.find((node) => node.kind === 'phase')!;
    const initial = buildVisibleSessionPath(model, createSessionPathExpansionState(model.initialState.collapsedNodeIds));
    expect(initial.nodes.every((node) => node.level === 0)).toBe(true);
    const one = buildVisibleSessionPath(model, expandPathNodeOneLevel(createSessionPathExpansionState(model.initialState.collapsedNodeIds), phase.id, model));
    expect(one.nodes.some((node) => node.level === 1)).toBe(true);
    expect(one.nodes.every((node) => node.level < 2)).toBe(true);
    const all = buildVisibleSessionPath(model, showPathNodeContents(createSessionPathExpansionState(model.initialState.collapsedNodeIds), phase.id, model));
    expect(all.nodes.some((node) => node.level === 2)).toBe(true);
    const hidden = buildVisibleSessionPath(model, hidePathNodeContents(showPathNodeContents(createSessionPathExpansionState(model.initialState.collapsedNodeIds), phase.id, model), phase.id, model));
    expect(hidden.nodes.every((node) => node.level === 0)).toBe(true);
    const visibleIds = new Set(all.nodes.map((node) => node.id));
    expect(all.edges.every((edge) => visibleIds.has(edge.source) && visibleIds.has(edge.target))).toBe(true);
    expect(new Set(all.edges.map((edge) => edge.id)).size).toBe(all.edges.length);
  });

  it('searches hidden path members and computes focus classes', () => {
    const model = buildSessionPathViewModel(session([{ type: 'tool', tool: 'read' }, { type: 'tool', tool: 'grep' }, { type: 'tool', tool: 'edit' }]));
    expect(searchSessionPath(model, 'modify')).toHaveLength(1);
    const phase = model.nodes.find((node) => node.phaseCategory === 'search')!;
    const focus = pathFocusState(model, phase.id);
    expect(focus.focused.has(phase.id)).toBe(true);
    expect(focus.connected.size).toBeGreaterThan(0);
    expect(pathFocusState(model).context.size).toBe(model.nodes.length);
  });

  it('handles large sessions deterministically while mapping all source nodes', () => {
    for (const size of [500, 1000, 5000]) {
      const parts = Array.from({ length: size }, (_, index) => ({ type: 'tool', tool: index % 20 === 0 ? 'grep' : 'read' }));
      const normalized = session(parts);
      const model = buildSessionPathViewModel(normalized);
      expect(model.rootNodeIds.length).toBeLessThan(size / 2);
      for (const node of normalized.nodes.filter((n) => n.id !== normalized.rootNodeId)) expect(model.sourceNodeToPathNodeIds[node.id]?.length).toBeGreaterThan(0);
      expect(buildSessionPathViewModel(normalized)).toEqual(model);
    }
  });

  it('keeps malicious labels as inert text data', () => {
    const model = buildSessionPathViewModel(session([{ type: 'tool', tool: '<img src=x onerror=alert(1)>', state: { status: 'completed' } }, { type: 'text', text: '<script>alert(1)</script>' }]));
    expect(JSON.stringify(model)).toContain('<img');
    expect(model.nodes.some((node) => node.fullLabel.includes('<script>'))).toBe(false);
  });
});
