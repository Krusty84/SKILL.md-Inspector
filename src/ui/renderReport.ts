import * as l10n from '@vscode/l10n';
import type { SkillReport } from './reportModel';
import type {
  HeuristicCoverage,
  StaticDescriptionQualityFinding,
  StaticDescriptionQualityLabel,
} from '../types/StaticDescriptionQuality';
import { renderToc, TOC_STYLES, type TocEntry } from './reportToc';
import {
  agentCompatibilityDefinition,
  authoringHygieneDefinition,
  authoringHygieneInstructionsHeading,
  authoringHygieneResourcesHeading,
  compatibilityAllAgentsDisabledText,
  descriptionCompletenessDefinition,
  securityDefinition,
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
  /** BCP 47 tag used for number formatting and the document language. */
  locale?: string;
}

// The section ids are load-bearing (existing anchors and links) and stay
// locale-independent; only the visible labels are localized. A function so no
// l10n.t() runs at module load.
function skillReportSections(): readonly TocEntry[] {
  return [
    { id: 'validation-findings', label: l10n.t('Validation findings') },
    { id: 'security-findings', label: l10n.t('Security Issues') },
    { id: 'agent-compatibility', label: l10n.t('Agent compatibility') },
    { id: 'trigger-quality-breakdown', label: l10n.t('Trigger quality breakdown') },
    { id: 'instruction-authoring-quality', label: authoringHygieneInstructionsHeading() },
    { id: 'resource-authoring-quality', label: authoringHygieneResourcesHeading() },
    { id: 'referenced-files', label: l10n.t('Referenced files') },
    { id: 'unreferenced-files', label: l10n.t('Unreferenced files') },
    {
      id: 'token-usage',
      label: l10n.t('Token usage'),
      children: [
        { id: 'reference-files', label: l10n.t('Reference files') },
        { id: 'non-standard-files', label: l10n.t('Other text files') },
      ],
    },
  ];
}

/**
 * Locale for number formatting, set per render. Module state is safe here: the
 * render is synchronous and single-threaded, and the default keeps English
 * output byte-stable for tests.
 */
let activeLocale = 'en-US';

/** Renders the skill report as a self-contained, theme-aware HTML document. */
export function renderReportHtml(report: SkillReport, opts: RenderOptions): string {
  activeLocale = opts.locale ?? 'en-US';
  const statusClass =
    report.status === 'pass' ? 'ok' : report.status === 'warning' ? 'warning' : 'fail';
  const statusLabel =
    report.status === 'pass'
      ? l10n.t('VALID')
      : report.status === 'warning'
        ? l10n.t('VALID WITH WARNINGS')
        : l10n.t('INVALID');
  const q = report.staticDescriptionQuality;
  const instructions = report.authoringQuality.instructions;
  const descriptionBadge =
    q.state === 'scored'
      ? `<span class="badge ${scoreBadgeClass(q.label)}" title="${descriptionCompletenessDefinition()}">${l10n.t('Description completeness {0}/100 · {1}', q.adjustedScore, escapeHtml(qualityLabelText(q.label)))}</span>`
      : `<span class="badge q-not-scored">${l10n.t('Description completeness: Not scored — {0}', escapeHtml(q.notScoredReason))}</span>`;
  const descriptionCard =
    q.state === 'scored'
      ? `<span class="score">${q.adjustedScore}<span class="max"> / 100</span></span>`
      : l10n.t('Not scored — {0}', escapeHtml(q.notScoredReason));
  const instructionCard =
    instructions.state === 'scored'
      ? `${instructions.score}/100 · ${authoringLabelText(instructions.label)}`
      : l10n.t('Not scored — {0}', escapeHtml(instructions.notScoredReason));
  const instructionCardLabel =
    instructions.state === 'scored' ? l10n.t('Authoring hygiene') : l10n.t('Instruction structure');
  const tokens = report.tokenUsage;
  const tokenCardValue = `${formatNumber(totalSkillTokens(tokens))}<div class="token-breakdown">${l10n.t(
    {
      message: 'Body {0} · Ref {1} · Other {2}',
      args: [
        formatNumber(tokens.body.tokens),
        formatNumber(tokens.references.totalTokens),
        formatNumber(tokens.otherFiles.totalTokens),
      ],
      comment: ['Token-count breakdown: SKILL.md body, references/ files, other text files'],
    },
  )}</div>`;
  const securityFindings = report.diagnostics.filter((d) => d.kind === 'security');
  const securityCardClass =
    securityFindings.some((d) => d.severity === 'error')
      ? 'error'
      : securityFindings.length > 0
        ? 'warn'
        : '';

  return `<!DOCTYPE html>
<html lang="${escapeHtml(activeLocale.split('-')[0] || 'en')}">
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
<title>${escapeHtml(l10n.t('Skill Report'))}</title>
</head>
<body>
  <div class="report-layout">
  ${renderToc(skillReportSections())}
  <main class="report-content">
  <h1><code>${escapeHtml(report.name)}</code> <span class="badge ${statusClass}">${l10n.t('Validation status: {0}', statusLabel)}</span> ${descriptionBadge}</h1>
  ${opts.generatedAt ? `<p class="note">${l10n.t('Generated: {0}', escapeHtml(opts.generatedAt))}</p>` : ''}
  <p class="note">${l10n.t('Description completeness: {0} It is deterministic and does not guarantee that an agent will select this skill at runtime.', descriptionCompletenessDefinition())}</p>
  <div class="grid">
    ${card(l10n.t('Description completeness'), descriptionCard, '', descriptionCompletenessDefinition())}
    ${card(instructionCardLabel, instructionCard, '', authoringHygieneDefinition())}
    ${card(l10n.t('Coverage'), `<span class="conf-${q.coverage}">${coverageText(q.coverage)}</span>`)}
    ${card(l10n.t('Description'), l10n.t('{0} chars', report.descriptionLength))}
    ${card(l10n.t('Lines'), formatNumber(report.tokenUsage.body.lines), '', l10n.t('Line count of the SKILL.md Markdown body.'))}
    ${card(l10n.t('Token usage'), tokenCardValue)}
    ${card(l10n.t('Errors'), String(report.errorCount), report.errorCount > 0 ? 'error' : '')}
    ${card(l10n.t('Warnings'), String(report.warningCount), report.warningCount > 0 ? 'warn' : '')}
    ${card(l10n.t('Information'), String(report.informationCount))}
    ${card(l10n.t('Security'), String(securityFindings.length), securityCardClass, securityDefinition())}
  </div>
  ${renderCompatibilityBar(report.compatibility)}
  ${renderGradeLimitations(q)}
  ${
    q.limitations.length > 0
      ? `<div class="limitations"><strong>${l10n.t('Heuristic coverage limitations')}</strong><ul>${q.limitations
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join('')}</ul></div>`
      : ''
  }

  <h2 id="validation-findings">${l10n.t('Validation findings')}</h2>
  ${renderDiagnostics(report.diagnostics.filter((d) => d.kind !== 'security'))}

  <h2 id="security-findings">${l10n.t('Security Issues')}</h2>
  ${renderSecurity(securityFindings)}

  <h2 id="agent-compatibility">${l10n.t('Agent compatibility')}</h2>
  ${renderCompatibility(report.compatibility)}

  <h2 id="trigger-quality-breakdown">${l10n.t('Trigger quality breakdown')}</h2>
  ${q.state === 'scored' ? `<ul>${q.findings.map(renderFinding).join('')}</ul>` : `<p class="empty">${l10n.t('Description completeness was not scored — {0}.', escapeHtml(q.notScoredReason))}</p>`}

  <h2 id="instruction-authoring-quality">${authoringHygieneInstructionsHeading()}</h2>
  ${renderAuthoring(report.authoringQuality.instructions)}
  <h2 id="resource-authoring-quality">${authoringHygieneResourcesHeading()}</h2>
  ${renderAuthoring(report.authoringQuality.resources)}
  <p class="note">${l10n.t('Authoring hygiene: {0} It is reported on its own and never combined with description completeness.', authoringHygieneDefinition())}</p>

  <h2 id="referenced-files">${l10n.t('Referenced files')}</h2>
  ${renderFileList(report.referencedFiles, l10n.t('No referenced resource files.'))}

  <h2 id="unreferenced-files">${l10n.t('Unreferenced files')}</h2>
  ${renderFileList(report.unreferencedFiles, l10n.t('No unreferenced resource files.'))}

  <h2 id="token-usage">${l10n.t('Token usage ({0})', escapeHtml(report.tokenUsage.encoding))}</h2>
  <table><tbody>
    <tr><th>${l10n.t('Content')}</th><th>${l10n.t('Tokens')}</th><th>${l10n.t('Lines')}</th></tr>
    <tr><td>${l10n.t('{0} body', '<code>SKILL.md</code>')}</td><td>${formatNumber(report.tokenUsage.body.tokens)}</td><td>${formatNumber(report.tokenUsage.body.lines)}</td></tr>
  </tbody></table>
  ${renderTokenGroup('reference-files', l10n.t('Reference files'), report.tokenUsage.references)}
  ${renderTokenGroup('non-standard-files', l10n.t('Other text files'), report.tokenUsage.otherFiles)}
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
      ? `<p>${l10n.t(
          'Raw criterion score: {0}. Adjusted score after ceilings: {1}.',
          `<strong>${quality.rawScore}/100</strong>`,
          `<strong>${quality.adjustedScore}/100</strong>`,
        )}</p>`
      : '';
  const limitations = quality.gradeLimitations
    .map(
      (limitation) =>
        `<li>${l10n.t(
          '{0} — ceiling: {1}/100. {2}',
          `<code>${escapeHtml(limitation.code)}</code>`,
          limitation.ceiling,
          escapeHtml(limitation.reason),
        )}</li>`,
    )
    .join('');
  return `<div class="adjustments"><strong>${l10n.t('Grade limitations and score adjustments')}</strong>${scoreSummary}<ul>${limitations}</ul></div>`;
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
      const name = projection.agent === 'spec' ? l10n.t('Regular SKILL.md') : projection.label;
      const lamp =
        projection.verdict === 'not-evaluated'
          ? `<span class="empty">${l10n.t('not evaluated')}</span>`
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
  return `<div class="card compat-bar" title="${agentCompatibilityDefinition()}"><div class="label">${l10n.t('Agent compatibility')}</div>${agents}</div>`;
}

/** One row per agent: verdict plus the findings behind it (plan §7). */
function renderCompatibility(compatibility: SkillReport['compatibility']): string {
  if (compatibility.projections.length === 0) {
    return `<p class="empty">${compatibilityAllAgentsDisabledText()}</p>`;
  }
  const rows = compatibility.projections
    .map((projection) => {
      const findings =
        projection.verdict === 'not-evaluated'
          ? `<span class="empty">${escapeHtml(projection.notEvaluatedReason ?? l10n.t('not evaluated'))}</span>`
          : projection.findings.length === 0
            ? `<span class="empty">${l10n.t('None')}</span>`
            : `<ul>${projection.findings
                .map((finding) => `<li>${escapeHtml(finding.message)}</li>`)
                .join('')}</ul>`;
      return `<tr><td>${escapeHtml(projection.label)}</td><td>${compatibilityVerdictText(projection.verdict)}</td><td>${findings}</td></tr>`;
    })
    .join('');
  return `<table><thead><tr><th>${l10n.t('Agent')}</th><th>${l10n.t('Verdict')}</th><th>${l10n.t('Findings')}</th></tr></thead><tbody>${rows}</tbody></table><p class="note">${escapeHtml(compatibilityFooterText(compatibility.verifiedOn))}</p>`;
}

function renderDiagnostics(diagnostics: SkillReport['diagnostics']): string {
  if (diagnostics.length === 0) {
    return `<p class="empty">${l10n.t('No validation findings.')}</p>`;
  }
  return `<table><thead><tr><th>${l10n.t('Severity')}</th><th>${l10n.t('Diagnostic code')}</th><th>${l10n.t('Message')}</th></tr></thead><tbody>${diagnostics
    .map(
      (diagnostic) =>
        `<tr><td>${escapeHtml(severityText(diagnostic.severity))}</td><td><code>${escapeHtml(diagnostic.code)}</code></td><td>${escapeHtml(diagnostic.message)}</td></tr>`,
    )
    .join('')}</tbody></table>`;
}

/**
 * The dedicated Security Issues section: the security-kind findings on their
 * own. These are shown here only — the Validation findings table filters them
 * out — so a risky command or leaked credential has one clear home.
 */
function renderSecurity(findings: SkillReport['diagnostics']): string {
  if (findings.length === 0) {
    return `<p class="empty">${l10n.t('No security issues found.')}</p>`;
  }
  const rows = findings
    .map(
      (finding) =>
        `<tr><td>${escapeHtml(severityText(finding.severity))}</td><td><code>${escapeHtml(finding.code)}</code></td><td>${escapeHtml(finding.message)}</td></tr>`,
    )
    .join('');
  return `<p class="note">${securityDefinition()}</p><table><thead><tr><th>${l10n.t('Severity')}</th><th>${l10n.t('Diagnostic code')}</th><th>${l10n.t('Message')}</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderAuthoring(
  result:
    SkillReport['authoringQuality']['instructions'] | SkillReport['authoringQuality']['resources'],
): string {
  if ('state' in result && result.state === 'not-scored') {
    return `<p><strong>${l10n.t('Not scored — {0}', escapeHtml(result.notScoredReason))}</strong></p>`;
  }
  const findings =
    result.findings.length === 0
      ? `<p class="empty">${l10n.t('No structural findings.')}</p>`
      : `<ul>${result.findings
          .map(
            (finding) =>
              `<li><span class="mark no">!</span><span><strong>${escapeHtml(finding.criterion)}</strong> — ${escapeHtml(finding.message)}<br /><span class="msg">${l10n.t('Suggestion: {0}', escapeHtml(finding.suggestion))}</span></span></li>`,
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

// The anchor id is fixed (it must match the TOC entry in every locale); only
// the visible label is localized.
function renderTokenGroup(
  id: string,
  label: string,
  group: SkillReport['tokenUsage']['references'],
): string {
  const rows = group.files
    .map(
      (entry) =>
        `<tr><td><code>${escapeHtml(entry.relativePath)}</code></td><td>${formatNumber(entry.tokens)}</td></tr>`,
    )
    .join('');
  const fileRows =
    rows.length > 0
      ? `<table><thead><tr><th>${l10n.t('Path')}</th><th>${l10n.t('Tokens')}</th></tr></thead><tbody>${rows}</tbody></table>`
      : `<p class="empty">${l10n.t('No counted files.')}</p>`;
  return `<h3 id="${id}">${escapeHtml(label)} (${formatNumber(group.files.length)})</h3>${fileRows}<p><strong>${l10n.t('Aggregate total: {0} tokens', formatNumber(group.totalTokens))}</strong></p>`;
}

function formatNumber(value: number): string {
  return escapeHtml(value.toLocaleString(activeLocale));
}

function scoreBadgeClass(label: StaticDescriptionQualityLabel): string {
  if (label === 'excellent' || label === 'good') return 'q-good';
  if (label === 'acceptable') return 'q-mid';
  return 'q-low';
}

function qualityLabelText(label: StaticDescriptionQualityLabel): string {
  switch (label) {
    case 'excellent':
      return l10n.t('Excellent');
    case 'good':
      return l10n.t('Good');
    case 'acceptable':
      return l10n.t('Acceptable');
    case 'weak':
      return l10n.t('Weak');
    case 'poor':
      return l10n.t('Poor');
  }
}

function coverageText(coverage: HeuristicCoverage): string {
  switch (coverage) {
    case 'high':
      return l10n.t('High');
    case 'medium':
      return l10n.t('Medium');
    case 'low':
      return l10n.t('Low');
  }
}

function severityText(severity: SkillReport['diagnostics'][number]['severity']): string {
  switch (severity) {
    case 'error':
      return l10n.t('Error');
    case 'warning':
      return l10n.t('Warning');
    case 'information':
      return l10n.t('Information');
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
