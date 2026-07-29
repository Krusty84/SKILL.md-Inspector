import type { SkillReport } from './reportModel';
import type {
  StaticDescriptionQualityFinding,
  StaticDescriptionQualityLabel,
} from '../types/StaticDescriptionQuality';
import { renderToc, slugify, TOC_STYLES, type TocEntry } from './reportToc';
import {
  AGENT_COMPATIBILITY_DEFINITION,
  AUTHORING_HYGIENE_DEFINITION,
  AUTHORING_HYGIENE_INSTRUCTIONS_HEADING,
  AUTHORING_HYGIENE_RESOURCES_HEADING,
  COMPATIBILITY_ALL_AGENTS_DISABLED,
  DESCRIPTION_COMPLETENESS_DEFINITION,
  SECURITY_DEFINITION,
  authoringLabelText,
  compatibilityFooterText,
  compatibilityVerdictText,
} from './metricDefinitions';
import { totalSkillTokens } from '../analysis/tokenUsage';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
  /** Local date & time string for when the report was generated. */
  generatedAt?: string;
}

// The section ids are load-bearing (existing anchors and links); only the
// visible labels were renamed to match what the checks actually measure.
const SKILL_REPORT_SECTIONS: readonly TocEntry[] = [
  { id: 'validation-findings', label: 'Validation findings' },
  { id: 'security-findings', label: 'Security' },
  { id: 'agent-compatibility', label: 'Agent compatibility' },
  { id: 'trigger-quality-breakdown', label: 'Trigger quality breakdown' },
  { id: 'instruction-authoring-quality', label: AUTHORING_HYGIENE_INSTRUCTIONS_HEADING },
  { id: 'resource-authoring-quality', label: AUTHORING_HYGIENE_RESOURCES_HEADING },
  { id: 'referenced-files', label: 'Referenced files' },
  { id: 'unreferenced-files', label: 'Unreferenced files' },
  {
    id: 'token-usage',
    label: 'Token usage',
    children: [
      { id: 'reference-files', label: 'Reference files' },
      { id: 'non-standard-files', label: 'Other text files' },
    ],
  },
];

/** Renders the skill report as a self-contained, theme-aware HTML document. */
export function renderReportHtml(report: SkillReport, opts: RenderOptions): string {
  const statusClass =
    report.status === 'pass' ? 'ok' : report.status === 'warning' ? 'warning' : 'fail';
  const statusLabel =
    report.status === 'pass'
      ? 'VALID'
      : report.status === 'warning'
        ? 'VALID WITH WARNINGS'
        : 'INVALID';
  const q = report.staticDescriptionQuality;
  const instructions = report.authoringQuality.instructions;
  const descriptionBadge =
    q.state === 'scored'
      ? `<span class="badge ${scoreBadgeClass(q.label)}" title="${DESCRIPTION_COMPLETENESS_DEFINITION}">Description completeness ${q.adjustedScore}/100 · ${escapeHtml(capitalize(q.label))}</span>`
      : `<span class="badge q-not-scored">Description completeness: Not scored — ${escapeHtml(q.notScoredReason)}</span>`;
  const descriptionCard =
    q.state === 'scored'
      ? `<span class="score">${q.adjustedScore}<span class="max"> / 100</span></span>`
      : `Not scored — ${escapeHtml(q.notScoredReason)}`;
  const instructionCard =
    instructions.state === 'scored'
      ? `${instructions.score}/100 · ${authoringLabelText(instructions.label)}`
      : `Not scored — ${escapeHtml(instructions.notScoredReason)}`;
  const instructionCardLabel =
    instructions.state === 'scored' ? 'Authoring hygiene' : 'Instruction structure';
  const tokens = report.tokenUsage;
  const tokenCardValue = `${formatNumber(totalSkillTokens(tokens))}<div class="token-breakdown">Body ${formatNumber(tokens.body.tokens)} · Ref ${formatNumber(tokens.references.totalTokens)} · Other ${formatNumber(tokens.otherFiles.totalTokens)}</div>`;
  const securityFindings = report.diagnostics.filter((d) => d.kind === 'security');
  const securityCardClass =
    securityFindings.some((d) => d.severity === 'error')
      ? 'error'
      : securityFindings.length > 0
        ? 'warn'
        : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1.25rem 2rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; margin-top: 2rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.35rem; }
  h3 { font-size: 0.95rem; margin-top: 1.25rem; }
  .badge { font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; }
  .badge.ok, .badge.q-good { background: var(--vscode-testing-iconPassed, #3fb950); color: #06210c; }
  .badge.warning { background: var(--vscode-editorWarning-foreground, #cca700); color: #241f00; }
  .badge.fail, .badge.q-low { background: var(--vscode-errorForeground, #f14c4c); color: #2b0606; }
  .badge.q-mid { background: var(--vscode-editorWarning-foreground, #cca700); color: #241f00; }
  .badge.q-not-scored { background: var(--vscode-badge-background); color: var(--vscode-badge-foreground); }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 0.7rem 0.85rem; }
  .card .label { font-size: 0.72rem; text-transform: uppercase; opacity: 0.65; }
  .card .value { font-size: 1.35rem; font-weight: 600; margin-top: 0.15rem; }
  .value.error { color: var(--vscode-errorForeground, #f14c4c); }
  .value.warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .score { font-size: 2.4rem; font-weight: 700; }
  .score .max { font-size: 1rem; font-weight: 400; opacity: 0.6; }
  .token-breakdown { font-size: 0.72rem; font-weight: 400; opacity: 0.7; margin-top: 0.2rem; line-height: 1.4; }
  ul { list-style: none; padding-left: 0; }
  li { padding: 0.3rem 0; display: flex; gap: 0.5rem; align-items: baseline; }
  .mark { font-weight: 700; width: 1rem; flex: none; }
  .mark.yes { color: var(--vscode-testing-iconPassed, #3fb950); }
  .mark.partial, .mark.no { color: var(--vscode-editorWarning-foreground, #cca700); }
  .pts { opacity: 0.6; font-size: 0.85em; margin-left: auto; padding-left: 0.75rem; white-space: nowrap; }
  .msg { opacity: 0.85; font-size: 0.9em; }
  code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background); padding: 0.05rem 0.3rem; border-radius: 3px; }
  .empty { opacity: 0.6; font-style: italic; }
  .note { opacity: 0.7; font-size: 0.85rem; margin: 0.35rem 0 0; }
  .adjustments { margin-top: 1rem; padding: 0.7rem 0.85rem; border-left: 3px solid var(--vscode-editorWarning-foreground, #cca700); background: var(--vscode-textBlockQuote-background); font-size: 0.9rem; }
  .adjustments p { margin: 0.25rem 0; }
  .adjustments ul { list-style: disc; padding-left: 1.2rem; margin-bottom: 0; }
  .limitations { margin-top: 1rem; font-size: 0.9rem; }
  .limitations ul { list-style: disc; padding-left: 1.2rem; }
  .conf-high { color: var(--vscode-testing-iconPassed, #3fb950); }
  .conf-medium { color: var(--vscode-editorWarning-foreground, #cca700); }
  .conf-low { color: var(--vscode-errorForeground, #f14c4c); }
  .semaphore { display: inline-block; width: 0.75em; height: 0.75em; border-radius: 50%; }
  .semaphore.green { background: var(--vscode-testing-iconPassed, #3fb950); }
  .semaphore.yellow { background: var(--vscode-editorWarning-foreground, #cca700); }
  .semaphore.red { background: var(--vscode-errorForeground, #f14c4c); }
  .compat-bar { display: flex; flex-wrap: wrap; align-items: center; gap: 0.5rem 1.5rem; margin-top: 0.75rem; }
  .compat-agent { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border-bottom: 1px solid var(--vscode-panel-border); padding: 0.45rem 0.6rem; text-align: left; vertical-align: top; }
  th { font-size: 0.72rem; text-transform: uppercase; opacity: 0.65; }${TOC_STYLES}
</style>
<title>Skill Report</title>
</head>
<body>
  <div class="report-layout">
  ${renderToc(SKILL_REPORT_SECTIONS)}
  <main class="report-content">
  <h1><code>${escapeHtml(report.name)}</code> <span class="badge ${statusClass}">Validation status: ${statusLabel}</span> ${descriptionBadge}</h1>
  ${opts.generatedAt ? `<p class="note">Generated: ${escapeHtml(opts.generatedAt)}</p>` : ''}
  <p class="note">Description completeness: ${DESCRIPTION_COMPLETENESS_DEFINITION} It is deterministic and does not guarantee that an agent will select this skill at runtime.</p>
  <div class="grid">
    ${card('Description completeness', descriptionCard, '', DESCRIPTION_COMPLETENESS_DEFINITION)}
    ${card(instructionCardLabel, instructionCard, '', AUTHORING_HYGIENE_DEFINITION)}
    ${card('Coverage', `<span class="conf-${q.coverage}">${capitalize(q.coverage)}</span>`)}
    ${card('Description', `${report.descriptionLength} chars`)}
    ${card('Lines', formatNumber(report.tokenUsage.body.lines), '', 'Line count of the SKILL.md Markdown body.')}
    ${card('Token usage', tokenCardValue)}
    ${card('Errors', String(report.errorCount), report.errorCount > 0 ? 'error' : '')}
    ${card('Warnings', String(report.warningCount), report.warningCount > 0 ? 'warn' : '')}
    ${card('Information', String(report.informationCount))}
    ${card('Security', String(securityFindings.length), securityCardClass, SECURITY_DEFINITION)}
  </div>
  ${renderCompatibilityBar(report.compatibility)}
  ${renderGradeLimitations(q)}
  ${
    q.limitations.length > 0
      ? `<div class="limitations"><strong>Heuristic coverage limitations</strong><ul>${q.limitations
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join('')}</ul></div>`
      : ''
  }

  <h2 id="validation-findings">Validation findings</h2>
  ${renderDiagnostics(report.diagnostics)}

  <h2 id="security-findings">Security</h2>
  ${renderSecurity(securityFindings)}

  <h2 id="agent-compatibility">Agent compatibility</h2>
  ${renderCompatibility(report.compatibility)}

  <h2 id="trigger-quality-breakdown">Trigger quality breakdown</h2>
  ${q.state === 'scored' ? `<ul>${q.findings.map(renderFinding).join('')}</ul>` : `<p class="empty">Description completeness was not scored — ${escapeHtml(q.notScoredReason)}.</p>`}

  <h2 id="instruction-authoring-quality">${AUTHORING_HYGIENE_INSTRUCTIONS_HEADING}</h2>
  ${renderAuthoring(report.authoringQuality.instructions)}
  <h2 id="resource-authoring-quality">${AUTHORING_HYGIENE_RESOURCES_HEADING}</h2>
  ${renderAuthoring(report.authoringQuality.resources)}
  <p class="note">Authoring hygiene: ${AUTHORING_HYGIENE_DEFINITION} It is reported on its own and never combined with description completeness.</p>

  <h2 id="referenced-files">Referenced files</h2>
  ${renderFileList(report.referencedFiles, 'No referenced resource files.')}

  <h2 id="unreferenced-files">Unreferenced files</h2>
  ${renderFileList(report.unreferencedFiles, 'No unreferenced resource files.')}

  <h2 id="token-usage">Token usage (${escapeHtml(report.tokenUsage.encoding)})</h2>
  <table><tbody>
    <tr><th>Content</th><th>Tokens</th><th>Lines</th></tr>
    <tr><td><code>SKILL.md</code> body</td><td>${formatNumber(report.tokenUsage.body.tokens)}</td><td>${formatNumber(report.tokenUsage.body.lines)}</td></tr>
  </tbody></table>
  ${renderTokenGroup('Reference files', report.tokenUsage.references)}
  ${renderTokenGroup('Other text files', report.tokenUsage.otherFiles)}
  </main>
  </div>
</body>
</html>`;
}

function renderGradeLimitations(quality: SkillReport['staticDescriptionQuality']): string {
  if (quality.state === 'not-scored' || quality.gradeLimitations.length === 0) {
    return '';
  }
  const scoreSummary =
    quality.rawScore !== quality.adjustedScore
      ? `<p>Raw criterion score: <strong>${quality.rawScore}/100</strong>. Adjusted score after ceilings: <strong>${quality.adjustedScore}/100</strong>.</p>`
      : '';
  const limitations = quality.gradeLimitations
    .map(
      (limitation) =>
        `<li><code>${escapeHtml(limitation.code)}</code> — ceiling: ${limitation.ceiling}/100. ${escapeHtml(limitation.reason)}</li>`,
    )
    .join('');
  return `<div class="adjustments"><strong>Grade limitations and score adjustments</strong>${scoreSummary}<ul>${limitations}</ul></div>`;
}

/** `title` is a static definition string, never user content, so it is not escaped. */
function card(label: string, value: string, valueClass = '', title = ''): string {
  const tooltip = title === '' ? '' : ` title="${title}"`;
  return `<div class="card"${tooltip}><div class="label">${label}</div><div class="value ${valueClass}">${value}</div></div>`;
}

function renderFinding(finding: StaticDescriptionQualityFinding): string {
  const state =
    finding.pointsEarned === finding.pointsPossible
      ? { cls: 'yes', glyph: '✓' }
      : finding.pointsEarned === 0
        ? { cls: 'no', glyph: '✗' }
        : { cls: 'partial', glyph: '◐' };
  return `<li><span class="mark ${state.cls}">${state.glyph}</span><span><strong>${escapeHtml(finding.criterion)}</strong> <span class="msg">— ${escapeHtml(finding.message)}</span></span><span class="pts">${finding.pointsEarned}/${finding.pointsPossible}</span></li>`;
}

/**
 * Full-width per-agent semaphore bar under the summary cards: one lamp per
 * agent, colored by that agent's own verdict (green = compatible, yellow =
 * notes, red = issues) with the verdict words on hover. A not-evaluated
 * projection renders the words instead of a lamp, mirroring the not-scored
 * quality cards. The spec baseline is shown under the friendlier name
 * "Regular SKILL.md" here; the detailed section keeps its formal label.
 */
function renderCompatibilityBar(compatibility: SkillReport['compatibility']): string {
  if (compatibility.projections.length === 0) {
    // Every agent unchecked in settings: the detailed section says so in
    // words; a bar with no lamps would just be an empty box.
    return '';
  }
  const agents = compatibility.projections
    .map((projection) => {
      const name = projection.agent === 'spec' ? 'Regular SKILL.md' : projection.label;
      const lamp =
        projection.verdict === 'not-evaluated'
          ? '<span class="empty">not evaluated</span>'
          : `<span class="semaphore ${
              projection.verdict === 'issues'
                ? 'red'
                : projection.verdict === 'notes'
                  ? 'yellow'
                  : 'green'
            }" title="${compatibilityVerdictText(projection.verdict)}"></span>`;
      return `<span class="compat-agent">${escapeHtml(name)}${lamp}</span>`;
    })
    .join('');
  return `<div class="card compat-bar" title="${AGENT_COMPATIBILITY_DEFINITION}"><div class="label">Agent compatibility</div>${agents}</div>`;
}

/** One row per agent: verdict plus the findings behind it (plan §7). */
function renderCompatibility(compatibility: SkillReport['compatibility']): string {
  if (compatibility.projections.length === 0) {
    return `<p class="empty">${COMPATIBILITY_ALL_AGENTS_DISABLED}</p>`;
  }
  const rows = compatibility.projections
    .map((projection) => {
      const findings =
        projection.verdict === 'not-evaluated'
          ? `<span class="empty">${escapeHtml(projection.notEvaluatedReason ?? 'not evaluated')}</span>`
          : projection.findings.length === 0
            ? '<span class="empty">None</span>'
            : `<ul>${projection.findings
                .map((finding) => `<li>${escapeHtml(finding.message)}</li>`)
                .join('')}</ul>`;
      return `<tr><td>${escapeHtml(projection.label)}</td><td>${compatibilityVerdictText(projection.verdict)}</td><td>${findings}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>Agent</th><th>Verdict</th><th>Findings</th></tr></thead><tbody>${rows}</tbody></table><p class="note">${escapeHtml(compatibilityFooterText(compatibility.verifiedOn))}</p>`;
}

function renderDiagnostics(diagnostics: SkillReport['diagnostics']): string {
  if (diagnostics.length === 0) {
    return '<p class="empty">No validation findings.</p>';
  }
  return `<table><thead><tr><th>Severity</th><th>Diagnostic code</th><th>Message</th></tr></thead><tbody>${diagnostics
    .map(
      (diagnostic) =>
        `<tr><td>${escapeHtml(capitalize(diagnostic.severity))}</td><td><code>${escapeHtml(diagnostic.code)}</code></td><td>${escapeHtml(diagnostic.message)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

/**
 * The dedicated Security section: the security-kind findings on their own, so a
 * risky command or leaked credential is not buried in the full findings table.
 * The same findings still appear (by kind) under Validation findings.
 */
function renderSecurity(findings: SkillReport['diagnostics']): string {
  if (findings.length === 0) {
    return '<p class="empty">No security issues found.</p>';
  }
  const rows = findings
    .map(
      (finding) =>
        `<tr><td>${escapeHtml(capitalize(finding.severity))}</td><td><code>${escapeHtml(finding.code)}</code></td><td>${escapeHtml(finding.message)}</td></tr>`,
    )
    .join('');
  return `<p class="note">${SECURITY_DEFINITION}</p><table><thead><tr><th>Severity</th><th>Diagnostic code</th><th>Message</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAuthoring(
  result:
    SkillReport['authoringQuality']['instructions'] | SkillReport['authoringQuality']['resources'],
): string {
  if ('state' in result && result.state === 'not-scored') {
    return `<p><strong>Not scored — ${escapeHtml(result.notScoredReason)}</strong></p>`;
  }
  const findings =
    result.findings.length === 0
      ? '<p class="empty">No structural findings.</p>'
      : `<ul>${result.findings
          .map(
            (finding) =>
              `<li><span class="mark no">!</span><span><strong>${escapeHtml(finding.criterion)}</strong> — ${escapeHtml(finding.message)}<br /><span class="msg">Suggestion: ${escapeHtml(finding.suggestion)}</span></span></li>`,
          )
          .join('')}</ul>`;
  return `<p><strong>${result.score}/100 · ${authoringLabelText(result.label)}</strong></p>${findings}`;
}

function renderFileList(files: string[], emptyMessage: string): string {
  if (files.length === 0) {
    return `<p class="empty">${emptyMessage}</p>`;
  }
  return `<ul>${files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>`;
}

function renderTokenGroup(label: string, group: SkillReport['tokenUsage']['references']): string {
  const rows = group.files
    .map(
      (entry) =>
        `<tr><td><code>${escapeHtml(entry.relativePath)}</code></td><td>${formatNumber(entry.tokens)}</td></tr>`,
    )
    .join('');
  const fileRows =
    rows.length > 0
      ? `<table><thead><tr><th>Path</th><th>Tokens</th></tr></thead><tbody>${rows}</tbody></table>`
      : '<p class="empty">No counted files.</p>';
  return `<h3 id="${slugify(label)}">${escapeHtml(label)} (${formatNumber(group.files.length)})</h3>${fileRows}<p><strong>Aggregate total: ${formatNumber(group.totalTokens)} tokens</strong></p>`;
}

function formatNumber(value: number): string {
  return escapeHtml(value.toLocaleString('en-US'));
}

function scoreBadgeClass(label: StaticDescriptionQualityLabel): string {
  if (label === 'excellent' || label === 'good') return 'q-good';
  if (label === 'acceptable') return 'q-mid';
  return 'q-low';
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
