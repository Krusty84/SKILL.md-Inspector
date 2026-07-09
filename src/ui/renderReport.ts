import type { SkillReport, QualityNote } from './reportModel';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
}

/** Renders the skill report as a self-contained, theme-aware HTML document. */
export function renderReportHtml(report: SkillReport, opts: RenderOptions): string {
  const statusClass = report.status === 'pass' ? 'ok' : 'fail';
  const statusLabel = report.status === 'pass' ? 'PASS' : 'FAIL';

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
  .badge.ok { background: var(--vscode-testing-iconPassed, #3fb950); color: #06210c; }
  .badge.fail { background: var(--vscode-errorForeground, #f14c4c); color: #2b0606; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
  .card { border: 1px solid var(--vscode-panel-border); border-radius: 6px; padding: 0.7rem 0.85rem; }
  .card .label { font-size: 0.72rem; text-transform: uppercase; opacity: 0.65; }
  .card .value { font-size: 1.35rem; font-weight: 600; margin-top: 0.15rem; }
  .value.error { color: var(--vscode-errorForeground, #f14c4c); }
  .value.warn { color: var(--vscode-editorWarning-foreground, #cca700); }
  ul { list-style: none; padding-left: 0; }
  li { padding: 0.25rem 0; display: flex; gap: 0.5rem; align-items: baseline; }
  .mark { font-weight: 700; width: 1rem; flex: none; }
  .mark.yes { color: var(--vscode-testing-iconPassed, #3fb950); }
  .mark.no { color: var(--vscode-editorWarning-foreground, #cca700); }
  .detail { opacity: 0.6; font-size: 0.85em; }
  code { font-family: var(--vscode-editor-font-family, monospace); background: var(--vscode-textCodeBlock-background); padding: 0.05rem 0.3rem; border-radius: 3px; }
  .empty { opacity: 0.6; font-style: italic; }
</style>
<title>Skill Report</title>
</head>
<body>
  <h1><code>${escapeHtml(report.name)}</code> <span class="badge ${statusClass}">${statusLabel}</span></h1>
  <div class="grid">
    ${card('Profile', escapeHtml(report.profileLabel))}
    ${card('Description', `${report.descriptionLength} chars`)}
    ${card('Errors', String(report.errorCount), report.errorCount > 0 ? 'error' : '')}
    ${card('Warnings', String(report.warningCount), report.warningCount > 0 ? 'warn' : '')}
    ${card('Information', String(report.informationCount))}
  </div>

  <h2>Description quality</h2>
  <ul>${report.qualityNotes.map(renderNote).join('')}</ul>

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

function renderNote(note: QualityNote): string {
  const mark = note.ok ? '<span class="mark yes">✓</span>' : '<span class="mark no">✗</span>';
  const detail = note.detail ? ` <span class="detail">(${escapeHtml(note.detail)})</span>` : '';
  return `<li>${mark}<span>${escapeHtml(note.label)}${detail}</span></li>`;
}

function renderFileList(files: string[], emptyMessage: string): string {
  if (files.length === 0) {
    return `<p class="empty">${emptyMessage}</p>`;
  }
  return `<ul>${files.map((f) => `<li><code>${escapeHtml(f)}</code></li>`).join('')}</ul>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
