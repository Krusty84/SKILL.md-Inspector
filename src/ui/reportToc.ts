import * as l10n from '@vscode/l10n';

export interface TocEntry {
  id: string;
  label: string;
  children?: readonly TocEntry[];
}

/** Stable anchor id from a heading label, e.g. "Reference files" -> "reference-files". */
export function slugify(label: string): string {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderList(entries: readonly TocEntry[]): string {
  return `<ul>${entries
    .map(
      (entry) =>
        `<li><a href="#${escapeHtml(entry.id)}">${escapeHtml(entry.label)}</a>${
          entry.children && entry.children.length > 0 ? renderList(entry.children) : ''
        }</li>`,
    )
    .join('')}</ul>`;
}

/** Renders the left-hand section navigation as pure HTML anchor links (no scripts). */
export function renderToc(entries: readonly TocEntry[]): string {
  return `<nav class="report-toc" aria-label="${escapeHtml(l10n.t('Report sections'))}"><p class="report-toc-title">${escapeHtml(l10n.t('Contents'))}</p>${renderList(
    entries,
  )}</nav>`;
}

/** CSS for the two-column TOC layout, appended into each report's nonce'd <style> block. */
export const TOC_STYLES = `
  .report-layout { display: flex; gap: 1.5rem; align-items: flex-start; }
  .report-toc { position: sticky; top: 0; flex: 0 0 12rem; max-height: 100vh; overflow: auto; padding: 1.25rem 0; }
  .report-toc-title { text-transform: uppercase; font-size: 0.72rem; letter-spacing: 0.04em; opacity: 0.6; margin: 0 0 0.5rem; }
  .report-toc ul { list-style: none; margin: 0; padding-left: 0; }
  .report-toc ul ul { padding-left: 0.85rem; }
  .report-toc li { padding: 0.1rem 0; }
  .report-toc a { display: block; color: var(--vscode-foreground); text-decoration: none; opacity: 0.8; padding: 0.1rem 0; }
  .report-toc a:hover { opacity: 1; text-decoration: underline; color: var(--vscode-textLink-foreground); }
  .report-content { flex: 1 1 auto; min-width: 0; }
  .report-content h2, .report-content h3 { scroll-margin-top: 0.75rem; }
  @media (max-width: 500px) {
    .report-layout { display: block; }
    .report-toc { position: static; max-height: none; flex: none; padding: 0 0 1rem; margin-bottom: 1rem; border-bottom: 1px solid var(--vscode-panel-border); }
  }`;
