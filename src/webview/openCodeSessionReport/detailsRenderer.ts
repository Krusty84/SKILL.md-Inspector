import * as l10n from '@vscode/l10n';
import type { OpenCodeTimelineEventDetails, ReportWebviewToExtensionMessage } from './model';

type DetailRequestSender = (eventId: string) => void;

export function renderDetailsInto(
  container: HTMLElement,
  eventId: string,
  details: ReadonlyMap<string, OpenCodeTimelineEventDetails>,
): void {
  container.textContent = '';
  const detail = details.get(eventId);
  if (!detail) {
    container.append(textEl('p', l10n.t('Loading details…')));
    return;
  }
  for (const [label, value, copyable] of [
    [l10n.t('INPUT'), detail.input, true],
    [l10n.t('OUTPUT'), detail.output, false],
    [l10n.t('ERROR'), detail.error, false],
    [l10n.t('METADATA'), detail.metadata, false],
    [l10n.t('ATTACHMENTS'), detail.attachments, false],
    [l10n.t('PATCH'), detail.patch, false],
    [l10n.t('RAW'), detail.raw, false],
  ] as const)
    if (value) {
      const h = el('div', 'detail-label');
      h.append(textEl('b', label));
      if (copyable) {
        const copy = button(l10n.t('Copy JSON'), 'copy');
        copy.dataset.value = value;
        h.append(copy);
      }
      container.append(h, textEl('pre', value));
    }
  if (detail.temporalWarning) container.append(textEl('p', 'warning', detail.temporalWarning));
}

export function ensureEventDetailsRequested(
  eventId: string,
  details: ReadonlyMap<string, OpenCodeTimelineEventDetails>,
  requested: Set<string>,
  sendRequest: DetailRequestSender,
): void {
  if (details.has(eventId) || requested.has(eventId)) return;
  requested.add(eventId);
  sendRequest(eventId);
}

function button(
  label: string,
  action: ReportWebviewToExtensionMessage['type'] | string,
): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.action = action;
  return b;
}
function textEl<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  valueOrClass?: string,
  value?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (value === undefined) node.textContent = valueOrClass ?? '';
  else {
    node.className = valueOrClass ?? '';
    node.textContent = value;
  }
  return node;
}
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  return node;
}
