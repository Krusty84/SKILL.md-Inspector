import * as l10n from '@vscode/l10n';
import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillCollision,
  CollisionMetrics,
  NameConflict,
  SimilarNames,
} from '../types/Workspace';
import type {
  HeuristicCoverage,
  StaticDescriptionQualityLabel,
} from '../types/StaticDescriptionQuality';
import { renderToc, TOC_STYLES, type TocEntry } from './reportToc';
import {
  authoringHygieneDefinition,
  compatibilityAllAgentsDisabledText,
  descriptionCompletenessDefinition,
  lowTextCoverageDefinition,
  securityDefinition,
  authoringLabelText,
  compatibilityFooterText,
  compatibilityVerdictText,
} from './metricDefinitions';
import { totalSkillTokens } from '../analysis/tokenUsage';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
  scope: WorkspaceReportScope;
  /** Local date & time string for when the report was generated. */
  generatedAt?: string;
  /** BCP 47 tag used for number formatting and the document language. */
  locale?: string;
}

export type WorkspaceReportScope =
  | { kind: 'workspace'; folderPath: string }
  | { kind: 'installed-agent'; agentLabel: string; folderPath: string };

// The section ids are load-bearing (existing anchors and links) and stay
// locale-independent; only the visible labels are localized. A function so no
// l10n.t() runs at module load.
function workspaceReportSections(): readonly TocEntry[] {
  return [
    { id: 'skills', label: l10n.t('Skills') },
    { id: 'agent-compatibility', label: l10n.t('Agent compatibility') },
    { id: 'duplicate-names', label: l10n.t('Duplicate names') },
    { id: 'similar-names', label: l10n.t('Similar names') },
    { id: 'collision-matrix', label: l10n.t('Collision matrix') },
  ];
}

/**
 * Locale for number formatting, set per render. Module state is safe here: the
 * render is synchronous and single-threaded, and the default keeps English
 * output byte-stable for tests.
 */
let activeLocale = 'en-US';

/** Renders the workspace report (skills overview and collision matrix)
 * as a self-contained, theme-aware HTML document. */
export function renderWorkspaceReportHtml(
  analysis: WorkspaceAnalysis,
  opts: RenderOptions,
): string {
  activeLocale = opts.locale ?? 'en-US';
  const title = workspaceReportTitle(opts.scope);
  return `<!DOCTYPE html>
<html lang="${escapeHtml(activeLocale.split('-')[0] || 'en')}">
<head>
<meta charset="UTF-8" />
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${opts.cspSource} 'nonce-${opts.nonce}';" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<style nonce="${opts.nonce}">
  body { font-family: var(--vscode-font-family); color: var(--vscode-foreground); padding: 0 1.25rem 2rem; line-height: 1.5; }
  h1 { font-size: 1.4rem; }
  h2 { font-size: 1rem; text-transform: uppercase; letter-spacing: 0.04em; opacity: 0.75; margin-top: 2rem; border-bottom: 1px solid var(--vscode-panel-border); padding-bottom: 0.35rem; }
  .scroll { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; margin-top: 0.75rem; font-size: 0.9rem; }
  th, td { text-align: left; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--vscode-panel-border); vertical-align: top; }
  th { text-transform: uppercase; font-size: 0.7rem; letter-spacing: 0.03em; opacity: 0.7; }
  .ok { color: var(--vscode-testing-iconPassed, #3fb950); }
  .warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .fail { color: var(--vscode-errorForeground, #f14c4c); }
  .risk-High { color: var(--vscode-errorForeground, #f14c4c); font-weight: 700; }
  .risk-Medium { color: var(--vscode-editorWarning-foreground, #cca700); font-weight: 700; }
  .risk-Low { opacity: 0.85; }
  code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background); padding: 0.05rem 0.3rem; border-radius: 3px; }
  ul { margin: 0.2rem 0; padding-left: 1.1rem; }
  .empty { opacity: 0.6; font-style: italic; }
  .note { opacity: 0.65; font-size: 0.85rem; margin: 0.25rem 0 0; }
  .conf-high { color: var(--vscode-testing-iconPassed, #3fb950); }
  .conf-medium { color: var(--vscode-editorWarning-foreground, #cca700); }
  .conf-low { opacity: 0.7; }
  .quality-adjustment { white-space: nowrap; }
  .coverage-note { opacity: 0.7; font-size: 0.85em; white-space: nowrap; }
  .token-breakdown { font-size: 0.78rem; opacity: 0.7; margin-top: 0.15rem; line-height: 1.4; }
  .grade-limitations { margin-top: 0.2rem; font-size: 0.82rem; }
  .grade-limitations summary { cursor: pointer; }
  .grade-limitations ul { margin-top: 0.15rem; }${TOC_STYLES}
</style>
<title>${title}</title>
</head>
<body>
  <div class="report-layout">
  ${renderToc(workspaceReportSections())}
  <main class="report-content">
  <h1>${title}</h1>
  ${opts.generatedAt ? `<p class="note">${l10n.t('Generated: {0}', escapeHtml(opts.generatedAt))}</p>` : ''}
  ${renderScope(opts.scope)}
  <p>${l10n.t('{0} skill(s) · {1} potential collision(s)', analysis.skills.length, analysis.collisions.length)}</p>
  <p class="note">${l10n.t('Description completeness is a deterministic heuristic; it does not guarantee runtime skill selection. Collision risk is shown with a separate confidence in the textual evidence.')}</p>

  <h2 id="skills">${l10n.t('Skills')}</h2>
  <div class="scroll">
    <table>
      <thead><tr><th>${l10n.t('Name')}</th><th>${l10n.t('Validation status')}</th><th title="${descriptionCompletenessDefinition()}">${l10n.t('Completeness')}</th><th>${l10n.t('Heuristic coverage')}</th><th title="${authoringHygieneDefinition()}">${l10n.t('Hygiene')}</th><th>${l10n.t('Errors')}</th><th>${l10n.t('Warnings')}</th><th>${l10n.t('Information')}</th><th title="${securityDefinition()}">${l10n.t('Security')}</th><th>${l10n.t('Token usage')}</th><th>${l10n.t('External file issues')}</th></tr></thead>
      <tbody>${analysis.skills.map(renderSkillRow).join('')}</tbody>
    </table>
  </div>

  <h2 id="agent-compatibility">${l10n.t('Agent compatibility')}</h2>
  ${renderCompatibilityMatrix(analysis.skills)}

  <h2 id="duplicate-names">${l10n.t('Duplicate names')}</h2>
  ${renderNameConflicts(analysis.nameConflicts)}

  <h2 id="similar-names">${l10n.t('Similar names')}</h2>
  ${renderSimilarNames(analysis.similarNames)}

  <h2 id="collision-matrix">${l10n.t('Collision matrix')}</h2>
  ${renderCollisions(analysis.collisions)}
  </main>
  </div>
</body>
</html>`;
}

export function workspaceReportTitle(scope: WorkspaceReportScope): string {
  return scope.kind === 'workspace'
    ? l10n.t("Workspace SKILL.md's Report")
    : l10n.t("{0} Agent SKILL.md's Report", escapeHtml(scope.agentLabel));
}

function renderScope(scope: WorkspaceReportScope): string {
  return `<p><strong>${l10n.t('Folder:')}</strong> <code>${escapeHtml(scope.folderPath)}</code></p>`;
}

function renderSkillRow(skill: WorkspaceSkill): string {
  const quality = skill.staticDescriptionQuality;
  const instructions = skill.authoringQuality.instructions;
  const instructionQuality =
    instructions.state === 'scored'
      ? `${instructions.score}/100 · ${authoringLabelText(instructions.label)}`
      : l10n.t('Not scored — {0}', escapeHtml(instructions.notScoredReason));
  return `<tr><td><code>${escapeHtml(skill.name)}</code></td><td class="${statusClass(skill.validationStatus)}">${validationStatusText(skill.validationStatus)}</td><td>${renderDescriptionQuality(quality)}</td><td>${coverageText(quality.coverage)}</td><td>${instructionQuality}</td><td>${skill.errors}</td><td>${skill.warnings}</td><td>${skill.information}</td>${securityCell(skill)}${renderTokenCell(skill.tokenUsage)}${resourceIssueCell(skill)}</tr>`;
}

/**
 * The Security column: "OK" when no security-kind findings, otherwise the count,
 * colored red when any finding is an error and amber otherwise. Mirrors the
 * External-file-issues cell so the two risk columns read the same way.
 */
function securityCell(skill: WorkspaceSkill): string {
  const findings = skill.securityFindings ?? [];
  if (findings.length === 0) {
    return `<td class="ok">${l10n.t({ message: 'OK', comment: ['Table cell: the skill has no issues in this column'] })}</td>`;
  }
  const cls = findings.some((finding) => finding.severity === 'error') ? 'fail' : 'warn';
  return `<td class="${cls}">${findings.length === 1 ? l10n.t('1 issue') : l10n.t('{0} issues', findings.length)}</td>`;
}

function renderTokenCell(usage: WorkspaceSkill['tokenUsage']): string {
  const total = formatNumber(totalSkillTokens(usage));
  const breakdown = l10n.t({
    message: 'Body {0} · Ref {1} · Other {2}',
    args: [
      formatNumber(usage.body.tokens),
      formatNumber(usage.references.totalTokens),
      formatNumber(usage.otherFiles.totalTokens),
    ],
    comment: ['Token-count breakdown: SKILL.md body, references/ files, other text files'],
  });
  return `<td>${total}<div class="token-breakdown">${breakdown}</div></td>`;
}

function resourceIssueCell(skill: WorkspaceSkill): string {
  const issues = skill.resourceGraph.nodes.filter(
    (node) =>
      node.kind === 'missing' || node.kind === 'unreferenced' || node.kind === 'absolute',
  );
  if (issues.length === 0) {
    return `<td class="ok">${l10n.t({ message: 'OK', comment: ['Table cell: the skill has no issues in this column'] })}</td>`;
  }
  const cls = issues.some((node) => node.kind === 'missing') ? 'fail' : 'warn';
  return `<td class="${cls}">${issues.length === 1 ? l10n.t('1 issue') : l10n.t('{0} issues', issues.length)}</td>`;
}

function renderDescriptionQuality(quality: WorkspaceSkill['staticDescriptionQuality']): string {
  if (quality.state === 'not-scored') {
    return l10n.t('Not scored — {0}', escapeHtml(quality.notScoredReason));
  }
  const rawScore =
    quality.rawScore !== quality.adjustedScore
      ? ` <span class="quality-adjustment">${l10n.t('(raw: {0}/100)', quality.rawScore)}</span>`
      : '';
  if (quality.gradeLimitations.length === 0) {
    return `${quality.adjustedScore}/100 · ${escapeHtml(qualityLabelText(quality.label))}${rawScore}`;
  }
  const count = quality.gradeLimitations.length;
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
  return `${quality.adjustedScore}/100 · ${escapeHtml(qualityLabelText(quality.label))}${rawScore}<details class="grade-limitations"><summary>${count === 1 ? l10n.t('1 grade limitation') : l10n.t('{0} grade limitations', count)}</summary><ul>${limitations}</ul></details>`;
}

function statusClass(status: WorkspaceSkill['validationStatus']): string {
  return status === 'pass' ? 'ok' : status === 'warning' ? 'warn' : 'fail';
}

/**
 * Skills × agents verdict matrix (plan §7). `not-evaluated` renders as the
 * words "not evaluated", never as an empty or zero-like cell.
 */
function renderCompatibilityMatrix(skills: WorkspaceSkill[]): string {
  if (skills.length === 0) {
    return `<p class="empty">${l10n.t('No skills analyzed.')}</p>`;
  }
  if (skills[0].compatibility.projections.length === 0) {
    return `<p class="empty">${compatibilityAllAgentsDisabledText()}</p>`;
  }
  const labels = skills[0].compatibility.projections.map((projection) => projection.label);
  const head = `<tr><th>${l10n.t('Skill')}</th>${labels
    .map((label) => `<th>${escapeHtml(label)}</th>`)
    .join('')}</tr>`;
  const rows = skills
    .map(
      (skill) =>
        `<tr><td><code>${escapeHtml(skill.name)}</code></td>${skill.compatibility.projections
          .map((projection) => {
            const cls = verdictClass(projection.verdict);
            return `<td${cls === '' ? '' : ` class="${cls}"`}>${compatibilityVerdictText(projection.verdict)}</td>`;
          })
          .join('')}</tr>`,
    )
    .join('');
  const footer = `<p class="note">${escapeHtml(
    compatibilityFooterText(skills[0].compatibility.verifiedOn),
  )}</p>`;
  return `<div class="scroll"><table><thead>${head}</thead><tbody>${rows}</tbody></table></div>${footer}`;
}

function verdictClass(verdict: WorkspaceSkill['compatibility']['projections'][number]['verdict']): string {
  return verdict === 'compatible'
    ? 'ok'
    : verdict === 'notes'
      ? 'warn'
      : verdict === 'issues'
        ? 'fail'
        : '';
}

function renderCollisions(collisions: SkillCollision[]): string {
  if (collisions.length === 0) {
    return `<p class="empty">${l10n.t('No potential collisions detected.')}</p>`;
  }
  const rows = collisions
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.a)}</code></td><td><code>${escapeHtml(c.b)}</code></td><td>${c.similarity.toFixed(2)}${textCoverageMarker(c.textCoverage)}</td><td>${metricsSummary(c.metrics)}</td><td>${escapeHtml(c.sharedTerms.join(', '))}</td><td class="risk-${c.risk}">${riskText(c.risk)}</td><td class="conf-${c.confidence}">${confidenceText(c.confidence)}</td><td>${escapeHtml(c.recommendation)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>${l10n.t({ message: 'Skill A', comment: ['Table header: the first skill of the compared pair'] })}</th><th>${l10n.t({ message: 'Skill B', comment: ['Table header: the second skill of the compared pair'] })}</th><th>${l10n.t('Similarity')}</th><th>${l10n.t('Metrics')}</th><th>${l10n.t('Shared terms')}</th><th>${l10n.t('Risk')}</th><th>${l10n.t('Confidence')}</th><th>${l10n.t('Recommendation')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Caveats a similarity the text metrics could not really contribute to: with
 * fewer than 3 comparable content tokens the composite is essentially the name
 * similarity, so identical and unrelated descriptions score the same.
 */
function textCoverageMarker(coverage: SkillCollision['textCoverage']): string {
  return coverage === 'low'
    ? ` <span class="coverage-note" title="${lowTextCoverageDefinition()}">· ${l10n.t('text coverage: low')}</span>`
    : '';
}

/** Compact per-metric breakdown behind the composite similarity. */
function metricsSummary(m: CollisionMetrics): string {
  const parts = [
    l10n.t({
      message: 'J {0}',
      args: [m.jaccard.toFixed(2)],
      comment: ['Abbreviation: pairwise token Jaccard similarity'],
    }),
    l10n.t({
      message: 'C {0}',
      args: [m.cosine.toFixed(2)],
      comment: ['Abbreviation: TF-IDF cosine similarity'],
    }),
    l10n.t({
      message: 'N {0}',
      args: [m.charNgram.toFixed(2)],
      comment: ['Abbreviation: character n-gram similarity'],
    }),
    l10n.t({
      message: 'name {0}',
      args: [m.nameSimilarity.toFixed(2)],
      comment: ['Abbreviation: skill-name edit-distance similarity'],
    }),
  ];
  if (m.boundarySeparation > 0) {
    parts.push(
      l10n.t({
        message: 'sep {0}',
        args: [m.boundarySeparation.toFixed(2)],
        comment: ['Abbreviation: boundary separation between the two skill scopes'],
      }),
    );
  }
  return escapeHtml(parts.join(' · '));
}

function renderNameConflicts(conflicts: NameConflict[]): string {
  if (conflicts.length === 0) {
    return `<p class="empty">${l10n.t('No duplicate names.')}</p>`;
  }
  const items = conflicts
    .map((c) => {
      const paths = c.entries
        .map((e) => `<li><code>${escapeHtml(e.name)}</code> — ${escapeHtml(e.path)}</li>`)
        .join('');
      return `<li class="fail"><code>${escapeHtml(c.normalized)}</code> ${l10n.t('({0} skills)', c.entries.length)}<ul>${paths}</ul></li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

function renderSimilarNames(similar: SimilarNames[]): string {
  if (similar.length === 0) {
    return `<p class="empty">${l10n.t('No confusingly similar names.')}</p>`;
  }
  const rows = similar
    .map(
      (s) =>
        `<tr><td><code>${escapeHtml(s.a)}</code></td><td><code>${escapeHtml(s.b)}</code></td><td>${s.similarity.toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>${l10n.t({ message: 'Skill A', comment: ['Table header: the first skill of the compared pair'] })}</th><th>${l10n.t({ message: 'Skill B', comment: ['Table header: the second skill of the compared pair'] })}</th><th>${l10n.t('Similarity')}</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function formatNumber(value: number): string {
  return escapeHtml(value.toLocaleString(activeLocale));
}

/**
 * Reader-facing words for enum values that previously leaked into the UI
 * verbatim. Each branch is a literal l10n.t() call so the extractor sees the
 * key, and each English default is byte-identical to the raw enum member it
 * replaces (the CSS classes keep using the raw values).
 */
function validationStatusText(status: WorkspaceSkill['validationStatus']): string {
  switch (status) {
    case 'pass':
      return l10n.t('pass');
    case 'warning':
      return l10n.t('warning');
    case 'fail':
      return l10n.t('fail');
  }
}

/** Same keys as renderReport.ts's quality labels; replaces `capitalize(label)`. */
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

/** Lower-case, unlike the skill report's Coverage card: this table showed the raw value. */
function coverageText(coverage: HeuristicCoverage): string {
  switch (coverage) {
    case 'high':
      return l10n.t('high');
    case 'medium':
      return l10n.t('medium');
    case 'low':
      return l10n.t('low');
  }
}

function riskText(risk: SkillCollision['risk']): string {
  switch (risk) {
    case 'High':
      return l10n.t('High');
    case 'Medium':
      return l10n.t('Medium');
    case 'Low':
      return l10n.t('Low');
  }
}

function confidenceText(confidence: SkillCollision['confidence']): string {
  switch (confidence) {
    case 'high':
      return l10n.t('high');
    case 'medium':
      return l10n.t('medium');
    case 'low':
      return l10n.t('low');
  }
}
