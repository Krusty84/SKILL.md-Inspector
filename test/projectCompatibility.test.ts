import { describe, expect, it } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { AGENT_CAPABILITIES, enabledCapabilityTable } from '../src/compat/agentCapabilities';
import {
  overallCompatibilityVerdict,
  projectCompatibility,
} from '../src/compat/projectCompatibility';
import type { AgentId, AgentProjection } from '../src/types/AgentCompatibility';

function project(filePath: string, content: string) {
  return projectCompatibility(parseSkillFile(filePath, content));
}

function agent(report: ReturnType<typeof project>, id: AgentId): AgentProjection {
  const projection = report.projections.find((p) => p.agent === id);
  if (!projection) {
    throw new Error(`No projection for ${id}`);
  }
  return projection;
}

const WELL_FORMED = [
  '---',
  'name: alpha',
  'description: Fill PDF forms. Use when asked to fill a PDF form.',
  '---',
  '',
  'Plain body.',
].join('\n');

describe('projectCompatibility — frontmatter field classification (plan §8.2/§8.3)', () => {
  it('classifies `context: fork` per agent: spec rejects, Claude Code honors, Codex and OpenCode note', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        'context: fork',
        '---',
        '',
        'Plain body.',
      ].join('\n'),
    );

    const spec = agent(report, 'spec');
    expect(spec.verdict).toBe('issues');
    expect(spec.findings).toContainEqual(
      expect.objectContaining({
        agent: 'spec',
        level: 'issue',
        kind: 'field-rejected',
        subject: 'context',
      }),
    );

    const claude = agent(report, 'claude-code');
    expect(claude.findings.filter((f) => f.subject === 'context')).toEqual([]);

    const codex = agent(report, 'codex');
    expect(codex.findings).toContainEqual(
      expect.objectContaining({ level: 'note', kind: 'field-unvalidated', subject: 'context' }),
    );

    const opencode = agent(report, 'opencode');
    expect(opencode.findings).toContainEqual(
      expect.objectContaining({ level: 'note', kind: 'field-ignored', subject: 'context' }),
    );
  });

  it('treats `allowed-tools` as a grant to review on Claude Code, ignored on OpenCode, silent on spec and Codex', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        'allowed-tools: Read Bash',
        '---',
        '',
        'Plain body.',
      ].join('\n'),
    );

    const claude = agent(report, 'claude-code');
    const claudeFinding = claude.findings.find((f) => f.subject === 'allowed-tools');
    expect(claudeFinding).toMatchObject({ level: 'note', kind: 'tool-grant' });
    expect(claudeFinding!.message).toContain('review the grant');

    const opencode = agent(report, 'opencode');
    const opencodeFinding = opencode.findings.find((f) => f.subject === 'allowed-tools');
    expect(opencodeFinding).toMatchObject({ level: 'note', kind: 'field-ignored' });
    expect(opencodeFinding!.message).toContain('opencode.json');

    expect(agent(report, 'codex').findings.filter((f) => f.subject === 'allowed-tools')).toEqual([]);
    expect(agent(report, 'spec').findings.filter((f) => f.subject === 'allowed-tools')).toEqual([]);
  });

  it('never inspects inside metadata', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        'metadata:',
        '  short-description: Fill forms',
        '  totally-unknown-key: value',
        '---',
        '',
        'Plain body.',
      ].join('\n'),
    );
    for (const projection of report.projections) {
      expect(projection.findings.filter((f) => f.subject?.startsWith('metadata'))).toEqual([]);
    }
  });
});

describe('projectCompatibility — name/directory relationship (plan §8.4)', () => {
  it('reports a mismatch as an issue for spec and OpenCode, a note for Claude Code and Codex', () => {
    const report = project(
      '/ws/skills/beta/SKILL.md',
      WELL_FORMED, // name: alpha inside directory beta/
    );

    expect(agent(report, 'spec').findings).toContainEqual(
      expect.objectContaining({
        level: 'issue',
        kind: 'name-dir-mismatch-enforced',
        subject: 'name',
      }),
    );
    expect(agent(report, 'opencode').findings).toContainEqual(
      expect.objectContaining({
        level: 'issue',
        kind: 'name-dir-mismatch-enforced',
        subject: 'name',
      }),
    );
    expect(agent(report, 'spec').verdict).toBe('issues');
    expect(agent(report, 'opencode').verdict).toBe('issues');

    const claudeFinding = agent(report, 'claude-code').findings.find((f) => f.subject === 'name');
    expect(claudeFinding).toMatchObject({ level: 'note', kind: 'name-dir-mismatch' });

    const codexFinding = agent(report, 'codex').findings.find((f) => f.subject === 'name');
    expect(codexFinding).toMatchObject({ level: 'note', kind: 'name-dir-mismatch' });
    // Codex's directory-default behavior is reported-confidence, so the message must hedge.
    expect(codexFinding!.message).toContain('reported');
  });

  it('emits no name findings when the name matches the folder', () => {
    const report = project('/ws/skills/alpha/SKILL.md', WELL_FORMED);
    for (const projection of report.projections) {
      expect(projection.findings.filter((f) => f.subject === 'name')).toEqual([]);
    }
  });
});

describe('projectCompatibility — discovery paths (plan §8.5)', () => {
  it('notes agents whose documented discovery paths do not contain an .opencode/skills/ skill', () => {
    const report = project('/repo/.opencode/skills/alpha/SKILL.md', WELL_FORMED);

    expect(agent(report, 'claude-code').findings).toContainEqual(
      expect.objectContaining({ level: 'note', kind: 'no-discovery-path' }),
    );
    expect(agent(report, 'codex').findings).toContainEqual(
      expect.objectContaining({ level: 'note', kind: 'no-discovery-path' }),
    );
    expect(
      agent(report, 'opencode').findings.filter((f) => f.kind === 'no-discovery-path'),
    ).toEqual([]);
    // The spec defines no discovery, so it never gets a discovery finding.
    expect(agent(report, 'spec').findings.filter((f) => f.kind === 'no-discovery-path')).toEqual(
      [],
    );
  });

  it('shares .claude/skills/ between Claude Code and OpenCode but not Codex', () => {
    const report = project('/repo/.claude/skills/alpha/SKILL.md', WELL_FORMED);
    expect(
      agent(report, 'claude-code').findings.filter((f) => f.kind === 'no-discovery-path'),
    ).toEqual([]);
    expect(
      agent(report, 'opencode').findings.filter((f) => f.kind === 'no-discovery-path'),
    ).toEqual([]);
    expect(agent(report, 'codex').findings).toContainEqual(
      expect.objectContaining({ level: 'note', kind: 'no-discovery-path' }),
    );
  });

  it('notes every tool agent for an unconventional location', () => {
    const report = project('/somewhere/else/alpha/SKILL.md', WELL_FORMED);
    for (const id of ['claude-code', 'codex', 'opencode'] as const) {
      expect(agent(report, id).findings).toContainEqual(
        expect.objectContaining({ level: 'note', kind: 'no-discovery-path' }),
      );
    }
  });
});

describe('projectCompatibility — body features (plan §8.6)', () => {
  it('flags a dynamic-context line as load-time execution on Claude Code and inert text elsewhere', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        '---',
        '',
        'Current state:',
        '!`git status`',
      ].join('\n'),
    );

    const claudeFinding = agent(report, 'claude-code').findings.find(
      (f) => f.kind === 'dynamic-context-executes',
    );
    expect(claudeFinding).toMatchObject({ level: 'note', subject: 'dynamic-context' });
    expect(claudeFinding!.message).toContain('load time');

    for (const id of ['codex', 'opencode'] as const) {
      const finding = agent(report, id).findings.find((f) => f.kind === 'dynamic-context-inert');
      expect(finding).toMatchObject({ level: 'note', subject: 'dynamic-context' });
      expect(finding!.message).toContain('inert text');
    }
    expect(
      agent(report, 'spec').findings.filter((f) => f.subject === 'dynamic-context'),
    ).toEqual([]);
  });

  it('does not flag a mid-token !` occurrence anywhere (the verified non-trigger case)', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        '---',
        '',
        'Set KEY=!`cmd` before running.',
      ].join('\n'),
    );
    for (const projection of report.projections) {
      expect(projection.findings.filter((f) => f.subject === 'dynamic-context')).toEqual([]);
    }
  });

  it('detects a ```! fenced block as dynamic context', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        '---',
        '',
        '```!',
        'git log --oneline -5',
        '```',
      ].join('\n'),
    );
    expect(agent(report, 'claude-code').findings).toContainEqual(
      expect.objectContaining({ kind: 'dynamic-context-executes' }),
    );
  });

  it('flags $ARGUMENTS and declared $name tokens as substituted on Claude Code and literal elsewhere', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        'arguments:',
        '  target: The file to fill',
        '---',
        '',
        'Fill $target using $ARGUMENTS.',
      ].join('\n'),
    );

    const claudeFinding = agent(report, 'claude-code').findings.find(
      (f) => f.kind === 'substitution-applies',
    );
    expect(claudeFinding).toMatchObject({ level: 'note', subject: 'arguments' });
    for (const id of ['codex', 'opencode'] as const) {
      const finding = agent(report, id).findings.find((f) => f.kind === 'substitution-inert');
      expect(finding).toMatchObject({ level: 'note', subject: 'arguments' });
      expect(finding!.message).toContain('literal');
    }
  });

  it('recognizes positional $N tokens and ignores escaped \\$ tokens', () => {
    const positional = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        '---',
        '',
        'Use $1 and $2.',
      ].join('\n'),
    );
    expect(agent(positional, 'claude-code').findings).toContainEqual(
      expect.objectContaining({ kind: 'substitution-applies' }),
    );

    const escaped = project(
      '/ws/skills/alpha/SKILL.md',
      [
        '---',
        'name: alpha',
        'description: Fill PDF forms. Use when asked to fill a PDF form.',
        '---',
        '',
        'Write a literal \\$ARGUMENTS marker and a \\$1 price.',
      ].join('\n'),
    );
    for (const projection of escaped.projections) {
      expect(projection.findings.filter((f) => f.subject === 'arguments')).toEqual([]);
    }
  });
});

describe('projectCompatibility — not-evaluated and determinism (plan §8.7/§8.8)', () => {
  it('marks every agent not-evaluated when frontmatter cannot be parsed', () => {
    const report = project('/ws/skills/alpha/SKILL.md', '# Just a body\n\nNo frontmatter here.');
    expect(report.projections).toHaveLength(4);
    for (const projection of report.projections) {
      expect(projection.verdict).toBe('not-evaluated');
      expect(projection.findings).toEqual([]);
      expect(projection.notEvaluatedReason).toBe('frontmatter could not be parsed');
    }
  });

  it('marks every agent not-evaluated for malformed YAML', () => {
    const report = project(
      '/ws/skills/alpha/SKILL.md',
      ['---', 'name: [unclosed', '---', 'Body.'].join('\n'),
    );
    for (const projection of report.projections) {
      expect(projection.verdict).toBe('not-evaluated');
    }
  });

  it('computes verdicts from the finding levels', () => {
    // Aligned with OpenCode in every §6 signal: discovered, matching name, known
    // fields only, inert-free body.
    const report = project('/repo/.opencode/skills/alpha/SKILL.md', WELL_FORMED);
    expect(agent(report, 'opencode').verdict).toBe('compatible');
    expect(agent(report, 'spec').verdict).toBe('compatible');
    expect(agent(report, 'claude-code').verdict).toBe('notes');
    expect(agent(report, 'codex').verdict).toBe('notes');
  });

  it('is deterministic: same document, same report, stable agent and finding order', () => {
    const content = [
      '---',
      'name: alpha',
      'description: Fill PDF forms. Use when asked to fill a PDF form.',
      'zeta: 1',
      'allowed-tools: Read',
      '---',
      '',
      'Run !`git status` with $ARGUMENTS.',
    ].join('\n');
    const filePath = '/ws/skills/beta/SKILL.md';

    const first = project(filePath, content);
    const second = project(filePath, content);
    expect(second).toEqual(first);

    expect(first.projections.map((p) => p.agent)).toEqual([
      'spec',
      'claude-code',
      'codex',
      'opencode',
    ]);

    // Findings per agent follow document key order, then name, discovery, body.
    const opencode = agent(first, 'opencode');
    expect(opencode.findings.map((f) => f.kind)).toEqual([
      'field-ignored', // zeta (document order)
      'field-ignored', // allowed-tools
      'name-dir-mismatch-enforced',
      'no-discovery-path',
      'dynamic-context-inert',
      'substitution-inert',
    ]);
  });

  it('reports the capability table verification date', () => {
    const report = project('/ws/skills/alpha/SKILL.md', WELL_FORMED);
    expect(report.verifiedOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('enabledCapabilityTable (per-agent settings filter)', () => {
  it('returns the full table when no enabled list is given', () => {
    expect(enabledCapabilityTable()).toBe(AGENT_CAPABILITIES);
  });

  it('filters to the enabled agents while preserving the stable table order', () => {
    const table = enabledCapabilityTable(['codex', 'spec']);
    expect(table.agents.map((agent) => agent.agent)).toEqual(['spec', 'codex']);
    expect(table.verifiedOn).toBe(AGENT_CAPABILITIES.verifiedOn);
  });

  it('projects only the enabled agents', () => {
    const report = projectCompatibility(
      parseSkillFile('/ws/skills/alpha/SKILL.md', WELL_FORMED),
      enabledCapabilityTable(['claude-code']),
    );
    expect(report.projections.map((projection) => projection.agent)).toEqual(['claude-code']);
  });

  it('yields an empty projection list when every agent is disabled', () => {
    const report = projectCompatibility(
      parseSkillFile('/ws/skills/alpha/SKILL.md', WELL_FORMED),
      enabledCapabilityTable([]),
    );
    expect(report.projections).toEqual([]);
  });
});

describe('overallCompatibilityVerdict', () => {
  it('rolls up to the worst verdict across agents: issues beats notes', () => {
    // name alpha in directory beta/ → spec and OpenCode issues, tool notes.
    const report = project('/ws/skills/beta/SKILL.md', WELL_FORMED);
    expect(overallCompatibilityVerdict(report)).toBe('issues');
  });

  it('reports notes when no agent has issues but at least one has findings', () => {
    const report = project('/repo/.opencode/skills/alpha/SKILL.md', WELL_FORMED);
    expect(overallCompatibilityVerdict(report)).toBe('notes');
  });

  it('reports not-evaluated when frontmatter could not be parsed', () => {
    const report = project('/ws/skills/alpha/SKILL.md', '# Body only.');
    expect(overallCompatibilityVerdict(report)).toBe('not-evaluated');
  });

  it('reports compatible only when every agent is compatible', () => {
    const report = {
      verifiedOn: '2026-07-26',
      projections: (['spec', 'claude-code', 'codex', 'opencode'] as const).map((agent) => ({
        agent,
        label: agent,
        verdict: 'compatible' as const,
        findings: [],
      })),
    };
    expect(overallCompatibilityVerdict(report)).toBe('compatible');
  });
});
