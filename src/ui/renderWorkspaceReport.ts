import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillCollision,
  CollisionMetrics,
  NameConflict,
  SimilarNames,
} from '../types/Workspace';
import { renderToc, TOC_STYLES, type TocEntry } from './reportToc';
import {
  AUTHORING_HYGIENE_DEFINITION,
  COMPATIBILITY_ALL_AGENTS_DISABLED,
  DESCRIPTION_COMPLETENESS_DEFINITION,
  LOW_TEXT_COVERAGE_DEFINITION,
  SECURITY_DEFINITION,
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
}

export type WorkspaceReportScope =
  | { kind: 'workspace'; folderPath: string }
  | { kind: 'installed-agent'; agentLabel: string; folderPath: string };

const WORKSPACE_REPORT_SECTIONS: readonly TocEntry[] = [
  { id: 'skills', label: 'Skills' },
  { id: 'agent-compatibility', label: 'Agent compatibility' },
  { id: 'duplicate-names', label: 'Duplicate names' },
  { id: 'similar-names', label: 'Similar names' },
  { id: 'collision-matrix', label: 'Collision matrix' },
];

/** Renders the workspace report (skills overview and collision matrix)
 * as a self-contained, theme-aware HTML document. */
export function renderWorkspaceReportHtml(
  analysis: WorkspaceAnalysis,
  opts: RenderOptions,
): string {
  const title = workspaceReportTitle(opts.scope);
  return `<!DOCTYPE html>
<html lang="en">
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
  ${renderToc(WORKSPACE_REPORT_SECTIONS)}
  <main class="report-content">
  <h1>${title}</h1>
  ${opts.generatedAt ? `<p class="note">Generated: ${escapeHtml(opts.generatedAt)}</p>` : ''}
  ${renderScope(opts.scope)}
  <p>${analysis.skills.length} skill(s) · ${analysis.collisions.length} potential collision(s)</p>
  <p class="note">Description completeness is a deterministic heuristic; it does not guarantee runtime skill selection. Collision risk is shown with a separate confidence in the textual evidence.</p>

  <h2 id="skills">Skills</h2>
  <div class="scroll">
    <table>
      <thead><tr><th>Name</th><th>Validation status</th><th title="${DESCRIPTION_COMPLETENESS_DEFINITION}">Completeness</th><th>Heuristic coverage</th><th title="${AUTHORING_HYGIENE_DEFINITION}">Hygiene</th><th>Errors</th><th>Warnings</th><th>Information</th><th title="${SECURITY_DEFINITION}">Security</th><th>Token usage</th><th>External file issues</th></tr></thead>
      <tbody>${analysis.skills.map(renderSkillRow).join('')}</tbody>
    </table>
  </div>

  <h2 id="agent-compatibility">Agent compatibility</h2>
  ${renderCompatibilityMatrix(analysis.skills)}

  <h2 id="duplicate-names">Duplicate names</h2>
  ${renderNameConflicts(analysis.nameConflicts)}

  <h2 id="similar-names">Similar names</h2>
  ${renderSimilarNames(analysis.similarNames)}

  <h2 id="collision-matrix">Collision matrix</h2>
  ${renderCollisions(analysis.collisions)}
  </main>
  </div>
</body>
</html>`;
}

export function workspaceReportTitle(scope: WorkspaceReportScope): string {
  return scope.kind === 'workspace'
    ? "Workspace SKILL.md's Report"
    : `${escapeHtml(scope.agentLabel)} Agent SKILL.md's Report`;
}

function renderScope(scope: WorkspaceReportScope): string {
  return `<p><strong>Folder:</strong> <code>${escapeHtml(scope.folderPath)}</code></p>`;
}

function renderSkillRow(skill: WorkspaceSkill): string {
  const quality = skill.staticDescriptionQuality;
  const instructions = skill.authoringQuality.instructions;
  const instructionQuality =
    instructions.state === 'scored'
      ? `${instructions.score}/100 · ${authoringLabelText(instructions.label)}`
      : `Not scored — ${escapeHtml(instructions.notScoredReason)}`;
  return `<tr><td><code>${escapeHtml(skill.name)}</code></td><td class="${statusClass(skill.validationStatus)}">${skill.validationStatus}</td><td>${renderDescriptionQuality(quality)}</td><td>${quality.coverage}</td><td>${instructionQuality}</td><td>${skill.errors}</td><td>${skill.warnings}</td><td>${skill.information}</td>${securityCell(skill)}${renderTokenCell(skill.tokenUsage)}${resourceIssueCell(skill)}</tr>`;
}

/**
 * The Security column: "OK" when no security-kind findings, otherwise the count,
 * colored red when any finding is an error and amber otherwise. Mirrors the
 * External-file-issues cell so the two risk columns read the same way.
 */
function securityCell(skill: WorkspaceSkill): string {
  const findings = skill.securityFindings ?? [];
  if (findings.length === 0) {
    return '<td class="ok">OK</td>';
  }
  const cls = findings.some((finding) => finding.severity === 'error') ? 'fail' : 'warn';
  return `<td class="${cls}">${findings.length} issue${findings.length === 1 ? '' : 's'}</td>`;
}

function renderTokenCell(usage: WorkspaceSkill['tokenUsage']): string {
  const total = formatNumber(totalSkillTokens(usage));
  const breakdown = `Body ${formatNumber(usage.body.tokens)} · Ref ${formatNumber(
    usage.references.totalTokens,
  )} · Other ${formatNumber(usage.otherFiles.totalTokens)}`;
  return `<td>${total}<div class="token-breakdown">${breakdown}</div></td>`;
}

function resourceIssueCell(skill: WorkspaceSkill): string {
  const issues = skill.resourceGraph.nodes.filter(
    (node) =>
      node.kind === 'missing' || node.kind === 'unreferenced' || node.kind === 'absolute',
  );
  if (issues.length === 0) {
    return '<td class="ok">OK</td>';
  }
  const cls = issues.some((node) => node.kind === 'missing') ? 'fail' : 'warn';
  return `<td class="${cls}">${issues.length} issue${issues.length === 1 ? '' : 's'}</td>`;
}

function renderDescriptionQuality(quality: WorkspaceSkill['staticDescriptionQuality']): string {
  if (quality.state === 'not-scored') {
    return `Not scored — ${escapeHtml(quality.notScoredReason)}`;
  }
  const rawScore =
    quality.rawScore !== quality.adjustedScore
      ? ` <span class="quality-adjustment">(raw: ${quality.rawScore}/100)</span>`
      : '';
  if (quality.gradeLimitations.length === 0) {
    return `${quality.adjustedScore}/100 · ${escapeHtml(capitalize(quality.label))}${rawScore}`;
  }
  const count = quality.gradeLimitations.length;
  const limitations = quality.gradeLimitations
    .map(
      (limitation) =>
        `<li><code>${escapeHtml(limitation.code)}</code> — ceiling: ${limitation.ceiling}/100. ${escapeHtml(limitation.reason)}</li>`,
    )
    .join('');
  return `${quality.adjustedScore}/100 · ${escapeHtml(capitalize(quality.label))}${rawScore}<details class="grade-limitations"><summary>${count} grade limitation${count === 1 ? '' : 's'}</summary><ul>${limitations}</ul></details>`;
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
    return '<p class="empty">No skills analyzed.</p>';
  }
  if (skills[0].compatibility.projections.length === 0) {
    return `<p class="empty">${COMPATIBILITY_ALL_AGENTS_DISABLED}</p>`;
  }
  const labels = skills[0].compatibility.projections.map((projection) => projection.label);
  const head = `<tr><th>Skill</th>${labels
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
    return '<p class="empty">No potential collisions detected.</p>';
  }
  const rows = collisions
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.a)}</code></td><td><code>${escapeHtml(c.b)}</code></td><td>${c.similarity.toFixed(2)}${textCoverageMarker(c.textCoverage)}</td><td>${metricsSummary(c.metrics)}</td><td>${escapeHtml(c.sharedTerms.join(', '))}</td><td class="risk-${c.risk}">${c.risk}</td><td class="conf-${c.confidence}">${c.confidence}</td><td>${escapeHtml(c.recommendation)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>Skill A</th><th>Skill B</th><th>Similarity</th><th>Metrics</th><th>Shared terms</th><th>Risk</th><th>Confidence</th><th>Recommendation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

/**
 * Caveats a similarity the text metrics could not really contribute to: with
 * fewer than 3 comparable content tokens the composite is essentially the name
 * similarity, so identical and unrelated descriptions score the same.
 */
function textCoverageMarker(coverage: SkillCollision['textCoverage']): string {
  return coverage === 'low'
    ? ` <span class="coverage-note" title="${LOW_TEXT_COVERAGE_DEFINITION}">· text coverage: low</span>`
    : '';
}

/** Compact per-metric breakdown behind the composite similarity. */
function metricsSummary(m: CollisionMetrics): string {
  const parts = [
    `J ${m.jaccard.toFixed(2)}`,
    `C ${m.cosine.toFixed(2)}`,
    `N ${m.charNgram.toFixed(2)}`,
    `name ${m.nameSimilarity.toFixed(2)}`,
  ];
  if (m.boundarySeparation > 0) {
    parts.push(`sep ${m.boundarySeparation.toFixed(2)}`);
  }
  return escapeHtml(parts.join(' · '));
}

function renderNameConflicts(conflicts: NameConflict[]): string {
  if (conflicts.length === 0) {
    return '<p class="empty">No duplicate names.</p>';
  }
  const items = conflicts
    .map((c) => {
      const paths = c.entries
        .map((e) => `<li><code>${escapeHtml(e.name)}</code> — ${escapeHtml(e.path)}</li>`)
        .join('');
      return `<li class="fail"><code>${escapeHtml(c.normalized)}</code> (${c.entries.length} skills)<ul>${paths}</ul></li>`;
    })
    .join('');
  return `<ul>${items}</ul>`;
}

function renderSimilarNames(similar: SimilarNames[]): string {
  if (similar.length === 0) {
    return '<p class="empty">No confusingly similar names.</p>';
  }
  const rows = similar
    .map(
      (s) =>
        `<tr><td><code>${escapeHtml(s.a)}</code></td><td><code>${escapeHtml(s.b)}</code></td><td>${s.similarity.toFixed(2)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>Skill A</th><th>Skill B</th><th>Similarity</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function formatNumber(value: number): string {
  return escapeHtml(value.toLocaleString('en-US'));
}
