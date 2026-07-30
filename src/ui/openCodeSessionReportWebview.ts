import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import {
  buildOpenCodeTimelineEventDetails,
  buildOpenCodeTimelineViewModel,
} from '../opencode/timelineViewModel';
import type { NormalizedOpenCodeSession } from '../opencode/model';
import type { ReportWebviewToExtensionMessage } from '../webview/openCodeSessionReport/model';

export class OpenCodeSessionReportPanel {
  private static current: OpenCodeSessionReportPanel | undefined;
  private session: NormalizedOpenCodeSession | undefined;
  private rawSessionUri: vscode.Uri | undefined;
  private validEventIds = new Set<string>();
  private ready = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly extensionUri: vscode.Uri,
  ) {
    panel.webview.onDidReceiveMessage((message: unknown) => void this.handleMessage(message));
    panel.onDidDispose(() => {
      if (OpenCodeSessionReportPanel.current === this)
        OpenCodeSessionReportPanel.current = undefined;
    });
  }

  static show(
    session: NormalizedOpenCodeSession,
    rawSessionUri?: vscode.Uri,
    extensionUri?: vscode.Uri,
  ): void {
    const roots = extensionUri ? [vscode.Uri.joinPath(extensionUri, 'dist', 'webview')] : [];
    if (!this.current) {
      const ext = extensionUri ?? vscode.Uri.file(process.cwd());
      this.current = new OpenCodeSessionReportPanel(
        vscode.window.createWebviewPanel(
          'skillMdInspector.openCodeReport',
          l10n.t('OpenCode Session Report'),
          vscode.ViewColumn.Beside,
          {
            enableScripts: true,
            retainContextWhenHidden: true,
            localResourceRoots: roots.length
              ? roots
              : [vscode.Uri.joinPath(ext, 'dist', 'webview')],
          },
        ),
        ext,
      );
      this.current.panel.webview.html = this.current.html();
    }
    this.current.replace(session, rawSessionUri);
    this.current.panel.reveal(vscode.ViewColumn.Beside);
  }

  private replace(session: NormalizedOpenCodeSession, rawSessionUri?: vscode.Uri): void {
    this.session = session;
    this.rawSessionUri = rawSessionUri;
    const model = buildOpenCodeTimelineViewModel(session);
    this.validEventIds = new Set(model.events.map((event) => event.id));
    this.postInitialize(model);
  }

  private postInitialize(
    model = this.session && buildOpenCodeTimelineViewModel(this.session),
  ): void {
    if (!model) return;
    void this.panel.webview.postMessage({ type: 'initialize', model });
  }

  private async handleMessage(message: unknown): Promise<void> {
    if (!isMessage(message)) return;
    if (message.type === 'ready') {
      this.ready = true;
      this.postInitialize();
      return;
    }
    if (!this.ready) return;
    if (message.type === 'requestEventDetails') {
      if (!this.session || !this.validEventIds.has(message.eventId)) {
        void this.panel.webview.postMessage({
          type: 'eventDetailsError',
          eventId: message.eventId,
          message: l10n.t('Unknown event for current session.'),
        });
        return;
      }
      const hardLimit = vscode.workspace
        .getConfiguration('skillMdInspector')
        .get<number>('openCode.maxPreviewCharacters', 20000);
      const details = buildOpenCodeTimelineEventDetails(this.session, message.eventId, hardLimit);
      void this.panel.webview.postMessage(
        details
          ? { type: 'eventDetails', eventId: message.eventId, details }
          : {
              type: 'eventDetailsError',
              eventId: message.eventId,
              message: l10n.t('No details are available for this event.'),
            },
      );
    } else if (message.type === 'copyText') {
      if (
        typeof message.value === 'string' &&
        message.value.length <=
          vscode.workspace
            .getConfiguration('skillMdInspector')
            .get<number>('openCode.maxPreviewCharacters', 20000) +
            200
      )
        await vscode.env.clipboard.writeText(message.value);
    } else if (message.type === 'openRawSession') {
      if (this.rawSessionUri)
        await vscode.commands.executeCommand('vscode.open', this.rawSessionUri);
    } else if (message.type === 'openKnownFile' || message.type === 'openChildSession') {
      // Reserved for validated workspace/child-session navigation. Unknown webview-provided IDs are ignored by design.
    }
  }

  private html(): string {
    const script = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'openCodeSessionReport.js'),
    );
    const style = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'dist', 'webview', 'openCodeSessionReport.css'),
    );
    const scriptNonce = createNonce();
    const csp = `default-src 'none'; img-src ${this.panel.webview.cspSource} data:; style-src ${this.panel.webview.cspSource}; script-src 'nonce-${scriptNonce}'; font-src ${this.panel.webview.cspSource};`;
    // The active l10n bundle travels to the browser bundle as an inert JSON
    // data block (type="application/json" is never executed, so the strict CSP
    // stays unchanged); the webview's l10nSetup reads it before any UI renders.
    // \u003c-escaping keeps a literal "</script" in a translation from
    // terminating the block.
    const bundleJson = JSON.stringify(vscode.l10n.bundle ?? {}).replace(/</g, '\\u003c');
    return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${csp}"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${style}"><title>${escapeHtml(l10n.t('OpenCode Session Report'))}</title></head><body><p>${escapeHtml(l10n.t('Loading OpenCode session timeline…'))}</p><script type="application/json" id="skill-md-l10n">${bundleJson}</script><script nonce="${scriptNonce}" src="${script}"></script></body></html>`;
  }
}

function isMessage(value: unknown): value is ReportWebviewToExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as {
    type?: unknown;
    eventId?: unknown;
    value?: unknown;
    fileIndex?: unknown;
  };
  if (message.type === 'ready' || message.type === 'openRawSession') return true;
  if (message.type === 'requestEventDetails' || message.type === 'openChildSession')
    return typeof message.eventId === 'string' && message.eventId.length < 500;
  if (message.type === 'copyText') return typeof message.value === 'string';
  if (message.type === 'openKnownFile')
    return (
      typeof message.eventId === 'string' &&
      Number.isInteger(message.fileIndex) &&
      (message.fileIndex as number) >= 0
    );
  return false;
}
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
function createNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let value = '';
  for (let i = 0; i < 32; i += 1) value += chars[Math.floor(Math.random() * chars.length)];
  return value;
}
