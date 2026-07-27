import { describe, expect, it } from 'vitest';
import { AGENT_CAPABILITIES } from '../src/compat/agentCapabilities';
import type { AgentCapabilities, CapabilityFact } from '../src/types/AgentCompatibility';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Every provenance-carrying fact of one agent, for generic integrity checks. */
function factsOf(agent: AgentCapabilities): CapabilityFact<unknown>[] {
  const facts: CapabilityFact<unknown>[] = [
    agent.fields,
    agent.unknownFields,
    agent.nameDirectoryRule,
    ...Object.values(agent.fieldNotes),
  ];
  if (agent.discoverySegments) {
    facts.push(agent.discoverySegments);
  }
  if (agent.argumentSubstitution) {
    facts.push(agent.argumentSubstitution);
  }
  if (agent.dynamicContext) {
    facts.push(agent.dynamicContext);
  }
  return facts;
}

describe('agent capability table integrity (plan §8.1)', () => {
  it('lists the four v1 agents in stable projection order', () => {
    expect(AGENT_CAPABILITIES.agents.map((agent) => agent.agent)).toEqual([
      'spec',
      'claude-code',
      'codex',
      'opencode',
    ]);
    expect(AGENT_CAPABILITIES.agents.map((agent) => agent.label)).toEqual([
      'Spec (skills-ref)',
      'Claude Code',
      'Codex',
      'OpenCode',
    ]);
  });

  it('carries a source URL and an ISO verified-on date on every fact', () => {
    expect(AGENT_CAPABILITIES.verifiedOn).toMatch(ISO_DATE);
    for (const agent of AGENT_CAPABILITIES.agents) {
      for (const fact of factsOf(agent)) {
        expect(fact.sourceUrl).toMatch(/^https:\/\/.+/);
        expect(fact.verifiedOn).toMatch(ISO_DATE);
        if (fact.confidence !== undefined) {
          expect(['verified', 'reported']).toContain(fact.confidence);
        }
      }
    }
  });

  it('pins the spec allowed-field set to exactly the six documented fields', () => {
    const spec = AGENT_CAPABILITIES.agents.find((agent) => agent.agent === 'spec')!;
    expect([...spec.fields.value].sort()).toEqual(
      ['allowed-tools', 'compatibility', 'description', 'license', 'metadata', 'name'].sort(),
    );
    expect(spec.unknownFields.value).toBe('rejected');
  });

  it("pins Codex's bundled-validator field set and marks its directory-default name rule as reported", () => {
    const codex = AGENT_CAPABILITIES.agents.find((agent) => agent.agent === 'codex')!;
    expect([...codex.fields.value].sort()).toEqual(
      ['allowed-tools', 'description', 'license', 'metadata', 'name'].sort(),
    );
    expect(codex.nameDirectoryRule.value).toBe('directory-default');
    expect(codex.nameDirectoryRule.confidence).toBe('reported');
  });

  it('records the documented discovery segments per agent', () => {
    const byId = new Map(AGENT_CAPABILITIES.agents.map((agent) => [agent.agent, agent]));
    expect(byId.get('spec')!.discoverySegments).toBeNull();
    expect(byId.get('claude-code')!.discoverySegments!.value).toEqual(['.claude/skills/']);
    expect(byId.get('codex')!.discoverySegments!.value).toEqual(['.agents/skills/']);
    expect(byId.get('opencode')!.discoverySegments!.value).toEqual([
      '.opencode/skills/',
      '.claude/skills/',
      '.agents/skills/',
    ]);
  });
});
