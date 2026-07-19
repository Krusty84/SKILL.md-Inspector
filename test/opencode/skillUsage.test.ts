import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { normalizeSession } from '../../src/opencode/buildTrajectory';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';

function normalize(messages: unknown[]) {
  const parsed = parseSessionExport({ info: { id: 'skills' }, messages });
  return normalizeSession(parsed.session!, parsed.diagnostics);
}

function assistant(parts: unknown[]) {
  return { info: { role: 'assistant' }, parts };
}

function skill(name: string) {
  return {
    type: 'tool',
    tool: 'skill',
    callID: `call-${name}`,
    state: { status: 'completed', input: { name } },
  };
}

function tool(name: string) {
  return { type: 'tool', tool: name, state: { status: 'completed' } };
}

function followingLabels(session: ReturnType<typeof normalize>, skillIndex: number): string[] {
  return session.skills[skillIndex].followingNodeIds.map((id) => {
    const node = session.nodes.find((candidate) => candidate.id === id)!;
    return node.toolName ?? node.kind;
  });
}

describe('OpenCode skill temporal segments', () => {
  it('continues following actions across steps in one assistant message', () => {
    const session = normalize([
      assistant([
        { type: 'step-start' },
        skill('review'),
        tool('read'),
        { type: 'step-finish' },
        { type: 'step-start' },
        tool('bash'),
        { type: 'step-finish' },
      ]),
    ]);

    expect(followingLabels(session, 0)).toEqual(['read', 'bash']);
  });

  it('terminates a skill segment at the next skill', () => {
    const session = normalize([
      assistant([skill('review'), tool('read'), skill('testing'), tool('edit')]),
    ]);

    expect(followingLabels(session, 0)).toEqual(['read']);
    expect(followingLabels(session, 1)).toEqual(['edit']);
  });

  it('does not cross assistant-message boundaries', () => {
    const session = normalize([
      assistant([skill('review'), tool('read')]),
      assistant([tool('bash')]),
    ]);

    expect(followingLabels(session, 0)).toEqual(['read']);
  });

  it('records no following actions for a skill at the end of a message', () => {
    const session = normalize([assistant([tool('read'), skill('final')])]);

    expect(session.skills[0].followingNodeIds).toEqual([]);
  });

  it('labels the relationship as temporal rather than causal', () => {
    const session = normalize([assistant([skill('review'), tool('edit')])]);

    expect(session.skills[0].relationship).toBe('temporal');
  });
});
