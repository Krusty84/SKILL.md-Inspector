import type {
  OpenCodeTimelineEvent,
  OpenCodeTimelineEventDetails,
  OpenCodeTimelineFilter,
  OpenCodeTimelineViewModel,
  ReportExtensionToWebviewMessage,
  ReportWebviewToExtensionMessage,
} from './model';
import {
  collapseVisibleTimelineEvents,
  createInitialTimelineState,
  expandVisibleTimelineEvents,
  setTimelineFilter,
  setTimelineSearchQuery,
  toggleTimelineEvent,
  visibleTimelineEvents,
  type OpenCodeTimelineState,
} from './state';
import { ensureEventDetailsRequested, renderDetailsInto } from './detailsRenderer';
import { eventTogglePresentation } from './eventTogglePresentation';
import './styles.css';

declare const acquireVsCodeApi: () => {
  postMessage(message: ReportWebviewToExtensionMessage): void;
};
const vscode = acquireVsCodeApi();
let model: OpenCodeTimelineViewModel | undefined;
let state: OpenCodeTimelineState | undefined;
const details = new Map<string, OpenCodeTimelineEventDetails>();
const requested = new Set<string>();
let searchTimer: number | undefined;
const tooltipId = 'report-tooltip';
const tooltips: Record<string, string> = {
  all: 'Show all session events',
  tools: 'Show all tool calls, including skill calls',
  skills: 'Show skill calls only',
  reasoning: 'Show reasoning events only',
  errors: 'Show failed tools, failed skills, and assistant errors',
  diffs: 'Show patch and diff events',
  text: 'Show user and assistant text events',
  subtasks: 'Show subtask and agent events',
  'expand-all': 'Expand all visible events',
  'collapse-all': 'Collapse all visible events',
  raw: 'Open the current session JSON',
  search: 'Search session events',
};
export const filterOrder: OpenCodeTimelineFilter[] = [
  'all',
  'tools',
  'skills',
  'reasoning',
  'errors',
  'diffs',
  'text',
  'subtasks',
];
window.addEventListener('message', (event: MessageEvent<ReportExtensionToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'initialize') {
    model = message.model;
    state = createInitialTimelineState(model);
    details.clear();
    requested.clear();
    render();
  } else if (message.type === 'eventDetails') {
    details.set(message.eventId, message.details);
    renderMountedDetails(message.eventId);
  } else if (message.type === 'eventDetailsError') {
    details.set(message.eventId, { error: message.message });
    renderMountedDetails(message.eventId);
  }
});
vscode.postMessage({ type: 'ready' });

document.addEventListener('click', (event) => {
  const target = event.target as HTMLElement | null;
  const action = target?.closest<HTMLElement>('[data-action]');
  if (!action || !model || !state) return;
  const type = action.dataset.action;
  if (type === 'filter') {
    state = setTimelineFilter(state, action.dataset.filter as OpenCodeTimelineFilter);
    renderTimeline();
    renderToolbar();
  } else if (type === 'expand-all') {
    state = expandVisibleTimelineEvents(state, model.events);
    renderTimeline();
  } else if (type === 'collapse-all') {
    state = collapseVisibleTimelineEvents(state, model.events);
    renderTimeline();
  } else if (type === 'toggle-event') {
    toggle(action.dataset.eventId, { restoreFocus: true });
  } else if (type === 'session-details') {
    state = { ...state, sessionDetailsExpanded: !state.sessionDetailsExpanded };
    renderSessionDetails();
    renderSessionChevron();
    action.focus();
  } else if (type === 'copy' && action.dataset.value)
    vscode.postMessage({ type: 'copyText', value: action.dataset.value });
  else if (type === 'raw') vscode.postMessage({ type: 'openRawSession' });
});
document.addEventListener('mouseover', (event) =>
  showTooltip((event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]')),
);
document.addEventListener('focusin', (event) =>
  showTooltip((event.target as HTMLElement | null)?.closest<HTMLElement>('[data-tooltip]')),
);
document.addEventListener('mouseout', (event) => {
  if ((event.target as HTMLElement | null)?.closest('[data-tooltip]')) hideTooltip();
});
document.addEventListener('focusout', (event) => {
  if ((event.target as HTMLElement | null)?.closest('[data-tooltip]')) hideTooltip();
});
document.addEventListener('keydown', (event) => {
  if (!model || !state) return;
  const target = event.target as HTMLElement | null;
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') {
    event.preventDefault();
    qs<HTMLInputElement>('#search')?.focus();
    return;
  }
  if (event.key === 'Escape') {
    hideTooltip();
    const search = qs<HTMLInputElement>('#search');
    if (search?.value) {
      search.value = '';
      state = setTimelineSearchQuery(state, '');
      renderTimeline();
      renderToolbar();
    } else if (state.focusedEventId && state.expandedEventIds.has(state.focusedEventId)) {
      toggle(state.focusedEventId, { restoreFocus: true });
    }
  }
  if (!target?.classList.contains('event-toggle')) return;
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    moveFocus(target.dataset.eventId, event.key === 'ArrowDown' ? 1 : -1);
  }
});

function render(): void {
  if (!model || !state) return;
  document.body.textContent = '';
  const root = el('div', 'report-shell');
  const chrome = el('header', 'report-chrome');
  chrome.append(header(), sessionDetails(), toolbar());
  root.append(chrome, timelineShell(), tooltipHost());
  document.body.append(root);
  renderTimeline();
  renderSessionChevron();
}
function header(): HTMLElement {
  const h = el('section', 'session-summary');
  const left = el('div', 'summary-copy');
  const title = el('div', 'summary-title');
  const chevron = button('', 'session-details');
  chevron.className = 'session-chevron';
  chevron.id = 'session-details-toggle';
  chevron.setAttribute('aria-controls', 'session-details');
  title.append(chevron, textEl('h1', model!.session.title), diagnosticsBadge());
  left.append(
    title,
    textEl(
      'p',
      [
        model!.session.id,
        model!.session.agent && `agent ${model!.session.agent}`,
        [model!.session.provider, model!.session.model].filter(Boolean).join('/'),
        model!.session.version && `OpenCode v${model!.session.version}`,
      ]
        .filter(Boolean)
        .join(' · '),
    ),
    textEl('p', dateRange()),
  );
  const right = el('div', 'metrics');
  const m = model!.metrics;
  [
    ['Cost', money(m.totalCost)],
    [
      'Tokens',
      compact(m.totalTokens) +
        (m.cachedShare !== undefined ? ` · ${Math.round(m.cachedShare * 100)}% cached` : ''),
    ],
    ['Duration', duration(m.durationMs)],
    ['Diff', diffMetric()],
    ['Files', m.filesChanged === undefined ? '—' : `${m.filesChanged} files`],
    ['Errors', `${m.errorCount} errors · ${m.retryCount} retries`],
  ].forEach(([k, v]) => {
    const item = el('div', 'metric');
    item.append(textEl('b', v || '—'), textEl('span', k));
    right.append(item);
  });
  h.append(left, right);
  return h;
}
function toolbar(): HTMLElement {
  const bar = el('section', 'toolbar');
  bar.setAttribute('role', 'toolbar');
  bar.id = 'toolbar';
  return bar;
}
function renderToolbar(): void {
  if (!model || !state) return;
  const bar = qs('#toolbar');
  if (!bar) return;
  bar.textContent = '';
  const label: Record<OpenCodeTimelineFilter, string> = {
    all: 'All',
    tools: 'Tools',
    skills: 'Skills',
    reasoning: 'Reasoning',
    errors: 'Errors',
    diffs: 'Diffs',
    text: 'Text',
    subtasks: 'Subtasks',
  };
  const chips = el('div', 'chips');
  for (const f of filterOrder) {
    const b = button(`${label[f]} ${model.filters[f]}`, 'filter', tooltips[f]);
    b.dataset.filter = f;
    b.setAttribute('aria-current', state.activeFilter === f ? 'true' : 'false');
    chips.append(b);
  }
  const actions = el('div', 'actions');
  const search = document.createElement('input');
  search.id = 'search';
  search.type = 'search';
  search.placeholder = 'Search session…';
  search.value = state.query;
  search.setAttribute('aria-label', 'Search session events');
  attachTooltip(search, tooltips.search);
  search.addEventListener('input', () => {
    window.clearTimeout(searchTimer);
    searchTimer = window.setTimeout(() => {
      state = setTimelineSearchQuery(state!, search.value);
      renderTimeline();
      renderToolbar();
    }, 150);
  });
  actions.append(
    search,
    textEl('span', 'Matches ' + visibleTimelineEvents(model.events, state).length),
    button('Expand all', 'expand-all', tooltips['expand-all']),
    button('Collapse all', 'collapse-all', tooltips['collapse-all']),
    button('Raw JSON', 'raw', tooltips.raw),
  );
  bar.append(chips, actions);
}
function sessionDetails(): HTMLElement {
  const s = el('section', 'session-details');
  s.id = 'session-details';
  return s;
}
function renderSessionDetails(): void {
  if (!model || !state) return;
  const s = qs('#session-details');
  if (!s) return;
  s.textContent = '';
  s.hidden = !state.sessionDetailsExpanded;
  if (s.hidden) return;
  s.append(
    textEl('h2', 'Session details'),
    textEl(
      'p',
      `Pinned reference: OpenCode source commit ${model.diagnosticsSummary.reconstructedSchema}. Schema status: reconstructed compatibility reference.`,
    ),
    table([...model.details.metadata, ...model.details.changeSummary]),
    textEl('h3', 'Compatibility diagnostics'),
    table(
      model.diagnosticsSummary.diagnostics.map((d) => [
        d.severity,
        `${d.code} ${d.path ?? ''} ${d.message}`,
      ]),
    ),
    textEl('h3', 'Loaded skills'),
    textEl('p', model.details.temporalWarning),
    table(
      model.details.skills.map((sk) => [
        sk.skillName ?? 'Unknown',
        `${sk.status}; ${sk.followingActions} following actions; matching ${sk.matchingStatus}; ${sk.actionSummary}`,
      ]),
    ),
  );
}
function timelineShell(): HTMLElement {
  const wrap = el('main', 'timeline-scroll-region');
  wrap.append(rowHead(), Object.assign(el('div', 'timeline-events'), { id: 'timeline' }));
  return wrap;
}
function rowHead(): HTMLElement {
  const r = el('div', 'timeline-row timeline-head timeline-columns-header');
  r.append(
    textEl('div', 'T+'),
    el('div', 'rail'),
    textEl('div', 'EVENT'),
    textEl('div', 'LATENCY · TOKENS · COST'),
  );
  return r;
}
function renderTimeline(): void {
  renderToolbar();
  renderSessionDetails();
  const t = qs('#timeline');
  if (!t || !model || !state) return;
  t.textContent = '';
  t.setAttribute('role', 'list');
  const events = visibleTimelineEvents(model.events, state);
  const frag = document.createDocumentFragment();
  const limit = model.large ? 200 : events.length;
  for (const event of events.slice(0, limit)) frag.append(eventRow(event));
  if (events.length > limit)
    frag.append(
      textEl(
        'p',
        `Rendering first ${limit} of ${events.length} matching events. Refine filters or search for faster inspection.`,
      ),
    );
  t.append(frag);
}
function eventRow(event: OpenCodeTimelineEvent): HTMLElement {
  const row = el('article', `timeline-row event event-${event.category} kind-${event.kind}`);
  row.id = `row-${event.id}`;
  row.setAttribute('role', 'listitem');
  row.style.setProperty('--latency', String(event.latencyRatio ?? 0));
  const expanded = state!.expandedEventIds.has(event.id);
  const time = textEl(
    'div',
    'elapsed',
    event.elapsedMs === undefined ? '—' : elapsed(event.elapsedMs),
  );
  const rail = textEl('div', 'rail', marker(event));
  const body = el('div', 'event-body');
  const head = el('div', 'event-head');
  const content = el('div', 'event-head-content');
  const title = el('div', 'title');
  title.append(textEl('span', 'badge', badge(event)), highlight(event.label, state!.query));
  if (event.secondaryLabel) title.append(textEl('small', event.secondaryLabel));
  content.append(title);
  if (event.preview) content.append(highlight(event.preview, state!.query, 'preview'));
  head.append(content);
  if (event.expandable) head.append(eventToggle(event, expanded));
  body.append(head);
  for (const file of event.fileReferences)
    body.append(textEl('span', 'file-chip', file.path ?? file.label));
  const detail = el('div', 'details');
  detail.id = `details-${event.id}`;
  detail.hidden = !expanded;
  body.append(detail);
  const side = el('div', 'side');
  side.append(
    latencyBar(event),
    textEl(
      'span',
      [duration(event.durationMs), compact(event.tokens?.total), money(event.cost)]
        .filter((v) => v && v !== '—')
        .join(' · '),
    ),
  );
  row.append(time, rail, body, side);
  if (expanded) {
    renderDetailsInto(detail, event.id, details);
    ensureEventDetailsRequested(event.id, details, requested, (eventId) =>
      vscode.postMessage({ type: 'requestEventDetails', eventId }),
    );
  }
  return row;
}
function renderEvent(id?: string): void {
  if (!id || !model || !state) return;
  const event = model.events.find((e) => e.id === id);
  const old = qs(`#row-${cssEscape(id)}`);
  if (event && old) old.replaceWith(eventRow(event));
}
function renderMountedDetails(id: string): void {
  const box = qs(`#details-${cssEscape(id)}`);
  if (box) renderDetailsInto(box, id, details);
}
function toggle(id?: string, options?: { restoreFocus?: boolean }): void {
  if (!id || !model || !state) return;
  const event = model.events.find((e) => e.id === id);
  if (!event?.expandable) return;
  state = toggleTimelineEvent(state, id);
  state.focusedEventId = id;
  renderEvent(id);
  if (options?.restoreFocus)
    qs<HTMLButtonElement>(`#row-${cssEscape(id)} .event-toggle`)?.focus({ preventScroll: true });
}
function moveFocus(id: string | undefined, delta: number): void {
  const toggles = Array.from(document.querySelectorAll<HTMLButtonElement>('.event-toggle'));
  const index = toggles.findIndex((h) => h.dataset.eventId === id);
  const base = index < 0 ? 0 : index;
  toggles[Math.max(0, Math.min(toggles.length - 1, base + delta))]?.focus();
}
function eventToggle(event: OpenCodeTimelineEvent, expanded: boolean): HTMLButtonElement {
  const presentation = eventTogglePresentation(expanded, badge(event));
  const b = button('', 'toggle-event', presentation.tooltip);
  b.className = 'event-toggle';
  b.dataset.eventId = event.id;
  b.setAttribute('aria-controls', `details-${event.id}`);
  b.setAttribute('aria-expanded', String(presentation.expanded));
  b.setAttribute('aria-label', presentation.ariaLabel);
  b.addEventListener('focus', () => {
    if (state) state.focusedEventId = event.id;
  });
  const icon = textEl('span', 'event-toggle-icon', '›');
  icon.setAttribute('aria-hidden', 'true');
  b.append(icon);
  return b;
}
function highlight(value: string, query: string, className?: string): HTMLElement {
  const wrap = el('span', className);
  const q = query.trim().toLowerCase();
  if (!q) {
    wrap.textContent = value;
    return wrap;
  }
  let pos = 0;
  const lower = value.toLowerCase();
  while (true) {
    const idx = lower.indexOf(q, pos);
    if (idx < 0) break;
    wrap.append(document.createTextNode(value.slice(pos, idx)));
    const mark = document.createElement('mark');
    mark.textContent = value.slice(idx, idx + q.length);
    wrap.append(mark);
    pos = idx + q.length;
  }
  wrap.append(document.createTextNode(value.slice(pos)));
  return wrap;
}
function latencyBar(event: OpenCodeTimelineEvent): HTMLElement {
  const b = el('div', 'latency');
  b.hidden = event.latencyRatio === undefined;
  return b;
}
function table(rows: [string, string][]): HTMLElement {
  const t = el('table');
  const body = document.createElement('tbody');
  for (const [k, v] of rows) {
    const tr = document.createElement('tr');
    tr.append(textEl('th', k), textEl('td', v));
    body.append(tr);
  }
  t.append(body);
  return t;
}
function button(label: string, action: string, tooltip?: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.type = 'button';
  b.textContent = label;
  b.dataset.action = action;
  if (tooltip) attachTooltip(b, tooltip);
  return b;
}
function diagnosticsBadge(): HTMLElement {
  const values = [
    model!.diagnosticsSummary.error ? `${model!.diagnosticsSummary.error} errors` : '',
    model!.diagnosticsSummary.warning ? `${model!.diagnosticsSummary.warning} warnings` : '',
  ].filter(Boolean);
  const badge = textEl('span', 'diagnostics-badge', values.join(' · '));
  badge.hidden = !values.length;
  return badge;
}
function renderSessionChevron(): void {
  const b = qs<HTMLButtonElement>('#session-details-toggle');
  if (!b || !state) return;
  const tip = state.sessionDetailsExpanded ? 'Hide session details' : 'Show session details';
  b.textContent = state.sessionDetailsExpanded ? '⌄' : '›';
  b.setAttribute('aria-label', tip);
  b.setAttribute('aria-expanded', String(state.sessionDetailsExpanded));
  attachTooltip(b, tip);
}
function tooltipHost(): HTMLElement {
  const node = el('div', 'report-tooltip');
  node.id = tooltipId;
  node.setAttribute('role', 'tooltip');
  node.hidden = true;
  return node;
}
function attachTooltip(node: HTMLElement, text: string): void {
  node.dataset.tooltip = text;
  node.setAttribute('title', text);
  node.setAttribute('aria-describedby', tooltipId);
}
function showTooltip(target: HTMLElement | null | undefined): void {
  const host = qs(`#${tooltipId}`);
  const text = target?.dataset.tooltip;
  if (!host || !target || !text) return;
  host.textContent = text;
  host.hidden = false;
  const rect = target.getBoundingClientRect();
  const own = host.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(window.innerWidth - own.width - 8, rect.left + rect.width / 2 - own.width / 2),
  );
  const top =
    rect.bottom + own.height + 12 > window.innerHeight
      ? rect.top - own.height - 8
      : rect.bottom + 8;
  host.style.left = `${left}px`;
  host.style.top = `${Math.max(8, top)}px`;
}
function hideTooltip(): void {
  const host = qs(`#${tooltipId}`);
  if (host) host.hidden = true;
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
function qs<T extends Element = HTMLElement>(selector: string): T | null {
  return document.querySelector<T>(selector);
}
function cssEscape(v: string): string {
  return CSS.escape(v);
}
function dateRange(): string {
  const s = model!.session;
  return [
    s.created ? new Date(s.created).toLocaleString() : undefined,
    s.updated ? new Date(s.updated).toLocaleString() : undefined,
  ]
    .filter(Boolean)
    .join(' – ');
}
function money(v?: number): string {
  return typeof v === 'number' && Number.isFinite(v) ? `$${v.toFixed(4)}` : '—';
}
function compact(v?: number): string {
  if (v === undefined || !Number.isFinite(v)) return '—';
  return Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}
function duration(v?: number): string {
  if (v === undefined || !Number.isFinite(v) || v < 0) return '—';
  const s = Math.round(v / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return h ? `${h}h ${m}m ${sec}s` : m ? `${m}m ${sec}s` : `${sec}s`;
}
function elapsed(v: number): string {
  const s = Math.floor(v / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`;
}
function diffMetric(): string {
  const m = model!.metrics;
  return m.additions === undefined && m.deletions === undefined
    ? '—'
    : `+${m.additions ?? 0} −${m.deletions ?? 0}`;
}
function badge(e: OpenCodeTimelineEvent): string {
  return e.kind.replace('-', ' ').toUpperCase();
}
function marker(e: OpenCodeTimelineEvent): string {
  if (e.category === 'error') return '✕';
  if (e.kind === 'retry') return '↻';
  if (e.kind === 'patch') return '≋';
  if (e.category === 'subtask') return '↳';
  if (e.kind === 'reasoning') return '◇';
  if (e.category === 'tool') return '✓';
  if (e.kind === 'assistant-message') return '◂';
  if (e.kind === 'user-message') return '▸';
  if (e.kind === 'compaction') return '─';
  return '•';
}
