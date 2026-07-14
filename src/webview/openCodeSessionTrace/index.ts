import cytoscape from 'cytoscape';
import elk from 'cytoscape-elk';
import type { NodeDetailsViewModel, TraceGraphDirection, TraceGraphMode, TraceGraphNode, TraceGraphViewModel } from '../../opencode/model';
import { buildVisibleTraceGraph, expandedCollapsedIdsForMode, relevantPathNodeIds, searchTraceGraph } from '../../opencode/traceGraphState';
import type { ExtensionToWebviewMessage, WebviewToExtensionMessage } from './model';
import './styles.css';

declare function acquireVsCodeApi(): { postMessage(message: WebviewToExtensionMessage): void };

cytoscape.use(elk);
const vscode = acquireVsCodeApi();
let model: TraceGraphViewModel | undefined;
let cy: cytoscape.Core | undefined;
let mode: TraceGraphMode = 'overview';
let direction: TraceGraphDirection = 'left-to-right';
let collapsed = new Set<string>();
let selectedId: string | undefined;
let searchMatches: string[] = [];
let activeMatch = -1;
let isolation: Set<string> | undefined;
let layoutGeneration = 0;
let minimapFrame = 0;
let semanticTimer: number | undefined;

window.addEventListener('message', (event: MessageEvent<ExtensionToWebviewMessage>) => {
  const message = event.data;
  if (message.type === 'initialize') initialize(message.model);
  else if (message.type === 'nodeDetails' && message.nodeId === selectedId) renderDetails(message.details);
  else if (message.type === 'showError') showStatus(message.message, true);
});

function initialize(next: TraceGraphViewModel): void {
  cy?.destroy();
  model = next;
  mode = next.initialState.mode;
  direction = next.initialState.direction;
  collapsed = new Set(next.initialState.collapsedNodeIds);
  selectedId = undefined;
  searchMatches = [];
  activeMatch = -1;
  isolation = undefined;
  layoutGeneration += 1;
  document.body.textContent = '';
  buildShell();
  renderGraph();
}

function buildShell(): void {
  if (!model) return;
  const header = element('header', 'app-header');
  const heading = element('div', 'heading');
  heading.append(element('h1', undefined, model.session.title));
  const summary = element('div', 'summary');
  [
    `OpenCode ${model.session.version ?? 'unknown'}`,
    `${model.session.provider ?? 'provider'} / ${model.session.model ?? 'model'}`,
    `${model.metrics.toolCallCount} tools`,
    `${model.metrics.skillCallCount} skills`,
    `${model.metrics.toolErrorCount} errors`,
    model.large ? 'Large session' : undefined,
    model.session.sanitization,
  ].filter((value): value is string => !!value).forEach((value) => summary.append(element('span', undefined, value)));
  heading.append(summary);
  header.append(heading);

  const search = element('div', 'search-controls');
  const searchInput = element('input') as HTMLInputElement;
  searchInput.type = 'search';
  searchInput.placeholder = 'Search graph';
  searchInput.setAttribute('aria-label', 'Search graph nodes');
  searchInput.addEventListener('input', debounce(() => updateSearch(searchInput.value), 200));
  const previous = button('↑', 'Previous search match', () => moveSearch(-1));
  const next = button('↓', 'Next search match', () => moveSearch(1));
  const count = element('span', 'match-count', '0 matches');
  count.id = 'match-count';
  search.append(searchInput, previous, next, count);
  header.append(search);
  document.body.append(header);

  const toolbar = element('nav', 'toolbar');
  toolbar.setAttribute('aria-label', 'Graph controls');
  const modes = element('div', 'control-group modes');
  for (const value of ['overview', 'skills', 'errors', 'full'] as TraceGraphMode[]) {
    const control = button(capitalize(value), `${capitalize(value)} mode`, () => setMode(value));
    control.dataset.mode = value;
    control.setAttribute('aria-pressed', String(value === mode));
    modes.append(control);
  }
  const layoutControls = element('div', 'control-group');
  const layoutLabel = element('label', undefined, 'Layout');
  const layoutSelect = element('select') as HTMLSelectElement;
  layoutSelect.setAttribute('aria-label', 'Graph layout direction');
  option(layoutSelect, 'left-to-right', 'Left to Right');
  option(layoutSelect, 'top-to-bottom', 'Top to Bottom');
  layoutSelect.value = direction;
  layoutSelect.addEventListener('change', () => { direction = layoutSelect.value as TraceGraphDirection; runLayout(); });
  layoutLabel.append(layoutSelect);
  layoutControls.append(layoutLabel);
  const viewport = element('div', 'control-group');
  viewport.append(
    button('Fit', 'Fit graph (F)', fitGraph),
    button('+', 'Zoom in', () => zoomBy(1.2)),
    button('−', 'Zoom out', () => zoomBy(0.8)),
    button('Reset', 'Reset zoom (0)', resetViewport),
    button('Center', 'Center selected node', centerSelected),
  );
  const collapseControls = element('div', 'control-group');
  collapseControls.append(
    button('Toggle group', 'Collapse or expand selected message or step', toggleSelectedCollapse),
    button('Collapse all', 'Collapse all messages and steps', collapseAll),
    button('Expand path', 'Expand path to selected or active search result', expandRelevantPath),
  );
  const pathControls = element('div', 'control-group path-controls');
  pathControls.append(
    button('Predecessors', 'Show predecessors', () => isolate('predecessors')),
    button('Successors', 'Show successors', () => isolate('successors')),
    button('Local path', 'Show local path', () => isolate('local')),
    button('Skill segment', 'Isolate skill temporal segment', () => isolate('skill')),
    button('Error path', 'Isolate error path', () => isolate('error')),
    button('Clear', 'Clear path isolation', clearIsolation),
  );
  const fallback = button('Accessible list', 'Toggle accessible graph list', toggleAccessibleList);
  fallback.setAttribute('aria-expanded', 'false');
  fallback.id = 'accessible-toggle';
  toolbar.append(modes, layoutControls, viewport, collapseControls, pathControls, fallback);
  document.body.append(toolbar);

  const notice = element('div', 'notice');
  notice.id = 'mode-notice';
  document.body.append(notice);
  updateModeNotice();

  const workspace = element('main', 'workspace');
  const graphArea = element('section', 'graph-area');
  graphArea.setAttribute('aria-label', 'Interactive directed execution graph');
  const graph = element('div', 'graph');
  graph.id = 'graph';
  graph.tabIndex = 0;
  graph.setAttribute('role', 'application');
  graph.setAttribute('aria-label', 'Execution graph. Use arrow keys to navigate nodes, Enter to select or collapse, plus and minus to zoom, 0 to reset, and F to fit.');
  graph.addEventListener('keydown', handleGraphKeydown);
  const progress = element('div', 'layout-progress', 'Laying out graph…');
  progress.id = 'layout-progress';
  progress.hidden = true;
  progress.setAttribute('role', 'status');
  const minimap = element('canvas', 'minimap') as HTMLCanvasElement;
  minimap.id = 'minimap';
  minimap.width = 220;
  minimap.height = 130;
  minimap.setAttribute('aria-label', 'Graph overview navigator');
  minimap.addEventListener('click', navigateFromMinimap);
  const tooltip = element('div', 'graph-tooltip');
  tooltip.id = 'graph-tooltip';
  tooltip.hidden = true;
  graphArea.append(graph, progress, minimap, tooltip);

  const drawer = element('aside', 'details-drawer');
  drawer.id = 'details-drawer';
  drawer.hidden = true;
  drawer.setAttribute('aria-label', 'Selected node details');
  const resizeHandle = element('div', 'drawer-resize');
  resizeHandle.setAttribute('role', 'separator');
  resizeHandle.setAttribute('aria-label', 'Resize details drawer');
  resizeHandle.addEventListener('pointerdown', startDrawerResize);
  const details = element('div', 'details-content');
  details.id = 'details-content';
  drawer.append(resizeHandle, details);
  workspace.append(graphArea, drawer);
  document.body.append(workspace);

  const list = element('section', 'accessible-list');
  list.id = 'accessible-list';
  list.hidden = true;
  list.setAttribute('aria-label', 'Accessible execution graph list');
  document.body.append(list);
  const status = element('div', 'status-message');
  status.id = 'status-message';
  status.setAttribute('role', 'status');
  document.body.append(status);
}

function renderGraph(): void {
  if (!model) return;
  let visible = buildVisibleTraceGraph(model, mode, collapsed);
  if (isolation) {
    visible = {
      nodes: visible.nodes.filter((node) => isolation!.has(node.id)),
      edges: visible.edges.filter((edge) => isolation!.has(edge.source) && isolation!.has(edge.target)),
    };
  }
  cy?.destroy();
  const container = document.getElementById('graph');
  if (!container) return;
  cy = cytoscape({
    container,
    elements: [
      ...visible.nodes.map((node) => ({ group: 'nodes' as const, data: nodeData(node) })),
      ...visible.edges.map((edge) => ({ group: 'edges' as const, data: { ...edge }, classes: edge.kind })),
    ],
    style: graphStyles(),
    minZoom: 0.08,
    maxZoom: 3.5,
    boxSelectionEnabled: false,
  });
  cy.on('tap', 'node', (event) => selectNode((event.target as cytoscape.NodeSingular).id()));
  cy.on('mouseover', 'node', (event) => showTooltip(event.target as cytoscape.NodeSingular));
  cy.on('mouseout', 'node', hideTooltip);
  cy.on('zoom', scheduleSemanticZoom);
  cy.on('render', scheduleMinimap);
  applySearchClasses();
  renderAccessibleList(visible.nodes);
  runLayout();
}

function nodeData(node: TraceGraphNode): Record<string, unknown> {
  const isCollapsed = collapsed.has(node.id);
  const aggregate = node.aggregate;
  const summary = aggregate ? [
    aggregate.tools ? `${aggregate.tools} tools` : '',
    aggregate.skills ? `${aggregate.skills} skills` : '',
    aggregate.errors ? `${aggregate.errors} errors` : '',
    aggregate.textParts ? `${aggregate.textParts} text` : '',
    aggregate.reasoningParts ? `${aggregate.reasoningParts} reasoning` : '',
  ].filter(Boolean).join(' · ') : '';
  const near = [node.label, node.status, node.durationMs === undefined ? undefined : `${node.durationMs} ms`, truncate(node.preview, 60)].filter(Boolean).join('\n');
  return { ...node, parent: node.parentId, label: isCollapsed && summary ? `${node.label}\n${summary}` : node.label, nearLabel: near, summaryLabel: summary ? `${node.label}\n${summary}` : node.label, collapsed: isCollapsed ? 'true' : 'false' };
}

function graphStyles(): cytoscape.StylesheetStyle[] {
  const theme = {
    background: css('--vscode-editorWidget-background', '#252526'),
    border: css('--vscode-panel-border', '#555'),
    foreground: css('--vscode-foreground', '#ccc'),
    description: css('--vscode-descriptionForeground', '#999'),
    focus: css('--vscode-focusBorder', '#007fd4'),
    yellow: css('--vscode-charts-yellow', '#cca700'),
    purple: css('--vscode-charts-purple', '#b267e6'),
    orange: css('--vscode-charts-orange', '#d18616'),
    warning: css('--vscode-editorWarning-foreground', '#cca700'),
    error: css('--vscode-errorForeground', '#f14c4c'),
    blue: css('--vscode-charts-blue', '#3794ff'),
    findBorder: css('--vscode-editor-findMatchBorder', '#ff8f00'),
  };
  return [
    { selector: 'node', style: { 'background-color': theme.background, 'border-color': theme.border, 'border-width': 1.5, color: theme.foreground, label: 'data(label)', 'font-family': css('--vscode-font-family', 'sans-serif'), 'font-size': '11px', 'text-wrap': 'wrap', 'text-max-width': '150px', 'text-valign': 'center', 'text-halign': 'center', width: '150px', height: '42px', padding: '8px', shape: 'round-rectangle' } },
    { selector: ':parent', style: { 'background-opacity': 0.14, 'border-width': 1.5, 'text-valign': 'top', 'text-halign': 'center', padding: '22px', 'min-width': '180px', 'min-height': '80px' } },
    { selector: 'node[kind = "session"]', style: { 'background-opacity': 0.06, 'border-style': 'dashed', padding: '34px' } },
    { selector: 'node[kind = "user-message"]', style: { 'border-color': theme.description, 'background-opacity': 0.12 } },
    { selector: 'node[kind = "assistant-message"]', style: { 'border-color': theme.focus, 'background-opacity': 0.1 } },
    { selector: 'node[kind = "step"]', style: { 'border-style': 'dotted', 'background-opacity': 0.08, padding: '18px' } },
    { selector: 'node[kind = "skill"]', style: { shape: 'hexagon', 'border-color': theme.yellow, 'border-width': 3, 'background-color': theme.background } },
    { selector: 'node[kind = "subtask"], node[kind = "agent"]', style: { shape: 'diamond', 'border-color': theme.purple } },
    { selector: 'node[kind = "retry"]', style: { shape: 'round-diamond', 'border-style': 'double', 'border-color': theme.orange } },
    { selector: 'node[kind = "compaction"]', style: { shape: 'barrel' } },
    { selector: 'node[kind = "unknown"]', style: { shape: 'tag', 'border-style': 'dashed', 'border-color': theme.warning } },
    { selector: 'node[status = "error"]', style: { 'border-color': theme.error, 'border-width': 4, shape: 'octagon' } },
    { selector: 'node[collapsed = "true"]', style: { 'border-style': 'double', 'border-width': 3, width: 190, height: 62 } },
    { selector: 'edge', style: { width: 2, 'line-color': theme.description, 'target-arrow-color': theme.description, 'target-arrow-shape': 'triangle', 'curve-style': 'bezier', opacity: 0.7 } },
    { selector: 'edge.message-transition', style: { width: 1, 'line-style': 'dotted', opacity: 0.45 } },
    { selector: 'edge.temporal-after-skill', style: { 'line-style': 'dashed', 'line-color': theme.yellow, 'target-arrow-color': theme.yellow, opacity: 0.9 } },
    { selector: 'edge.subtask', style: { 'line-color': theme.purple, 'target-arrow-color': theme.purple, 'curve-style': 'taxi' } },
    { selector: 'edge.retry', style: { 'line-color': theme.orange, 'target-arrow-color': theme.orange, 'curve-style': 'unbundled-bezier' } },
    { selector: 'edge.related-file', style: { 'line-style': 'dotted', opacity: 0.35 } },
    { selector: '.selected', style: { 'overlay-color': theme.focus, 'overlay-opacity': 0.18, 'overlay-padding': 8, 'border-color': theme.focus, 'border-width': 4 } },
    { selector: '.neighbor', style: { 'overlay-color': theme.blue, 'overlay-opacity': 0.12, 'overlay-padding': 5 } },
    { selector: '.search-match', style: { 'overlay-color': theme.findBorder, 'overlay-opacity': 0.28, 'overlay-padding': 7 } },
    { selector: '.search-active', style: { 'border-color': theme.findBorder, 'border-width': 5 } },
    { selector: '.search-dim', style: { opacity: 0.2 } },
    { selector: 'node.semantic-far', style: { label: 'data(summaryLabel)', 'font-size': 9 } },
    { selector: 'node.semantic-far:childless', style: { label: '', width: 18, height: 18 } },
    { selector: 'edge.semantic-far', style: { width: 1, opacity: 0.35 } },
    { selector: 'node.semantic-near', style: { label: 'data(nearLabel)', width: 180, height: 58, 'font-size': 11 } },
  ];
}

function runLayout(): void {
  if (!cy) return;
  const generation = ++layoutGeneration;
  const progress = document.getElementById('layout-progress');
  if (progress) progress.hidden = false;
  window.requestAnimationFrame(() => {
    if (!cy || generation !== layoutGeneration) return;
    const layout = cy.layout({
      name: 'elk',
      fit: true,
      padding: 45,
      animate: false,
      elk: {
        algorithm: 'layered',
        direction: direction === 'left-to-right' ? 'RIGHT' : 'DOWN',
        'elk.spacing.nodeNode': 32,
        'elk.layered.spacing.nodeNodeBetweenLayers': 72,
        'elk.layered.considerModelOrder.strategy': 'NODES_AND_EDGES',
      },
    } as cytoscape.LayoutOptions);
    layout.one('layoutstop', () => {
      if (generation !== layoutGeneration) return;
      if (progress) progress.hidden = true;
      scheduleSemanticZoom();
      scheduleMinimap();
      if (selectedId) centerSelected();
    });
    layout.run();
  });
}

function selectNode(id: string): void {
  if (!model || !cy?.getElementById(id).length) return;
  selectedId = id;
  cy.elements().removeClass('selected neighbor');
  const selected = cy.getElementById(id);
  selected.addClass('selected');
  selected.connectedEdges().addClass('neighbor');
  selected.neighborhood('node').addClass('neighbor');
  const drawer = document.getElementById('details-drawer');
  const content = document.getElementById('details-content');
  if (drawer) drawer.hidden = false;
  if (content) { content.textContent = ''; content.append(element('p', 'loading', 'Loading details…')); }
  vscode.postMessage({ type: 'requestNodeDetails', nodeId: id });
}

function renderDetails(details: NodeDetailsViewModel): void {
  const root = document.getElementById('details-content');
  if (!root) return;
  root.textContent = '';
  const title = element('div', 'details-title');
  title.append(element('h2', undefined, details.title), button('×', 'Close details', closeDetails));
  root.append(title);
  if (details.warning) root.append(element('p', 'temporal-warning', details.warning));
  const fields = element('dl', 'detail-fields');
  for (const field of details.fields) { fields.append(element('dt', undefined, field.label), element('dd', undefined, field.value)); }
  root.append(fields);
  if (details.matchingSkills?.length) {
    root.append(element('h3', undefined, 'Matching SKILL.md candidates'));
    for (const candidate of details.matchingSkills) {
      const card = element('div', 'skill-candidate');
      card.append(element('p', undefined, candidate.path), element('span', undefined, `${candidate.validationStatus}${candidate.profile ? ` · ${candidate.profile}` : ''}`));
      const actions = element('div', 'candidate-actions');
      actions.append(
        button('Open SKILL.md', `Open ${candidate.path}`, () => vscode.postMessage({ type: 'openSkill', uri: candidate.uri })),
        button('Open Skill Report', `Open report for ${candidate.path}`, () => vscode.postMessage({ type: 'openSkillReport', uri: candidate.uri })),
      );
      card.append(actions);
      root.append(card);
    }
  }
  if (details.followingNodes?.length) {
    root.append(element('h3', undefined, 'Actions observed after skill load'));
    const list = element('ol', 'following-actions');
    details.followingNodes.forEach((node) => list.append(element('li', undefined, node.label)));
    root.append(list);
  }
  const actions = element('div', 'drawer-actions');
  actions.append(
    button('Open raw session', 'Open raw OpenCode session JSON', () => vscode.postMessage({ type: 'openRawSession' })),
    button('Copy node details', 'Copy selected node details', () => vscode.postMessage({ type: 'copyText', value: JSON.stringify(details, undefined, 2) })),
  );
  root.append(actions);
  if (details.json) {
    const disclosure = element('details');
    disclosure.append(element('summary', undefined, 'Raw JSON'), element('pre', undefined, details.json));
    root.append(disclosure);
  }
}

function setMode(next: TraceGraphMode): void {
  if (mode === next) return;
  mode = next;
  isolation = undefined;
  if (model) collapsed = expandedCollapsedIdsForMode(model, next, collapsed);
  document.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.mode === mode)));
  updateModeNotice();
  renderGraph();
}

function updateModeNotice(): void {
  const notice = document.getElementById('mode-notice');
  if (!notice) return;
  notice.textContent = mode === 'skills'
    ? 'Dashed skill edges represent temporal observations only. The OpenCode export does not prove that a skill or a specific SKILL.md rule caused an action.'
    : mode === 'errors' ? 'Errors mode shows failed actions and their local observed execution path.'
      : mode === 'full' ? 'Full mode includes text, reasoning, files, patches, and snapshots.'
        : 'Solid edges show observed source-order execution. Secondary text, reasoning, file, patch, and snapshot nodes are aggregated.';
  notice.classList.toggle('temporal-warning', mode === 'skills');
}

function collapseAll(): void {
  if (!model) return;
  collapsed = new Set(model.nodes.filter((node) => node.kind === 'user-message' || node.kind === 'assistant-message' || node.kind === 'step').map((node) => node.id));
  renderGraph();
}

function expandRelevantPath(): void {
  if (!model) return;
  const id = selectedId ?? searchMatches[activeMatch];
  if (!id) return;
  const byId = new Map(model.nodes.map((node) => [node.id, node]));
  let current = byId.get(id);
  while (current) { collapsed.delete(current.id); current = current.parentId ? byId.get(current.parentId) : undefined; }
  renderGraph();
}

function toggleSelectedCollapse(): void {
  if (!model || !selectedId) return;
  const node = model.nodes.find((candidate) => candidate.id === selectedId);
  if (!node?.collapsible || node.kind === 'session') return;
  if (collapsed.has(node.id)) collapsed.delete(node.id); else collapsed.add(node.id);
  renderGraph();
}

function isolate(operation: 'predecessors' | 'successors' | 'local' | 'skill' | 'error'): void {
  if (!model || !selectedId) { showStatus('Select a node first.', true); return; }
  const selected = model.nodes.find((node) => node.id === selectedId);
  if (operation === 'skill' && selected?.kind !== 'skill') { showStatus('Select a skill node to isolate its temporal segment.', true); return; }
  if (operation === 'error' && selected?.status !== 'error') { showStatus('Select an error node to isolate its local path.', true); return; }
  isolation = relevantPathNodeIds(model, selectedId, operation);
  renderGraph();
}

function clearIsolation(): void {
  if (!isolation) return;
  isolation = undefined;
  renderGraph();
}

function updateSearch(query: string): void {
  if (!model) return;
  searchMatches = searchTraceGraph(model, query);
  activeMatch = searchMatches.length ? 0 : -1;
  const count = document.getElementById('match-count');
  if (count) count.textContent = `${searchMatches.length} ${searchMatches.length === 1 ? 'match' : 'matches'}`;
  applySearchClasses();
  if (activeMatch >= 0) focusSearchMatch();
}

function moveSearch(delta: number): void {
  if (!searchMatches.length) return;
  activeMatch = (activeMatch + delta + searchMatches.length) % searchMatches.length;
  focusSearchMatch();
}

function focusSearchMatch(): void {
  const id = searchMatches[activeMatch];
  if (!id || !model) return;
  const count = document.getElementById('match-count');
  if (count) count.textContent = `${activeMatch + 1} of ${searchMatches.length}`;
  const node = model.nodes.find((candidate) => candidate.id === id);
  let current = node;
  let needsRender = false;
  const byId = new Map(model.nodes.map((candidate) => [candidate.id, candidate]));
  while (current) { if (collapsed.delete(current.id)) needsRender = true; current = current.parentId ? byId.get(current.parentId) : undefined; }
  if (needsRender) renderGraph();
  else { applySearchClasses(); centerNode(id); }
}

function applySearchClasses(): void {
  if (!cy) return;
  cy.elements().removeClass('search-match search-active search-dim');
  if (!searchMatches.length) return;
  const visibleMatches = searchMatches.map((id) => cy!.getElementById(id)).filter((node) => node.length);
  cy.elements().addClass('search-dim');
  for (const node of visibleMatches) { node.removeClass('search-dim'); node.addClass('search-match'); node.ancestors().removeClass('search-dim'); }
  const active = cy.getElementById(searchMatches[activeMatch] ?? '');
  if (active.length) active.addClass('search-active');
}

function fitGraph(): void { cy?.fit(undefined, 45); }
function resetViewport(): void { if (!cy) return; cy.zoom(1); cy.center(); }
function zoomBy(factor: number): void { if (!cy) return; cy.zoom({ level: Math.min(3.5, Math.max(0.08, cy.zoom() * factor)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } }); }
function centerSelected(): void { if (selectedId) centerNode(selectedId); }
function centerNode(id: string): void { const node = cy?.getElementById(id); if (node?.length) cy?.center(node); }

function closeDetails(): void {
  selectedId = undefined;
  cy?.elements().removeClass('selected neighbor');
  const drawer = document.getElementById('details-drawer');
  if (drawer) drawer.hidden = true;
}

function handleGraphKeydown(event: KeyboardEvent): void {
  if (event.key === 'Enter') { event.preventDefault(); if (selectedId) toggleSelectedCollapse(); else { const first = cy?.nodes().filter(':childless').first(); if (first?.length) selectNode(first.id()); } }
  else if (event.key === 'Escape') { event.preventDefault(); if (selectedId) closeDetails(); else clearIsolation(); }
  else if (event.key === '+' || event.key === '=') { event.preventDefault(); zoomBy(1.2); }
  else if (event.key === '-') { event.preventDefault(); zoomBy(0.8); }
  else if (event.key === '0') { event.preventDefault(); resetViewport(); }
  else if (event.key.toLowerCase() === 'f') { event.preventDefault(); fitGraph(); }
  else if (event.key.startsWith('Arrow')) { event.preventDefault(); moveSpatially(event.key); }
}

function moveSpatially(key: string): void {
  if (!cy) return;
  const nodes = cy.nodes().filter(':childless');
  const current = selectedId ? cy.getElementById(selectedId) : nodes.first();
  if (!current.length) return;
  const origin = (current as cytoscape.NodeSingular).renderedPosition();
  const candidates = nodes.filter((node) => {
    const point = (node as cytoscape.NodeSingular).renderedPosition();
    return key === 'ArrowLeft' ? point.x < origin.x : key === 'ArrowRight' ? point.x > origin.x : key === 'ArrowUp' ? point.y < origin.y : point.y > origin.y;
  });
  let best: cytoscape.NodeSingular | undefined;
  let distance = Number.POSITIVE_INFINITY;
  candidates.forEach((node) => { const candidate = node as cytoscape.NodeSingular; const point = candidate.renderedPosition(); const next = Math.hypot(point.x - origin.x, point.y - origin.y); if (next < distance) { best = candidate; distance = next; } });
  if (best) { selectNode(best.id()); centerNode(best.id()); }
}

function renderAccessibleList(nodes: TraceGraphNode[]): void {
  const root = document.getElementById('accessible-list');
  if (!root) return;
  root.textContent = '';
  root.append(element('h2', undefined, `Execution nodes (${nodes.length})`));
  const list = element('ol');
  for (const node of [...nodes].sort((a, b) => a.sourceOrder - b.sourceOrder)) {
    const item = element('li');
    item.append(button(`${node.label} — ${node.status ?? node.kind}`, `Select ${node.label}`, () => { selectNode(node.id); centerNode(node.id); }));
    list.append(item);
  }
  root.append(list);
}

function toggleAccessibleList(): void {
  const list = document.getElementById('accessible-list');
  const control = document.getElementById('accessible-toggle');
  if (!list || !control) return;
  list.hidden = !list.hidden;
  control.setAttribute('aria-expanded', String(!list.hidden));
}

function scheduleSemanticZoom(): void {
  window.clearTimeout(semanticTimer);
  semanticTimer = window.setTimeout(() => {
    if (!cy) return;
    cy.elements().removeClass('semantic-far semantic-near');
    if (cy.zoom() < 0.45) cy.elements().addClass('semantic-far');
    else if (cy.zoom() > 1.25) cy.nodes().addClass('semantic-near');
  }, 80);
}

function scheduleMinimap(): void {
  if (minimapFrame) return;
  minimapFrame = window.requestAnimationFrame(() => { minimapFrame = 0; drawMinimap(); });
}

function drawMinimap(): void {
  const canvas = document.getElementById('minimap') as HTMLCanvasElement | null;
  if (!canvas || !cy) return;
  const context = canvas.getContext('2d');
  if (!context) return;
  const bounds = cy.elements().boundingBox({ includeLabels: false, includeOverlays: false });
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = css('--vscode-editorWidget-background', '#222');
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (!bounds.w || !bounds.h) return;
  const scale = Math.min((canvas.width - 12) / bounds.w, (canvas.height - 12) / bounds.h);
  const offsetX = (canvas.width - bounds.w * scale) / 2;
  const offsetY = (canvas.height - bounds.h * scale) / 2;
  context.fillStyle = css('--vscode-descriptionForeground', '#999');
  cy.nodes().forEach((node) => { const box = node.boundingBox({ includeLabels: false, includeOverlays: false }); context.fillRect(offsetX + (box.x1 - bounds.x1) * scale, offsetY + (box.y1 - bounds.y1) * scale, Math.max(2, box.w * scale), Math.max(2, box.h * scale)); });
  const extent = cy.extent();
  context.strokeStyle = css('--vscode-focusBorder', '#0af');
  context.lineWidth = 2;
  context.strokeRect(offsetX + (extent.x1 - bounds.x1) * scale, offsetY + (extent.y1 - bounds.y1) * scale, extent.w * scale, extent.h * scale);
  canvas.dataset.bounds = [bounds.x1, bounds.y1, bounds.w, bounds.h, scale, offsetX, offsetY].join(',');
}

function navigateFromMinimap(event: MouseEvent): void {
  const canvas = event.currentTarget as HTMLCanvasElement;
  if (!cy || !canvas.dataset.bounds) return;
  const [x1, y1, , , scale, offsetX, offsetY] = canvas.dataset.bounds.split(',').map(Number);
  const rectangle = canvas.getBoundingClientRect();
  const x = x1 + ((event.clientX - rectangle.left) * (canvas.width / rectangle.width) - offsetX) / scale;
  const y = y1 + ((event.clientY - rectangle.top) * (canvas.height / rectangle.height) - offsetY) / scale;
  cy.pan({ x: cy.width() / 2 - x * cy.zoom(), y: cy.height() / 2 - y * cy.zoom() });
}

function showTooltip(node: cytoscape.NodeSingular): void {
  const tooltip = document.getElementById('graph-tooltip');
  if (!tooltip) return;
  const position = node.renderedPosition();
  tooltip.textContent = [node.data('label'), node.data('status'), node.data('durationMs') === undefined ? undefined : `${node.data('durationMs')} ms`, truncate(node.data('preview'), 180)].filter(Boolean).join(' · ');
  tooltip.style.left = `${position.x + 18}px`;
  tooltip.style.top = `${position.y + 18}px`;
  tooltip.hidden = false;
}

function hideTooltip(): void { const tooltip = document.getElementById('graph-tooltip'); if (tooltip) tooltip.hidden = true; }

function startDrawerResize(event: PointerEvent): void {
  const drawer = document.getElementById('details-drawer');
  if (!drawer) return;
  const startX = event.clientX;
  const startWidth = drawer.getBoundingClientRect().width;
  const move = (next: PointerEvent): void => { drawer.style.width = `${Math.min(window.innerWidth * 0.7, Math.max(280, startWidth + startX - next.clientX))}px`; cy?.resize(); };
  const stop = (): void => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', stop); };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', stop);
}

function showStatus(message: string, error = false): void {
  const status = document.getElementById('status-message');
  if (!status) return;
  status.textContent = message;
  status.classList.toggle('error', error);
  window.setTimeout(() => { if (status.textContent === message) status.textContent = ''; }, 5000);
}

function element<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function button(text: string, label: string, action: () => void): HTMLButtonElement {
  const control = element('button', undefined, text);
  control.type = 'button';
  control.setAttribute('aria-label', label);
  control.title = label;
  control.addEventListener('click', action);
  return control;
}

function option(select: HTMLSelectElement, value: string, label: string): void { const item = element('option', undefined, label); item.value = value; select.append(item); }
function capitalize(value: string): string { return value.charAt(0).toUpperCase() + value.slice(1); }
function truncate(value: unknown, max: number): string | undefined { if (typeof value !== 'string') return undefined; return value.length > max ? `${value.slice(0, max - 1)}…` : value; }
function css(name: string, fallback: string): string { return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback; }
function debounce(callback: () => void, delay: number): () => void { let timer: number | undefined; return () => { window.clearTimeout(timer); timer = window.setTimeout(callback, delay); }; }

vscode.postMessage({ type: 'ready' });
