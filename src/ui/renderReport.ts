import type { SkillReport } from './reportModel';
import type { TriggerQualityFinding, TriggerQualityLabel } from '../types/TriggerQuality';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
}

/** Renders the skill report as a self-contained, theme-aware HTML document. */
export function renderReportHtml(report: SkillReport, opts: RenderOptions): string {
  const statusClass = report.status === 'pass' ? 'ok' : 'fail';
  const statusLabel = report.status === 'pass' ? 'PASS' : 'FAIL';
  const q = report.triggerQuality;

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
  .badge { font-size: 0.75rem; font-weight: 700; padding: 0.15rem 0.6rem; border-radius: 999px; }
  .badge.ok, .badge.q-good { background: var(--vscode-testing-iconPassed, #3fb950); color: #06210c; }
  .badge.fail, .badge.q-low { background: var(--vscode-errorForeground, #f14c4c); color: #2b0606; }
  .badge.q-mid { background: var(--vscode-editorWarning-foreground, #cca700); color: #241f00; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 0.7rem 0.85rem; }
  .card .label { font-size: 0.72rem; text-transform: uppercase; opacity: 0.65; }
  .card .value { font-size: 1.35rem; font-weight: 600; margin-top: 0.15rem; }
  .value.error { color: var(--vscode-errorForeground, #f14c4c); }
  .value.warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  .score { font-size: 2.4rem; font-weight: 700; }
  .score .max { font-size: 1rem; font-weight: 400; opacity: 0.6; }
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
  .limitations { margin-top: 1rem; font-size: 0.9rem; }
  .limitations ul { list-style: disc; padding-left: 1.2rem; }
  .conf-high { color: var(--vscode-testing-iconPassed, #3fb950); }
  .conf-medium { color: var(--vscode-editorWarning-foreground, #cca700); }
  .conf-low { color: var(--vscode-errorForeground, #f14c4c); }
</style>
<title>Skill Report</title>
</head>
<body>
  <h1><code>${escapeHtml(report.name)}</code> <span class="badge ${statusClass}">${statusLabel}</span> <span class="badge ${scoreBadgeClass(q.label)}">Heuristic Trigger Quality ${q.score}/100 · ${capitalize(q.label)}</span></h1>
  <p class="note">A deterministic heuristic that estimates how discoverable the description is. It does not guarantee that an agent will select this skill at runtime.</p>
  <div class="grid">
    ${card('Heuristic Trigger Quality', `<span class="score">${q.score}<span class="max"> / 100</span></span>`)}
    ${card('Confidence', `<span class="conf-${q.confidence}">${capitalize(q.confidence)}</span>`)}
    ${card('Profile', escapeHtml(report.profileLabel))}
    ${card('Description', `${report.descriptionLength} chars`)}
    ${card('Errors', String(report.errorCount), report.errorCount > 0 ? 'error' : '')}
    ${card('Warnings', String(report.warningCount), report.warningCount > 0 ? 'warn' : '')}
    ${card('Information', String(report.informationCount))}
  </div>
  ${
    q.limitations.length > 0
      ? `<div class="limitations"><strong>Limitations</strong><ul>${q.limitations
          .map((l) => `<li>${escapeHtml(l)}</li>`)
          .join('')}</ul></div>`
      : ''
  }

  <h2>Trigger quality breakdown</h2>
  <ul>${q.findings.map(renderFinding).join('')}</ul>

  <h2>Referenced files</h2>
  ${renderFileList(report.referencedFiles, 'No referenced resource files.')}

  <h2>Unreferenced files</h2>
  ${renderFileList(report.unreferencedFiles, 'No unreferenced resource files.')}
</body>
</html>`;
}

function card(label: string, value: string, valueClass = ''): string {
  return `<div class="card"><div class="label">${label}</div><div class="value ${valueClass}">${value}</div></div>`;
}

function renderFinding(finding: TriggerQualityFinding): string {
  const state =
    finding.pointsEarned === finding.pointsPossible
      ? { cls: 'yes', glyph: '✓' }
      : finding.pointsEarned === 0
        ? { cls: 'no', glyph: '✗' }
        : { cls: 'partial', glyph: '◐' };
  return `<li><span class="mark ${state.cls}">${state.glyph}</span><span><strong>${escapeHtml(finding.criterion)}</strong> <span class="msg">— ${escapeHtml(finding.message)}</span></span><span class="pts">${finding.pointsEarned}/${finding.pointsPossible}</span></li>`;
}

function renderFileList(files: string[], emptyMessage: string): string {
  if (files.length === 0) {
    return `<p class="empty">${emptyMessage}</p>`;
  }
  return `<ul>${files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>`;
}

function scoreBadgeClass(label: TriggerQualityLabel): string {
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
