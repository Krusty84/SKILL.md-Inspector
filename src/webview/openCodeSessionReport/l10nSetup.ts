// Configures @vscode/l10n inside the browser bundle from the inert JSON data
// block the extension host embeds in the webview HTML (see
// openCodeSessionReportWebview.html()). Must be the first import of the
// webview's index.ts so the bundle is configured before any module-level UI
// code runs. The data block precedes the script tag in the document, so it is
// always parsed by the time this executes. An empty bundle (English) leaves
// l10n unconfigured and t() returns its input.
import * as l10n from '@vscode/l10n';

const raw = document.getElementById('skill-md-l10n')?.textContent;
if (raw) {
  try {
    const contents = JSON.parse(raw) as Record<string, string>;
    if (Object.keys(contents).length > 0) {
      l10n.config({ contents });
    }
  } catch {
    // A malformed bundle must never break the report; English is the fallback.
  }
}
