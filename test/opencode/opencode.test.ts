import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  Uri: {
    file: (fsPath: string) => ({
      fsPath,
      path: fsPath,
      scheme: 'file',
      toString: () => `file://${fsPath}`,
    }),
  },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({ get: (_key: string, defaultValue: unknown) => defaultValue }),
  },
}));

import { normalizeSession } from '../../src/opencode/buildTrajectory';
import type { NormalizedOpenCodeSession, SessionSummary } from '../../src/opencode/model';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { buildSessionTree } from '../../src/opencode/sessionDiscovery';
import { getPath, isRecord } from '../../src/opencode/util';

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
  if (!Array.isArray(root.messages) || !root.messages.every(isRecord))
    throw new Error('Fixture messages must be objects.');
  return root.messages;
}

function summary(
  id: string,
  parentId?: string,
  updated = 1,
  fileName = `${id}.json`,
): SessionSummary {
  const uriString = `file:///${fileName}`;
  return {
    uri: {
      toString: () => uriString,
      path: `/${fileName}`,
      scheme: 'file',
      fsPath: `/${fileName}`,
    } as never,
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
    secondAssistant.info.tokens = {
      input: 5,
      output: 6,
      reasoning: 7,
      cache: { read: 8, write: 9 },
    };
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
    expect(
      Object.values(metrics).some((value) => typeof value === 'number' && Number.isNaN(value)),
    ).toBe(false);
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
    const stepParts =
      parsed.session?.messages
        .flatMap((message) => message.parts)
        .filter(
          (part) => part.originalType === 'step-start' || part.originalType === 'step-finish',
        ) ?? [];

    expect(stepParts).toHaveLength(2);
    expect(stepParts.every((part) => part.start === undefined && part.end === undefined)).toBe(
      true,
    );
    expect(parsed.diagnostics.some((diagnostic) => diagnostic.code.includes('time'))).toBe(false);
  });

  it('uses state.output and state.error for clean tool previews', () => {
    const completed = normalize(fixture('regular-session.json')).nodes.find(
      (node) => node.toolName === 'read',
    );
    const failed = normalize(fixture('tool-error-session.json')).nodes.find(
      (node) => node.toolName === 'read',
    );

    expect(completed?.preview).toBe('Safe fixture output');
    expect(completed?.preview).not.toContain('call_read');
    expect(failed?.preview).toBe('Synthetic file was not found');
    expect(failed?.preview).not.toContain('call_tool_error');
  });

  it('applies the configured preview limit and keeps the truncation marker', () => {
    const root = mutableFixture('regular-session.json');
    const tool = fixtureMessages(root)[1].parts;
    if (!Array.isArray(tool) || !isRecord(tool[3]) || !isRecord(tool[3].state))
      throw new Error('Tool fixture shape changed.');
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
    expect(assistantOnly.nodes.find((node) => node.kind === 'assistant-message')).toMatchObject({
      status: 'error',
      preview: 'APIError: Synthetic upstream failure',
    });
    expect(combined.metrics.toolErrorCount).toBe(1);
    expect(combined.metrics.assistantErrorCount).toBe(1);
    expect(combined.metrics.errorCount).toBe(2);
  });

  it('detects both current sanitized redaction forms', () => {
    const session = normalize(fixture('sanitized-session.json'));

    expect(session.sanitization).toBe('likely-sanitized');
    expect(
      session.diagnostics.some((diagnostic) => diagnostic.code === 'opencode.sanitized.likely'),
    ).toBe(true);
  });

  it('preserves unknown roles, part types, tool names, statuses, and fields', () => {
    const root = {
      info: { id: 'future', futureSessionField: { retained: true } },
      messages: [
        {
          info: { role: 'future-role', futureMessageField: 42 },
          parts: [
            { type: 'future-part', futurePartField: 'kept' },
            {
              type: 'tool',
              tool: 'future-tool',
              state: { status: 'paused' },
              futureToolField: true,
            },
          ],
        },
      ],
      futureRootField: ['kept'],
    };
    const parsed = parseSessionExport(root);

    expect(parsed.fatal).toBe(false);
    expect(parsed.session?.messages[0]?.role).toBe('unknown');
    expect(parsed.session?.messages[0]?.parts[0]?.kind).toBe('unknown');
    expect(parsed.session?.messages[0]?.parts[0]?.raw.futurePartField).toBe('kept');
    expect(parsed.session?.messages[0]?.parts[1]).toMatchObject({
      toolName: 'future-tool',
      status: 'paused',
    });
    expect(parsed.session?.raw.futureRootField).toEqual(['kept']);
    expect(
      parsed.diagnostics.filter((diagnostic) => diagnostic.code.includes('unknown')).length,
    ).toBeGreaterThanOrEqual(3);
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
      messages: [
        {
          info: { role: 'assistant', time: { created: 10, completed: 1 } },
          parts: [
            {
              type: 'tool',
              tool: 'read',
              state: { status: 'completed', time: { start: 10, end: 1 } },
            },
          ],
        },
      ],
    });

    expect(
      session.nodes.find((node) => node.kind === 'assistant-message')?.durationMs,
    ).toBeUndefined();
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
    const tree = buildSessionTree([
      summary('parent', undefined, 1, 'a.json'),
      summary('parent', undefined, 1, 'b.json'),
      summary('child', 'parent', 2, 'c.json'),
    ]);

    expect(flattenTree(tree)).toHaveLength(3);
    expect(tree.find((item) => item.fileName === 'a.json')?.children[0]?.id).toBe('child');
  });
});

describe('OpenCode schema compatibility diagnostics and report details', () => {
  it('validates the pinned strict fixture shape used by tests without making runtime parsing strict', () => {
    const schema = fixture('schema/opencode-session-export.schema.json');
    const strict = fixture('schema-conformant/strict-session.json');
    const parsed = parseSessionExport(strict);
    const session = normalize(strict);

    expect(isRecord(schema)).toBe(true);
    expect(parsed.fatal).toBe(false);
    expect(
      parsed.diagnostics.filter((diagnostic) => diagnostic.severity === 'warning'),
    ).toHaveLength(0);
    expect(
      parsed.session?.messages.flatMap((message) => message.parts.map((part) => part.originalType)),
    ).toEqual(
      expect.arrayContaining([
        'text',
        'reasoning',
        'file',
        'tool',
        'step-start',
        'step-finish',
        'snapshot',
        'patch',
        'agent',
        'subtask',
        'retry',
        'compaction',
      ]),
    );
    expect(
      session.nodes
        .filter((node) => node.kind === 'tool' || node.kind === 'skill')
        .map((node) => node.status)
        .sort(),
    ).toEqual(['completed', 'error', 'pending', 'running']);
  });

  it('reports cross-object invariants, duplicate IDs, missing IDs, required fields, and noncanonical prefixes non-fatally', () => {
    const root = mutableFixture('schema-conformant/strict-session.json');
    const messages = fixtureMessages(root);
    const info = fixtureInfo(root);
    info.id = 'bad_session';
    info.workspaceID = 'bad_workspace';
    delete info.slug;
    if (!isRecord(messages[0].info) || !isRecord(messages[1].info))
      throw new Error('Fixture message shape changed.');
    messages[0].info.id = 'bad_message';
    delete messages[0].info.agent;
    messages[1].info.id = 'bad_message';
    messages[1].info.parentID = 'missing_parent';
    const assistantParts = messages[1].parts;
    if (
      !Array.isArray(assistantParts) ||
      !isRecord(assistantParts[0]) ||
      !isRecord(assistantParts[1]) ||
      !isRecord(assistantParts[4])
    )
      throw new Error('Fixture part shape changed.');
    assistantParts[0].id = 'bad_part';
    assistantParts[1].id = 'bad_part';
    assistantParts[1].sessionID = 'other_session';
    assistantParts[1].messageID = 'other_message';
    delete assistantParts[1].type;
    assistantParts[4].callID = 'call_duplicate';
    if (!isRecord(assistantParts[5])) throw new Error('Fixture tool shape changed.');
    assistantParts[5].callID = 'call_duplicate';
    if (isRecord(assistantParts[5].state)) delete assistantParts[5].state.input;
    const parsed = parseSessionExport(root);
    const codes = parsed.diagnostics.map((diagnostic) => diagnostic.code);

    expect(parsed.fatal).toBe(false);
    expect(parsed.session?.messages).toHaveLength(2);
    expect(codes).toEqual(
      expect.arrayContaining([
        'opencode.id.sessionNoncanonical',
        'opencode.id.workspaceNoncanonical',
        'opencode.id.messageNoncanonical',
        'opencode.id.messageDuplicate',
        'opencode.invariant.assistantParentMissing',
        'opencode.id.partNoncanonical',
        'opencode.id.partDuplicate',
        'opencode.invariant.partSessionIdMismatch',
        'opencode.invariant.partMessageIdMismatch',
        'opencode.id.toolCallDuplicate',
        'opencode.required.string',
        'opencode.required.present',
      ]),
    );
    expect(
      parsed.diagnostics.find(
        (diagnostic) =>
          diagnostic.code === 'opencode.invariant.partMessageIdMismatch' &&
          diagnostic.message.includes('other_message'),
      )?.path,
    ).toContain('parts[1].messageID');
  });

  it('reports assistant self-parent references and parser-synthesized missing IDs without dropping source order', () => {
    const root = mutableFixture('schema-conformant/strict-session.json');
    const messages = fixtureMessages(root);
    if (!isRecord(messages[1].info)) throw new Error('Fixture message shape changed.');
    messages[1].info.parentID = messages[1].info.id;
    delete messages[1].info.id;
    const parts = messages[1].parts;
    if (!Array.isArray(parts) || !isRecord(parts[2]))
      throw new Error('Fixture part shape changed.');
    delete parts[2].id;
    const parsed = parseSessionExport(root);

    expect(parsed.fatal).toBe(false);
    expect(parsed.session?.messages.map((message) => message.sourceOrder)).toEqual([0, 1]);
    expect(parsed.session?.messages[1]?.parts.map((part) => part.sourceOrder).slice(0, 4)).toEqual([
      0, 1, 2, 3,
    ]);
    expect(parsed.diagnostics.map((diagnostic) => diagnostic.code)).toEqual(
      expect.arrayContaining(['opencode.id.messageMissing', 'opencode.id.partMissing']),
    );
  });

  it('labels named agent and subtask parts and surfaces retry errors and tool attachments', () => {
    const root = mutableFixture('schema-conformant/strict-session.json');
    const session = normalize(root);
    const labels = session.nodes.map((node) => node.label);
    const retry = session.nodes.find((node) => node.kind === 'retry');
    const attachments = session.nodes
      .map((node) => getPath(node.details, ['state', 'attachments']))
      .find((value) => value !== undefined);

    expect(labels).toContain('Agent: reviewer');
    expect(labels).toContain('Subtask: Review code');
    expect(retry?.preview).toContain('APIError: request failed');
    if (!Array.isArray(attachments) || !isRecord(attachments[0]))
      throw new Error('Expected a tool part with recorded attachments.');
    expect(attachments[0].filename).toBe('att.txt');
  });

  it('falls back to assistant then user agent while preserving explicit session agent and provider/model precedence', () => {
    const root = mutableFixture('schema-conformant/strict-session.json');
    expect(normalize(root).agent).toBe('session-agent');
    delete fixtureInfo(root).agent;
    expect(normalize(root).agent).toBe('assistant-agent');
    const messages = fixtureMessages(root);
    if (!isRecord(messages[1].info)) throw new Error('Fixture message shape changed.');
    delete messages[1].info.agent;
    expect(normalize(root).agent).toBe('user-agent');
    expect(normalize(root).model).toBe('session-model');
    expect(normalize(root).provider).toBe('session-provider');
  });
});
