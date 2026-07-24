import * as vscode from 'vscode';
import type { WorkspaceAnalysis } from '../types/Workspace';
import {
  renderWorkspaceReportHtml,
  workspaceReportTitle,
  type WorkspaceReportScope,
} from './renderWorkspaceReport';
import { readConfig } from '../config';
import { formatTimestamp } from './formatTimestamp';

/** Manages the single read-only Workspace Skill Report webview panel. */
export class WorkspaceReportPanel {
  private static current: WorkspaceReportPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposed = false;

  private constructor() {
    this.panel = vscode.window.createWebviewPanel(
      'skillMdInspector.workspaceReport',
      'Workspace SKILL.md Report',
      vscode.ViewColumn.Active,
      { enableScripts: false, retainContextWhenHidden: true },
    );
    this.panel.onDidDispose(() => {
      this.disposed = true;
      if (WorkspaceReportPanel.current === this) {
        WorkspaceReportPanel.current = undefined;
      }
    });
  }

  static show(analysis: WorkspaceAnalysis, scope: WorkspaceReportScope): void {
    if (!WorkspaceReportPanel.current || WorkspaceReportPanel.current.disposed) {
      WorkspaceReportPanel.current = new WorkspaceReportPanel();
    }
    WorkspaceReportPanel.current.render(analysis, scope);
    WorkspaceReportPanel.current.panel.reveal();
  }

  private render(analysis: WorkspaceAnalysis, scope: WorkspaceReportScope): void {
    const nonce = createNonce();
    this.panel.title = workspaceReportTitle(scope);
    this.panel.webview.html = renderWorkspaceReportHtml(analysis, {
      nonce,
      cspSource: this.panel.webview.cspSource,
      scope,
      generatedAt: formatTimestamp(new Date(), readConfig().timeFormat),
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
