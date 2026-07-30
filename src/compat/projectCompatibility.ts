import * as l10n from '@vscode/l10n';
import type { SkillDocument, SkillFrontmatter } from '../types/SkillDocument';
import type {
  AgentCapabilities,
  AgentCapabilityTable,
  AgentProjection,
  CompatibilityFinding,
  CompatibilityReport,
  CompatibilityVerdict,
} from '../types/AgentCompatibility';
import { nameFolderMismatch } from '../validation/validateName';
import { AGENT_CAPABILITIES } from './agentCapabilities';

/**
 * Projects one already-parsed skill against the verified capability table and
 * reports, per agent, a verdict and findings (plan §6). Pure, deterministic,
 * and synchronous: it reads only the parsed frontmatter, the body text, and
 * the skill path — no I/O, no re-validation, no diagnostics.
 *
 * Finding order per agent is stable: frontmatter findings in document key
 * order, then name, discovery, body.
 */
export function projectCompatibility(
  doc: SkillDocument,
  capabilities: AgentCapabilityTable = AGENT_CAPABILITIES,
): CompatibilityReport {
  const projections = capabilities.agents.map((agent) => projectAgent(doc, agent));
  return { projections, verifiedOn: capabilities.verifiedOn };
}

function projectAgent(doc: SkillDocument, agent: AgentCapabilities): AgentProjection {
  if (doc.frontmatter === null) {
    return {
      agent: agent.agent,
      label: agent.label,
      verdict: 'not-evaluated',
      findings: [],
      notEvaluatedReason: l10n.t('frontmatter could not be parsed'),
    };
  }

  const findings: CompatibilityFinding[] = [
    ...fieldFindings(doc.frontmatter, agent),
    ...nameFindings(doc, agent),
    ...discoveryFindings(doc, agent),
    ...bodyFindings(doc, agent),
  ];

  return { agent: agent.agent, label: agent.label, verdict: verdictOf(findings), findings };
}

function verdictOf(findings: CompatibilityFinding[]): CompatibilityVerdict {
  if (findings.some((finding) => finding.level === 'issue')) {
    return 'issues';
  }
  return findings.length > 0 ? 'notes' : 'compatible';
}

/**
 * The worst verdict across a report's agents, for one-glance summaries:
 * issues > notes > not-evaluated > compatible. `compatible` requires every
 * agent to be evaluated and clean, so a summary can never overclaim.
 */
export function overallCompatibilityVerdict(report: CompatibilityReport): CompatibilityVerdict {
  const verdicts = report.projections.map((projection) => projection.verdict);
  if (verdicts.includes('issues')) {
    return 'issues';
  }
  if (verdicts.includes('notes')) {
    return 'notes';
  }
  if (verdicts.length === 0 || verdicts.includes('not-evaluated')) {
    return 'not-evaluated';
  }
  return 'compatible';
}

/** Classifies each present top-level key (plan §6.1). Never inspects inside values. */
function fieldFindings(
  frontmatter: SkillFrontmatter,
  agent: AgentCapabilities,
): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];
  for (const key of Object.keys(frontmatter)) {
    // Own-property lookup only: YAML keys are author-controlled and could
    // otherwise collide with Object.prototype names.
    if (Object.prototype.hasOwnProperty.call(agent.fieldNotes, key)) {
      const note = agent.fieldNotes[key].value;
      findings.push({
        agent: agent.agent,
        level: 'note',
        kind: note.kind,
        message: note.message,
        subject: key,
      });
      continue;
    }
    if (agent.fields.value.includes(key)) {
      continue; // honored silently
    }
    findings.push(unknownFieldFinding(key, agent));
  }
  return findings;
}

function unknownFieldFinding(key: string, agent: AgentCapabilities): CompatibilityFinding {
  switch (agent.unknownFields.value) {
    case 'rejected':
      return {
        agent: agent.agent,
        level: 'issue',
        kind: 'field-rejected',
        message: l10n.t('`{0}` is an unexpected field — the reference validator errors on it.', key),
        subject: key,
      };
    case 'unvalidated':
      return {
        agent: agent.agent,
        level: 'note',
        kind: 'field-unvalidated',
        message: l10n.t(
          "`{0}` is outside {1}'s validated field set; the loader tolerates it, but the bundled skill validator flags it.",
          key,
          agent.label,
        ),
        subject: key,
      };
    case 'ignored':
      return {
        agent: agent.agent,
        level: 'note',
        kind: 'field-ignored',
        message: l10n.t(
          '`{0}` is ignored — {1} ignores unknown frontmatter fields by design.',
          key,
          agent.label,
        ),
        subject: key,
      };
    case 'tolerated':
      return {
        agent: agent.agent,
        level: 'note',
        kind: 'field-ignored',
        message: l10n.t(
          '`{0}` is not a documented {1} field; unknown fields are tolerated.',
          key,
          agent.label,
        ),
        subject: key,
      };
  }
}

/**
 * Name/directory relationship (plan §6.2). Reuses the validator's comparison
 * and gating via `nameFolderMismatch` rather than re-implementing it.
 */
function nameFindings(doc: SkillDocument, agent: AgentCapabilities): CompatibilityFinding[] {
  const name = doc.frontmatter?.name;
  if (typeof name !== 'string' || name.trim() === '') {
    return [];
  }
  const folder = nameFolderMismatch(doc.directory, name);
  if (folder === null) {
    return [];
  }
  // Whole-sentence keys per branch (not a shared "base" fragment) so each
  // message translates as one unit; {0} name, {1} folder, {2} agent label.
  switch (agent.nameDirectoryRule.value) {
    case 'must-match':
      return [
        {
          agent: agent.agent,
          level: 'issue',
          kind: 'name-dir-mismatch-enforced',
          message:
            agent.agent === 'spec'
              ? l10n.t(
                  '`name` "{0}" does not match the parent directory "{1}" — the reference validator requires them to match.',
                  name,
                  folder,
                )
              : l10n.t(
                  '`name` "{0}" does not match the parent directory "{1}" — {2} requires the name to match the containing directory.',
                  name,
                  folder,
                  agent.label,
                ),
          subject: 'name',
        },
      ];
    case 'display-only':
      return [
        {
          agent: agent.agent,
          level: 'note',
          kind: 'name-dir-mismatch',
          message: l10n.t(
            '`name` "{0}" does not match the parent directory "{1}"; {2} treats the name as display-only for non-plugin skills.',
            name,
            folder,
            agent.label,
          ),
          subject: 'name',
        },
      ];
    case 'directory-default':
      // Reported-confidence fact — the message must hedge, not assert.
      return [
        {
          agent: agent.agent,
          level: 'note',
          kind: 'name-dir-mismatch',
          message: l10n.t(
            '`name` "{0}" does not match the parent directory "{1}"; {2} is reported to default the skill name to the directory name.',
            name,
            folder,
            agent.label,
          ),
          subject: 'name',
        },
      ];
  }
}

/**
 * Discovery-path matrix (plan §5.5): pure string matching on the skill path's
 * segments. "No" means no verified documentation says the agent scans the
 * location — the user may install the skill elsewhere, so this is a note.
 */
function discoveryFindings(doc: SkillDocument, agent: AgentCapabilities): CompatibilityFinding[] {
  if (agent.discoverySegments === null) {
    return [];
  }
  const normalized = `/${doc.directory.split(/[\\/]+/).filter(Boolean).join('/')}/`;
  const discovered = agent.discoverySegments.value.some((segment) =>
    normalized.includes(`/${segment}`),
  );
  if (discovered) {
    return [];
  }
  return [
    {
      agent: agent.agent,
      level: 'note',
      kind: 'no-discovery-path',
      message: l10n.t('No documented {0} discovery path contains this skill.', agent.label),
    },
  ];
}

/** Body features (plan §6.4): dynamic context and argument substitution. */
function bodyFindings(doc: SkillDocument, agent: AgentCapabilities): CompatibilityFinding[] {
  const findings: CompatibilityFinding[] = [];

  if (agent.dynamicContext !== null && hasDynamicContext(doc.body)) {
    findings.push(
      agent.dynamicContext.value === 'executes'
        ? {
            agent: agent.agent,
            level: 'note',
            kind: 'dynamic-context-executes',
            message: l10n.t(
              'Dynamic context (!`command` lines and ```! fenced blocks) executes at load time, before the model reads the skill content; review the commands.',
            ),
            subject: 'dynamic-context',
          }
        : {
            agent: agent.agent,
            level: 'note',
            kind: 'dynamic-context-inert',
            message: l10n.t(
              'Dynamic context syntax (!`command`) is inert text — {0} does not execute it.',
              agent.label,
            ),
            subject: 'dynamic-context',
          },
    );
  }

  if (
    agent.argumentSubstitution !== null &&
    hasSubstitutionTokens(doc.body, declaredArgumentNames(doc.frontmatter))
  ) {
    findings.push(
      agent.argumentSubstitution.value === 'applies'
        ? {
            agent: agent.agent,
            level: 'note',
            kind: 'substitution-applies',
            message: l10n.t(
              'Argument tokens ($ARGUMENTS, $N, and declared $name arguments) are substituted once at invocation, including inside fenced code.',
            ),
            subject: 'arguments',
          }
        : {
            agent: agent.agent,
            level: 'note',
            kind: 'substitution-inert',
            message: l10n.t(
              'Argument tokens such as $ARGUMENTS stay literal text — {0} performs no argument substitution.',
              agent.label,
            ),
            subject: 'arguments',
          },
    );
  }

  return findings;
}

/**
 * Detects !`command` lines and ```! fenced blocks. The inline form counts only
 * at line start or after whitespace — a mid-token occurrence (e.g. KEY=!`cmd`)
 * is the verified non-trigger case. Fenced regions are NOT excluded: the scan
 * runs over the original file content, matching the documented load-time
 * behavior.
 */
function hasDynamicContext(body: string): boolean {
  return body
    .split('\n')
    .some((line) => /(?:^|\s)!`[^`]*`/.test(line) || line.trimStart().startsWith('```!'));
}

/** Names declared under `arguments:` that can appear as `$name` in the body. */
function declaredArgumentNames(frontmatter: SkillFrontmatter | null): string[] {
  const args = frontmatter?.['arguments'];
  if (Array.isArray(args)) {
    return args.flatMap((item) => {
      if (typeof item === 'string') {
        return [item];
      }
      if (item !== null && typeof item === 'object') {
        const name = (item as { name?: unknown }).name;
        return typeof name === 'string' ? [name] : [];
      }
      return [];
    });
  }
  if (args !== null && args !== undefined && typeof args === 'object') {
    return Object.keys(args);
  }
  return [];
}

/**
 * Detects `$ARGUMENTS`, `$ARGUMENTS[N]`, `$N`, and declared `$name` tokens.
 * A token escaped as `\$` does not count — the escape is only defined before a
 * digit, ARGUMENTS, or a declared name, which is exactly the set matched here.
 */
function hasSubstitutionTokens(body: string, declaredNames: string[]): boolean {
  const namePatterns = declaredNames
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_-]*$/.test(name))
    .map((name) => name.replace(/[.*+?^${}()|[\]\\-]/g, '\\$&'));
  const alternatives = ['ARGUMENTS(?:\\[\\d+\\])?', '\\d+', ...namePatterns];
  const pattern = new RegExp(`(\\\\?)\\$(?:${alternatives.join('|')})`, 'g');
  for (const match of body.matchAll(pattern)) {
    if (match[1] === '') {
      return true;
    }
  }
  return false;
}
