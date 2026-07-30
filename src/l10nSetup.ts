// Feeds the translation bundle VS Code selected for the current display
// language into @vscode/l10n, which every module uses for l10n.t(). Must be
// the first import of extension.ts so the bundle is configured before any
// other module body runs. When no bundle is active (English, or tests outside
// VS Code), @vscode/l10n stays unconfigured and t() returns its input.
import * as vscode from 'vscode';
import * as l10n from '@vscode/l10n';

if (vscode.l10n.bundle) {
  l10n.config({ contents: vscode.l10n.bundle });
}
