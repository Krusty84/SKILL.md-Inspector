/**
 * Per-agent compatibility projection types (plan: agent-compatibility-projection).
 *
 * The projection is a read-only layer over the already-validated document: it
 * evaluates the parsed skill against a table of verified per-agent behavior and
 * reports a verdict plus findings per agent. It emits no diagnostics and never
 * changes validation itself.
 */

export type AgentId = 'spec' | 'claude-code' | 'codex' | 'opencode';

export type CompatibilityVerdict =
  | 'compatible'
  | 'notes' // works, but behavior differs in ways the author should know
  | 'issues' // documented behavior says something is rejected/broken here
  | 'not-evaluated'; // input insufficient (e.g. frontmatter unparseable)

export interface CompatibilityFinding {
  agent: AgentId;
  level: 'issue' | 'note';
  /** Stable machine id, e.g. 'field-rejected', 'field-ignored',
   *  'no-discovery-path', 'dynamic-context-executes', 'substitution-applies',
   *  'name-dir-mismatch-enforced'. */
  kind: string;
  message: string;
  /** Frontmatter key or body feature the finding is about, when applicable. */
  subject?: string;
}

export interface AgentProjection {
  agent: AgentId;
  label: string; // 'Spec (skills-ref)', 'Claude Code', …
  verdict: CompatibilityVerdict;
  findings: CompatibilityFinding[];
  notEvaluatedReason?: string;
}

export interface CompatibilityReport {
  /** Stable order: spec, claude-code, codex, opencode. */
  projections: AgentProjection[];
  /** The capability table's verification date, e.g. '2026-07-26'. */
  verifiedOn: string;
}

/**
 * A single verified behavior fact. Every entry of the capability table carries
 * provenance so the data can never silently drift from its sources — the old
 * vendor profiles deleted in PR #57 failed exactly because they were guesses.
 */
export interface CapabilityFact<T> {
  value: T;
  sourceUrl: string;
  verifiedOn: string; // ISO date
  confidence?: 'verified' | 'reported'; // default 'verified'
}

/** How an agent treats frontmatter keys outside its documented field set. */
export type UnknownFieldTreatment =
  | 'rejected' // the validator errors on the field (spec baseline)
  | 'tolerated' // documented as tolerated, no defined semantics
  | 'ignored' // documented as ignored by design
  | 'unvalidated'; // the loader tolerates it, but the agent's own validator flags it

/** How an agent relates the `name` field to the skill's directory name. */
export type NameDirectoryRule =
  | 'must-match' // a mismatch violates the agent's documented rules
  | 'display-only' // the name is presentation-only; a mismatch is informational
  | 'directory-default'; // the directory name is (reportedly) the effective name

/** A finding template for a specific key that is present in the frontmatter. */
export interface AgentFieldNote {
  kind: string;
  message: string;
}

export interface AgentCapabilities {
  agent: AgentId;
  label: string;
  /** Frontmatter keys with documented handling; anything else falls to `unknownFields`. */
  fields: CapabilityFact<readonly string[]>;
  /** Treatment of keys outside `fields`. */
  unknownFields: CapabilityFact<UnknownFieldTreatment>;
  /** Keys that deserve a finding whenever present, even if listed in `fields`. */
  fieldNotes: Readonly<Record<string, CapabilityFact<AgentFieldNote>>>;
  nameDirectoryRule: CapabilityFact<NameDirectoryRule>;
  /** Path segments the agent documents scanning; null when the agent defines no discovery (spec). */
  discoverySegments: CapabilityFact<readonly string[]> | null;
  /** Whether `$ARGUMENTS`/`$N`/declared-name tokens are substituted; null = not applicable (spec). */
  argumentSubstitution: CapabilityFact<'applies' | 'inert'> | null;
  /** Whether !`command` lines and ```! blocks execute; null = not applicable (spec). */
  dynamicContext: CapabilityFact<'executes' | 'inert'> | null;
}

export interface AgentCapabilityTable {
  /** The table-level verification date shown in reports. */
  verifiedOn: string;
  /** Agents in stable projection order: spec, claude-code, codex, opencode. */
  agents: readonly AgentCapabilities[];
}
