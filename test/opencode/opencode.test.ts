import { describe, expect, it, vi } from 'vitest';
vi.mock('vscode', () => ({ Uri: { file: (fsPath: string) => ({ fsPath, path: fsPath, scheme: 'file', toString: () => `file://${fsPath}` }) }, workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_k: string, d: unknown) => d }) } }));
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { normalizeSession } from '../../src/opencode/buildTrajectory';
import { renderOpenCodeSessionReportHtml } from '../../src/ui/renderOpenCodeSessionReport';
import { buildNodeDetails, buildSessionViewModel } from '../../src/opencode/buildSessionViewModel';
import { buildSessionTree } from '../../src/opencode/sessionDiscovery';

const base = { info: { id: 's1', title: 'Demo <script>', parentID: undefined, time: { created: 10, updated: 40 }, version: 'x', model: 'm' }, messages: [ { info: { role: 'assistant' }, parts: [ { type: 'step-start', time: { start: 10 } }, { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'code-review' }, time: { start: 11, end: 12 } } }, { type: 'tool', tool: 'bash', state: { status: 'completed', input: { command: 'npm test' }, time: { start: 13, end: 20 }, output: '<img src=x onerror=alert(1)>' } }, { type: 'mystery', value: 1 }, { type: 'step-finish', time: { end: 40 } } ] } ] };

describe('OpenCode parser', () => {
  it('parses valid roots and preserves unknown parts/statuses', () => {
    const parsed = parseSessionExport({ ...base, messages: [{ info: { role: 'bot' }, parts: [{ type: 'tool', tool: 'x', state: { status: 'paused' } }] }] });
    expect(parsed.fatal).toBe(false);
    expect(parsed.session?.messages[0]?.role).toBe('unknown');
    expect(parsed.session?.messages[0]?.parts[0]?.status).toBe('paused');
    expect(parsed.diagnostics.some((d) => d.code.includes('unknown'))).toBe(true);
  });
  it('returns fatal root diagnostics', () => {
    expect(parseSessionExport(null).fatal).toBe(true);
    expect(parseSessionExport({ info: {} }).fatal).toBe(true);
  });
  it('detects sanitized exports', () => {
    const parsed = parseSessionExport({ info: {}, messages: [], secret: '[redacted: token]' });
    expect(parsed.session?.sanitization).toBe('likely-sanitized');
  });
});

describe('OpenCode trajectory', () => {
  it('keeps source order, groups steps, and builds temporal skill segments', () => {
    const parsed = parseSessionExport(base);
    const normalized = normalizeSession(parsed.session!, parsed.diagnostics);
    expect(normalized.metrics.skillCallCount).toBe(1);
    expect(normalized.metrics.unknownPartCount).toBe(1);
    expect(normalized.skills[0]?.followingNodeIds.length).toBe(2);
    expect(normalized.nodes.map((n) => n.sourceOrder)).toEqual([...normalized.nodes.map((n) => n.sourceOrder)].sort((a,b)=>a-b));
  });
  it('warns on broken step boundaries and omits negative durations', () => {
    const parsed = parseSessionExport({ info: {}, messages: [{ info: { role: 'assistant' }, parts: [{ type: 'step-finish' }, { type: 'tool', tool: 'x', state: { status: 'completed', time: { start: 10, end: 1 } } }] }] });
    const normalized = normalizeSession(parsed.session!, parsed.diagnostics);
    expect(normalized.diagnostics.some((d) => d.code === 'opencode.step.unmatchedFinish')).toBe(true);
    expect(normalized.nodes.find((n) => n.toolName === 'x')?.durationMs).toBeUndefined();
  });
});

describe('OpenCode renderer and tree helpers', () => {
  it('escapes untrusted HTML in the static report', () => {
    const parsed = parseSessionExport(base);
    const html = renderOpenCodeSessionReportHtml(buildSessionViewModel(normalizeSession(parsed.session!, parsed.diagnostics)), 'vscode-resource:');
    expect(html).toContain('&lt;script&gt;');
    expect(html).not.toContain('<script>alert');
    expect(html).toContain('temporal observations');
  });
  it('loads detailed tool and skill data lazily with structural context', () => {
    const parsed = parseSessionExport(base);
    const normalized = normalizeSession(parsed.session!, parsed.diagnostics);
    const skill = normalized.nodes.find((node) => node.kind === 'skill')!;
    const details = buildNodeDetails(normalized, skill.id)!;
    expect(details.fields).toContainEqual({ label: 'Source order', value: skill.sourceOrder.toString() });
    expect(details.fields).toContainEqual({ label: 'Parent message', value: 'assistant message' });
    expect(details.fields).toContainEqual({ label: 'Parent step', value: 'Step' });
    expect(details.warning).toBe('Actions observed after skill load. This does not prove causation.');
    const tool = normalized.nodes.find((node) => node.toolName === 'bash')!;
    const toolDetails = buildNodeDetails(normalized, tool.id)!;
    expect(toolDetails.fields).toContainEqual({ label: 'Input', value: '{\n  "command": "npm test"\n}' });
    expect(toolDetails.fields).toContainEqual({ label: 'Output', value: '<img src=x onerror=alert(1)>' });
  });
  it('nests child sessions under parents and sorts siblings', () => {
    const uri = (s: string) => ({ toString: () => s, path: s, scheme: 'file', fsPath: s }) as never;
    const tree = buildSessionTree([{ uri: uri('p'), uriString: 'p', fileName: 'p.json', size: 1, mtime: 1, id: 'p', title: 'p', updated: 1, toolCalls: 0, skillCalls: 0, errors: 0, children: [] }, { uri: uri('c'), uriString: 'c', fileName: 'c.json', size: 1, mtime: 2, id: 'c', parentId: 'p', title: 'c', updated: 2, toolCalls: 0, skillCalls: 0, errors: 0, children: [] }]);
    expect(tree).toHaveLength(1);
    expect(tree[0]?.children[0]?.id).toBe('c');
  });
});
