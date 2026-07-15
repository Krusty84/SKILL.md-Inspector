import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({}));

import { normalizeSession } from '../../src/opencode/buildTrajectory';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';

function normalize(parts: unknown[], extraMessages: unknown[] = []) {
  const parsed = parseSessionExport({ info: { id: 'skills', title: 'Skill usage' }, messages: [{ info: { role: 'assistant' }, parts }, ...extraMessages] });
  return normalizeSession(parsed.session!, parsed.diagnostics);
}

describe('OpenCode skill temporal segment analysis', () => {
  it('keeps following actions across compatible step boundaries', () => {
    const session = normalize([
      { type: 'step-start' },
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'review' } } },
      { type: 'tool', tool: 'read', state: { status: 'completed' } },
      { type: 'step-finish' },
      { type: 'step-start' },
      { type: 'tool', tool: 'grep', state: { status: 'completed' } },
      { type: 'step-finish' },
    ]);
    expect(session.skills).toHaveLength(1);
    expect(session.skills[0]?.followingNodeIds.map((id) => session.nodes.find((node) => node.id === id)?.toolName)).toEqual(['read', 'grep']);
    expect(session.skills[0]?.relationship).toBe('temporal');
  });

  it('terminates a previous skill segment at the next skill', () => {
    const session = normalize([
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'first' } } },
      { type: 'tool', tool: 'read', state: { status: 'completed' } },
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'second' } } },
      { type: 'tool', tool: 'edit', state: { status: 'completed' } },
    ]);
    expect(session.skills).toHaveLength(2);
    expect(session.skills[0]?.followingNodeIds.map((id) => session.nodes.find((node) => node.id === id)?.toolName)).toEqual(['read']);
    expect(session.skills[1]?.followingNodeIds.map((id) => session.nodes.find((node) => node.id === id)?.toolName)).toEqual(['edit']);
  });

  it('does not let skill temporal segments cross assistant-message boundaries', () => {
    const session = normalize([
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'message-one' } } },
    ], [
      { info: { role: 'assistant' }, parts: [{ type: 'tool', tool: 'read', state: { status: 'completed' } }] },
    ]);
    expect(session.skills).toHaveLength(1);
    expect(session.skills[0]?.followingNodeIds).toEqual([]);
  });

  it('gives a skill at the end of a message no following actions', () => {
    const session = normalize([{ type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'end' } } }]);
    expect(session.skills).toHaveLength(1);
    expect(session.skills[0]?.followingNodeIds).toEqual([]);
    expect(session.skills[0]?.relationship).toBe('temporal');
  });

  it('summarizes errors without claiming causation', () => {
    const session = normalize([
      { type: 'tool', tool: 'skill', state: { status: 'completed', input: { name: 'testing' } } },
      { type: 'tool', tool: 'bash', state: { status: 'error', error: 'failed' } },
      { type: 'retry' },
    ]);
    expect(session.skills[0]?.actionSummary).toMatchObject({ bash: 1, retry: 1, errors: 1 });
    expect(session.skills[0]?.relationship).toBe('temporal');
  });
});
