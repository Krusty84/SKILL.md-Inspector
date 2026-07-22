import * as vscode from 'vscode';
import type { SkillReport } from './reportModel';
import { renderReportHtml } from './renderReport';

/** Manages the single read-only Skill Report webview panel. */
export class SkillReportPanel {
  private static current: SkillReportPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'skillMdInspector.report',
      'Skill Report',
      vscode.ViewColumn.Beside,
      { enableScripts: false, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => {
      this.disposed = true;
      if (SkillReportPanel.current === this) {
        SkillReportPanel.current = undefined;
      }
    });
  }

  static show(report: SkillReport): void {
    if (!SkillReportPanel.current || SkillReportPanel.current.disposed) {
      SkillReportPanel.current = new SkillReportPanel();
    }
    SkillReportPanel.current.render(report);
    SkillReportPanel.current.panel.reveal(vscode.ViewColumn.Beside);
  }

  private render(report: SkillReport): void {
    const nonce = createNonce();
    this.panel.webview.html = renderReportHtml(report, {
      nonce,
      cspSource: this.panel.webview.cspSource,
      generatedAt: new Date().toLocaleString(),
    });
  }
}

function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let nonce = '';
  for (let i = 0; i < 32; i++) {
    nonce += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return nonce;
}
