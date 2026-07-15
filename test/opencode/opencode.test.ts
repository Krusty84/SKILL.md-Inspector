import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: { file: (fsPath: string) => ({ fsPath, path: fsPath, scheme: 'file', toString: () => `file://${fsPath}` }) },
  workspace: { workspaceFolders: [], getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue }) },
}));

import { buildSessionViewModel } from '../../src/opencode/buildSessionViewModel';
import { normalizeSession } from '../../src/opencode/buildTrajectory';
import type { NormalizedOpenCodeSession, SessionSummary } from '../../src/opencode/model';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { buildSessionTree } from '../../src/opencode/sessionDiscovery';
import { isRecord } from '../../src/opencode/util';
import { renderOpenCodeSessionReportHtml } from '../../src/ui/renderOpenCodeSessionReport';

const fixtureRoot = new URL('../fixtures/opencode/', import.meta.url);

function fixture(name: string): unknown {
  return JSON.parse(readFileSync(new URL(name, fixtureRoot), 'utf8')) as unknown;
}

function normalize(value: unknown, maxPreviewCharacters = 20000): NormalizedOpenCodeSession {
  const parsed = parseSessionExport(value);
  expect(parsed.fatal).toBe(false);
  expect(parsed.session).toBeDefined();
  return normalizeSession(parsed.session!, parsed.diagnostics, { maxPreviewCharacters });
}

function mutableFixture(name: string): Record<string, unknown> {
  const value = structuredClone(fixture(name));
  if (!isRecord(value)) throw new Error(`Fixture ${name} must contain an object root.`);
  return value;
}

function fixtureInfo(root: Record<string, unknown>): Record<string, unknown> {
  if (!isRecord(root.info)) throw new Error('Fixture info must be an object.');
  return root.info;
}

function fixtureMessages(root: Record<string, unknown>): Record<string, unknown>[] {
  if (!Array.isArray(root.messages) || !root.messages.every(isRecord)) throw new Error('Fixture messages must be objects.');
  return root.messages;
}

function summary(id: string, parentId?: string, updated = 1, fileName = `${id}.json`): SessionSummary {
  const uriString = `file:///${fileName}`;
  return {
    uri: { toString: () => uriString, path: `/${fileName}`, scheme: 'file', fsPath: `/${fileName}` } as never,
    uriString,
    fileName,
    size: 1,
    mtime: updated,
    id,
    parentId,
    title: id,
    updated,
    toolCalls: 0,
    skillCalls: 0,
    errors: 0,
    children: [],
  };
}

function flattenTree(items: SessionSummary[]): SessionSummary[] {
  return items.flatMap((item) => [item, ...flattenTree(item.children)]);
}

describe('OpenCode real-format parsing and normalization', () => {
  it('parses a current real-format fixture and extracts session model and provider', () => {
    const session = normalize(fixture('regular-session.json'));

    expect(session.id).toBe('ses_regular');
    expect(session.model).toBe('fixture-model');
    expect(session.provider).toBe('fixture-provider');
    expect(session.version).toBe('1.2.3');
  });

  it('falls back to assistant modelID and providerID without replacing session metadata', () => {
    const fallbackRoot = mutableFixture('regular-session.json');
    delete fixtureInfo(fallbackRoot).model;
    const fallback = normalize(fallbackRoot);
    const sessionLevel = normalize(fixture('regular-session.json'));

    expect(fallback.model).toBe('fixture-message-model');
    expect(fallback.provider).toBe('fixture-message-provider');
    expect(sessionLevel.model).toBe('fixture-model');
    expect(sessionLevel.provider).toBe('fixture-provider');
  });

  it('reads nested session token metrics and cost', () => {
    const metrics = normalize(fixture('regular-session.json')).metrics;

    expect(metrics.totalCost).toBe(0.0123);
    expect(metrics.inputTokens).toBe(120);
    expect(metrics.outputTokens).toBe(45);
    expect(metrics.reasoningTokens).toBe(12);
    expect(metrics.cacheReadTokens).toBe(30);
    expect(metrics.cacheWriteTokens).toBe(8);
  });

  it('sums compatible assistant metrics only when each session total is missing', () => {
    const root = mutableFixture('regular-session.json');
    const info = fixtureInfo(root);
    delete info.tokens;
    delete info.cost;
    const assistant = fixtureMessages(root)[1];
    const secondAssistant = structuredClone(assistant);
    if (!isRecord(secondAssistant.info)) throw new Error('Assistant info must be an object.');
    secondAssistant.info.id = 'msg_assistant_2';
    secondAssistant.info.cost = 0.02;
    secondAssistant.info.tokens = { input: 5, output: 6, reasoning: 7, cache: { read: 8, write: 9 } };
    secondAssistant.parts = [];
    fixtureMessages(root).push(secondAssistant);

    const metrics = normalize(root).metrics;
    expect(metrics.totalCost).toBeCloseTo(0.0323);
    expect(metrics.inputTokens).toBe(125);
    expect(metrics.outputTokens).toBe(51);
    expect(metrics.reasoningTokens).toBe(19);
    expect(metrics.cacheReadTokens).toBe(38);
    expect(metrics.cacheWriteTokens).toBe(17);

    const sessionTotals = normalize(fixture('regular-session.json')).metrics;
    expect(sessionTotals.inputTokens).toBe(120);
    expect(sessionTotals.totalCost).toBe(0.0123);
  });

  it('ignores missing and non-finite assistant metric values without producing NaN', () => {
    const root = mutableFixture('regular-session.json');
    const info = fixtureInfo(root);
    delete info.tokens;
    const assistant = fixtureMessages(root)[1];
    if (!isRecord(assistant.info)) throw new Error('Assistant info must be an object.');
    assistant.info.tokens = { input: Number.POSITIVE_INFINITY, output: 'unknown' };

    const metrics = normalize(root).metrics;
    expect(metrics.inputTokens).toBeUndefined();
    expect(metrics.outputTokens).toBeUndefined();
    expect(Object.values(metrics).some((value) => typeof value === 'number' && Number.isNaN(value))).toBe(false);
  });

  it('reads assistant time.completed and retry time.created', () => {
    const session = normalize(fixture('regular-session.json'));
    const assistant = session.nodes.find((node) => node.kind === 'assistant-message');
    const retry = session.nodes.find((node) => node.kind === 'retry');

    expect(assistant?.start).toBe(1100);
    expect(assistant?.end).toBe(2400);
    expect(assistant?.durationMs).toBe(1300);
    expect(retry?.start).toBe(1400);
    expect(session.metrics.sessionDurationMs).toBe(1400);
  });

  it('does not invent timestamps or warnings for step boundary parts', () => {
    const parsed = parseSessionExport(fixture('regular-session.json'));
    const stepParts = parsed.session?.messages.flatMap((message) => message.parts).filter((part) => part.originalType === 'step-start' || part.originalType === 'step-finish') ?? [];

    expect(stepParts).toHaveLength(2);
    expect(stepParts.every((part) => part.start === undefined && part.end === undefined)).toBe(true);
    expect(parsed.diagnostics.some((diagnostic) => diagnostic.code.includes('time'))).toBe(false);
  });

  it('uses state.output and state.error for clean tool previews', () => {
    const completed = normalize(fixture('regular-session.json')).nodes.find((node) => node.toolName === 'read');
    const failed = normalize(fixture('tool-error-session.json')).nodes.find((node) => node.toolName === 'read');

    expect(completed?.preview).toBe('Safe fixture output');
    expect(completed?.preview).not.toContain('call_read');
    expect(failed?.preview).toBe('Synthetic file was not found');
    expect(failed?.preview).not.toContain('call_tool_error');
  });

  it('applies the configured preview limit and keeps the truncation marker', () => {
    const root = mutableFixture('regular-session.json');
    const tool = fixtureMessages(root)[1].parts;
    if (!Array.isArray(tool) || !isRecord(tool[3]) || !isRecord(tool[3].state)) throw new Error('Tool fixture shape changed.');
    tool[3].state.output = 'abcdefghijklmnopqrstuvwxyz';

    const node = normalize(root, 10).nodes.find((candidate) => candidate.toolName === 'read');
    expect(node?.preview?.startsWith('abcdefghij\n… truncated')).toBe(true);
    expect(node?.preview).toContain('16 characters');
  });

  it('counts assistant and tool errors separately and reports their combined total', () => {
    const assistantOnly = normalize(fixture('assistant-error-session.json'));
    const combinedRoot = mutableFixture('assistant-error-session.json');
    combinedRoot.messages = [
      ...fixtureMessages(combinedRoot),
      ...fixtureMessages(mutableFixture('tool-error-session.json')),
    ];
    const combined = normalize(combinedRoot);

    expect(assistantOnly.metrics.assistantErrorCount).toBe(1);
    expect(assistantOnly.metrics.toolErrorCount).toBe(0);
    expect(assistantOnly.nodes.find((node) => node.kind === 'assistant-message')).toMatchObject({ status: 'error', preview: 'APIError: Synthetic upstream failure' });
    expect(combined.metrics.toolErrorCount).toBe(1);
    expect(combined.metrics.assistantErrorCount).toBe(1);
    expect(combined.metrics.errorCount).toBe(2);
  });

  it('detects both current sanitized redaction forms', () => {
    const session = normalize(fixture('sanitized-session.json'));

    expect(session.sanitization).toBe('likely-sanitized');
    expect(session.diagnostics.some((diagnostic) => diagnostic.code === 'opencode.sanitized.likely')).toBe(true);
  });

  it('preserves unknown roles, part types, tool names, statuses, and fields', () => {
    const root = {
      info: { id: 'future', futureSessionField: { retained: true } },
      messages: [{
        info: { role: 'future-role', futureMessageField: 42 },
        parts: [{ type: 'future-part', futurePartField: 'kept' }, { type: 'tool', tool: 'future-tool', state: { status: 'paused' }, futureToolField: true }],
      }],
      futureRootField: ['kept'],
    };
    const parsed = parseSessionExport(root);

    expect(parsed.fatal).toBe(false);
    expect(parsed.session?.messages[0]?.role).toBe('unknown');
    expect(parsed.session?.messages[0]?.parts[0]?.kind).toBe('unknown');
    expect(parsed.session?.messages[0]?.parts[0]?.raw.futurePartField).toBe('kept');
    expect(parsed.session?.messages[0]?.parts[1]).toMatchObject({ toolName: 'future-tool', status: 'paused' });
    expect(parsed.session?.raw.futureRootField).toEqual(['kept']);
    expect(parsed.diagnostics.filter((diagnostic) => diagnostic.code.includes('unknown')).length).toBeGreaterThanOrEqual(3);
  });

  it('keeps root validation tolerant but rejects invalid required containers', () => {
    expect(parseSessionExport(null).fatal).toBe(true);
    expect(parseSessionExport({ info: {} }).fatal).toBe(true);
    expect(parseSessionExport({ info: {}, messages: [] }).fatal).toBe(false);
  });

  it('does not mutate a caller-owned diagnostic array', () => {
    const parsed = parseSessionExport(fixture('sanitized-session.json'));
    const diagnostics = [...parsed.diagnostics];
    normalizeSession(parsed.session!, diagnostics, { maxPreviewCharacters: 100 });

    expect(diagnostics).toEqual(parsed.diagnostics);
  });

  it('keeps negative durations undefined', () => {
    const session = normalize({
      info: {},
      messages: [{ info: { role: 'assistant', time: { created: 10, completed: 1 } }, parts: [{ type: 'tool', tool: 'read', state: { status: 'completed', time: { start: 10, end: 1 } } }] }],
    });

    expect(session.nodes.find((node) => node.kind === 'assistant-message')?.durationMs).toBeUndefined();
    expect(session.nodes.find((node) => node.toolName === 'read')?.durationMs).toBeUndefined();
  });
});

describe('OpenCode session tree construction', () => {
  it('builds normal parent-child trees from parent and child fixtures', () => {
    const parent = normalize(fixture('parent-session.json'));
    const child = normalize(fixture('child-session.json'));
    const tree = buildSessionTree([summary(parent.id!), summary(child.id!, child.parentId, 2)]);

    expect(tree).toHaveLength(1);
    expect(tree[0]?.id).toBe('ses_parent');
    expect(tree[0]?.children[0]?.id).toBe('ses_child');
  });

  it('keeps missing parents and self-parent references at the root', () => {
    const tree = buildSessionTree([summary('missing-child', 'absent'), summary('self', 'self')]);

    expect(tree.map((item) => item.id).sort()).toEqual(['missing-child', 'self']);
  });

  it('keeps every member of two-node and longer cycles visible as a root', () => {
    const twoNode = buildSessionTree([summary('a', 'b'), summary('b', 'a')]);
    const longer = buildSessionTree([summary('a', 'b'), summary('b', 'c'), summary('c', 'a')]);

    expect(twoNode.map((item) => item.id).sort()).toEqual(['a', 'b']);
    expect(flattenTree(twoNode)).toHaveLength(2);
    expect(longer.map((item) => item.id).sort()).toEqual(['a', 'b', 'c']);
    expect(flattenTree(longer)).toHaveLength(3);
  });

  it('handles duplicate IDs deterministically without dropping sessions', () => {
    const tree = buildSessionTree([summary('parent', undefined, 1, 'a.json'), summary('parent', undefined, 1, 'b.json'), summary('child', 'parent', 2, 'c.json')]);

    expect(flattenTree(tree)).toHaveLength(3);
    expect(tree.find((item) => item.fileName === 'a.json')?.children[0]?.id).toBe('child');
  });
});

describe('OpenCode static report', () => {
  it('shows complete metrics and escapes all recorded HTML', () => {
    const root = mutableFixture('regular-session.json');
    fixtureInfo(root).title = 'Demo <script>alert(1)</script>';
    const tool = fixtureMessages(root)[1].parts;
    if (!Array.isArray(tool) || !isRecord(tool[3]) || !isRecord(tool[3].state)) throw new Error('Tool fixture shape changed.');
    tool[3].state.output = '<img src=x onerror=alert(1)>';
    const html = renderOpenCodeSessionReportHtml(buildSessionViewModel(normalize(root)), 'vscode-resource:');

    expect(html).toContain('fixture-provider');
    expect(html).toContain('fixture-model');
    expect(html).toContain('Tool errors');
    expect(html).toContain('Assistant errors');
    expect(html).toContain('Total errors');
    expect(html).toContain('Cache read tokens');
    expect(html).toContain('Cache write tokens');
    expect(html).toContain('1400 ms');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<script');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain('<script src=');
  });
});
