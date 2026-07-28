import type {
  AgentCapabilities,
  AgentCapabilityTable,
  AgentId,
  CapabilityFact,
} from '../types/AgentCompatibility';

/**
 * The verified per-agent capability table behind the compatibility projection.
 *
 * Data, not logic: every fact carries the source it was verified against and
 * the date it was verified on (see `CapabilityFact`), and the structural test
 * in `test/agentCapabilities.test.ts` enforces that. When refreshing a fact,
 * update its `verifiedOn` and re-run that test. Facts marked
 * `confidence: 'reported'` came from a research summary rather than a verbatim
 * quote; report messages must not word them as certainties.
 *
 * Adding an agent (e.g. Copilot/VS Code) is a pure data change: append an
 * entry here and the projection, reports, and index pick it up.
 */

const VERIFIED_ON = '2026-07-26';

const SPEC_SOURCE = 'https://agentskills.io/specification';
const SPEC_VALIDATOR_SOURCE =
  'https://github.com/agentskills/agentskills/blob/main/skills-ref/src/skills_ref/validator.py';
const CLAUDE_CODE_SOURCE = 'https://code.claude.com/docs/en/skills';
const CODEX_LOADER_SOURCE =
  'https://github.com/openai/codex/blob/main/codex-rs/core-skills/src/loader.rs';
const CODEX_VALIDATOR_SOURCE =
  'https://github.com/openai/codex/blob/main/codex-rs/skills/src/assets/samples/skill-creator/scripts/quick_validate.py';
const OPENCODE_SOURCE = 'https://opencode.ai/docs/skills';

function verified<T>(value: T, sourceUrl: string): CapabilityFact<T> {
  return { value, sourceUrl, verifiedOn: VERIFIED_ON };
}

function reported<T>(value: T, sourceUrl: string): CapabilityFact<T> {
  return { value, sourceUrl, verifiedOn: VERIFIED_ON, confidence: 'reported' };
}

/** The spec's complete allowed frontmatter field set — exactly these six. */
const SPEC_FIELDS = [
  'name',
  'description',
  'license',
  'compatibility',
  'metadata',
  'allowed-tools',
] as const;

const spec: AgentCapabilities = {
  agent: 'spec',
  label: 'Regular SKILL.md',
  fields: verified(SPEC_FIELDS, SPEC_SOURCE),
  // The reference validator reports anything else as "Unexpected fields" (an error).
  unknownFields: verified('rejected', SPEC_VALIDATOR_SOURCE),
  fieldNotes: {},
  // `name` must match the parent directory name (Unicode-normalized comparison).
  nameDirectoryRule: verified('must-match', SPEC_SOURCE),
  // The spec does not define discovery locations.
  discoverySegments: null,
  argumentSubstitution: null,
  dynamicContext: null,
};

const claudeCode: AgentCapabilities = {
  agent: 'claude-code',
  label: 'Claude Code',
  fields: verified(
    [
      ...SPEC_FIELDS,
      'when_to_use',
      'argument-hint',
      'arguments',
      'disable-model-invocation',
      'user-invocable',
      'disallowed-tools',
      'model',
      'effort',
      'context',
      'agent',
      'background',
      'hooks',
      'paths',
      'shell',
    ],
    CLAUDE_CODE_SOURCE,
  ),
  unknownFields: verified('tolerated', CLAUDE_CODE_SOURCE),
  fieldNotes: {
    // Honored with a consequence: the listed tools run without a permission
    // prompt during the invoking turn, so presence always deserves a note.
    'allowed-tools': verified(
      {
        kind: 'tool-grant',
        message:
          '`allowed-tools` grants the listed tools without a permission prompt during the invoking turn; review the grant.',
      },
      CLAUDE_CODE_SOURCE,
    ),
  },
  // `name` is optional, defaults to the directory name, and is display-only
  // for non-plugin skills.
  nameDirectoryRule: verified('display-only', CLAUDE_CODE_SOURCE),
  discoverySegments: verified(['.claude/skills/'], CLAUDE_CODE_SOURCE),
  argumentSubstitution: verified('applies', CLAUDE_CODE_SOURCE),
  dynamicContext: verified('executes', CLAUDE_CODE_SOURCE),
};

const codex: AgentCapabilities = {
  agent: 'codex',
  label: 'Codex',
  // The bundled skill-creator validator's allowed set — no `compatibility`.
  fields: verified(
    ['name', 'description', 'license', 'allowed-tools', 'metadata'],
    CODEX_VALIDATOR_SOURCE,
  ),
  // The loader tolerates other fields; only Codex's bundled validator flags them.
  unknownFields: verified('unvalidated', CODEX_VALIDATOR_SOURCE),
  fieldNotes: {},
  // `name` defaulting to the directory name is reported-confidence only.
  nameDirectoryRule: reported('directory-default', CODEX_LOADER_SOURCE),
  discoverySegments: verified(['.agents/skills/'], CODEX_LOADER_SOURCE),
  argumentSubstitution: verified('inert', CODEX_LOADER_SOURCE),
  dynamicContext: verified('inert', CODEX_LOADER_SOURCE),
};

const opencode: AgentCapabilities = {
  agent: 'opencode',
  label: 'OpenCode',
  fields: verified(
    ['name', 'description', 'license', 'compatibility', 'metadata'],
    OPENCODE_SOURCE,
  ),
  // Unknown frontmatter fields are ignored by design.
  unknownFields: verified('ignored', OPENCODE_SOURCE),
  fieldNotes: {
    // Not read at all: permissions live host-side in opencode.json.
    'allowed-tools': verified(
      {
        kind: 'field-ignored',
        message:
          '`allowed-tools` is ignored; OpenCode permissions are configured in opencode.json.',
      },
      OPENCODE_SOURCE,
    ),
  },
  // Name rules verbatim-match the spec, including the containing-directory match.
  nameDirectoryRule: verified('must-match', OPENCODE_SOURCE),
  discoverySegments: verified(
    ['.opencode/skills/', '.claude/skills/', '.agents/skills/'],
    OPENCODE_SOURCE,
  ),
  argumentSubstitution: verified('inert', OPENCODE_SOURCE),
  dynamicContext: verified('inert', OPENCODE_SOURCE),
};

export const AGENT_CAPABILITIES: AgentCapabilityTable = {
  verifiedOn: VERIFIED_ON,
  agents: [spec, claudeCode, codex, opencode],
};

/**
 * The capability table restricted to the agents the user enabled in settings
 * (`skillMdInspector.validation.compatibilityAgents.*`); the full table when
 * no list is given. Filters the table rather than trusting the list's order,
 * so the stable spec → claude-code → codex → opencode projection order is
 * preserved regardless of how the enabled ids are listed.
 */
export function enabledCapabilityTable(enabled?: readonly AgentId[]): AgentCapabilityTable {
  if (enabled === undefined) {
    return AGENT_CAPABILITIES;
  }
  return {
    verifiedOn: AGENT_CAPABILITIES.verifiedOn,
    agents: AGENT_CAPABILITIES.agents.filter((agent) => enabled.includes(agent.agent)),
  };
}
