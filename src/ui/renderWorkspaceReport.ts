import type {
  WorkspaceAnalysis,
  WorkspaceSkill,
  SkillCollision,
  NameConflict,
  SimilarNames,
  PortabilityStatus,
} from '../types/Workspace';
import type { SkillProfileId } from '../types/SkillProfile';

export interface RenderOptions {
  nonce: string;
  cspSource: string;
}

const PROFILES: SkillProfileId[] = ['generic', 'vscode', 'claude', 'codex'];

/** Renders the workspace report (skills overview, collision matrix, portability,
 * resource graphs) as a self-contained, theme-aware HTML document. */
export function renderWorkspaceReportHtml(analysis: WorkspaceAnalysis, opts: RenderOptions): string {
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
  h3 { font-size: 0.95rem; margin: 1.2rem 0 0.3rem; }
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
</style>
<title>Workspace Skill Report</title>
</head>
<body>
  <h1>Workspace Skill Report</h1>
  <p>${analysis.skills.length} skill(s) · ${analysis.collisions.length} potential collision(s)</p>

  <h2>Skills</h2>
  <div class="scroll">
    <table>
      <thead><tr><th>Name</th><th>Trigger Quality</th><th>Errors</th><th>Warnings</th>${PROFILES.map((p) => `<th>${p}</th>`).join('')}</tr></thead>
      <tbody>${analysis.skills.map(renderSkillRow).join('')}</tbody>
    </table>
  </div>

  <h2>Duplicate names</h2>
  ${renderNameConflicts(analysis.nameConflicts)}

  <h2>Similar names</h2>
  ${renderSimilarNames(analysis.similarNames)}

  <h2>Collision matrix</h2>
  ${renderCollisions(analysis.collisions)}

  <h2>Resource graphs</h2>
  ${analysis.skills.map(renderResourceGraph).join('') || '<p class="empty">No skills.</p>'}
</body>
</html>`;
}

function renderSkillRow(skill: WorkspaceSkill): string {
  const cells = PROFILES.map((profile) => statusCell(skill.profileCompatibility[profile])).join('');
  return `<tr><td><code>${escapeHtml(skill.name)}</code></td><td>${skill.triggerQualityScore}/100 · ${skill.triggerQualityLabel}</td><td>${skill.errors}</td><td>${skill.warnings}</td>${cells}</tr>`;
}

function renderCollisions(collisions: SkillCollision[]): string {
  if (collisions.length === 0) {
    return '<p class="empty">No potential collisions detected.</p>';
  }
  const rows = collisions
    .map(
      (c) =>
        `<tr><td><code>${escapeHtml(c.a)}</code></td><td><code>${escapeHtml(c.b)}</code></td><td>${c.similarity.toFixed(2)}</td><td>${escapeHtml(c.sharedTerms.join(', '))}</td><td class="risk-${c.risk}">${c.risk}</td><td>${escapeHtml(c.recommendation)}</td></tr>`,
    )
    .join('');
  return `<div class="scroll"><table><thead><tr><th>Skill A</th><th>Skill B</th><th>Similarity</th><th>Shared terms</th><th>Risk</th><th>Recommendation</th></tr></thead><tbody>${rows}</tbody></table></div>`;
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

function renderResourceGraph(skill: WorkspaceSkill): string {
  const { nodes } = skill.resourceGraph;
  if (nodes.length === 0) {
    return `<h3><code>${escapeHtml(skill.name)}</code></h3><p class="empty">No linked or bundled resources.</p>`;
  }
  const items = nodes
    .map((node) => {
      const flags = node.flags.length > 0 ? ` <span class="warn">[${node.flags.join(', ')}]</span>` : '';
      const cls = node.kind === 'missing' ? 'fail' : node.kind === 'unreferenced' ? 'warn' : '';
      return `<li><code>${escapeHtml(node.path)}</code> — <span class="${cls}">${node.kind}</span>${flags}</li>`;
    })
    .join('');
  return `<h3><code>${escapeHtml(skill.name)}</code></h3><ul>${items}</ul>`;
}

function statusCell(status: PortabilityStatus | undefined): string {
  if (status === 'pass') return '<td class="ok">✓</td>';
  if (status === 'warning') return '<td class="warn">⚠</td>';
  if (status === 'fail') return '<td class="fail">✗</td>';
  return '<td>—</td>';
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
