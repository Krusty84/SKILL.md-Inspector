import * as l10n from '@vscode/l10n';
import type {
  NormalizedOpenCodeSession,
  SanitizationStatus,
  SkillLoadObservation,
  TrajectoryNode,
} from './model';
import { getPath, preview } from './util';

export type OpenCodeTimelineCategory =
  'text' | 'reasoning' | 'tool' | 'error' | 'diff' | 'subtask' | 'structure' | 'unknown';
export type OpenCodeTimelineEventKind =
  | 'user-message'
  | 'assistant-message'
  | 'step'
  | 'reasoning'
  | 'text'
  | 'tool'
  | 'skill'
  | 'file'
  | 'patch'
  | 'snapshot'
  | 'agent'
  | 'subtask'
  | 'retry'
  | 'compaction'
  | 'unknown';
export type OpenCodeTimelineFilter =
  'all' | 'tools' | 'skills' | 'reasoning' | 'errors' | 'diffs' | 'text' | 'subtasks';
export interface OpenCodeTimelineTokenSummary {
  total?: number;
  input?: number;
  output?: number;
  reasoning?: number;
  cacheRead?: number;
  cacheWrite?: number;
}
export interface OpenCodeTimelineFileReference {
  index: number;
  label: string;
  path?: string;
  uri?: string;
  canOpen: boolean;
}
export interface OpenCodeTimelineDiffSummary {
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  hash?: string;
}
export interface OpenCodeTimelineSessionHeader {
  title: string;
  id?: string;
  parentId?: string;
  agent?: string;
  provider?: string;
  model?: string;
  version?: string;
  variant?: string;
  created?: number;
  updated?: number;
  durationMs?: number;
  sanitization: SanitizationStatus;
}
export interface OpenCodeTimelineMetrics {
  totalCost?: number;
  totalTokens?: number;
  inputTokens?: number;
  outputTokens?: number;
  reasoningTokens?: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
  cachedShare?: number;
  durationMs?: number;
  filesChanged?: number;
  additions?: number;
  deletions?: number;
  errorCount: number;
  retryCount: number;
}
export interface OpenCodeTimelineFilterCounts {
  all: number;
  tools: number;
  skills: number;
  reasoning: number;
  errors: number;
  diffs: number;
  text: number;
  subtasks: number;
}
export interface OpenCodeTimelineDiagnosticsSummary {
  error: number;
  warning: number;
  information: number;
  reconstructedSchema: string;
  diagnostics: { severity: string; code: string; message: string; path?: string }[];
}
export interface OpenCodeTimelineSessionDetails {
  metadata: [string, string][];
  changeSummary: [string, string][];
  skills: {
    skillName?: string;
    status: string;
    followingActions: number;
    matchingStatus: string;
    actionSummary: string;
  }[];
  temporalWarning: string;
}
export interface OpenCodeTimelineEvent {
  id: string;
  kind: OpenCodeTimelineEventKind;
  category: OpenCodeTimelineCategory;
  sourceOrder: number;
  messageId?: string;
  stepId?: string;
  label: string;
  secondaryLabel?: string;
  preview?: string;
  status?: string;
  toolName?: string;
  skillName?: string;
  callId?: string;
  elapsedMs?: number;
  timestamp?: number;
  durationMs?: number;
  cost?: number;
  tokens?: OpenCodeTimelineTokenSummary;
  expandable: boolean;
  initiallyExpanded: boolean;
  hasLazyDetails: boolean;
  fileReferences: OpenCodeTimelineFileReference[];
  diffSummary?: OpenCodeTimelineDiffSummary;
  latencyRatio?: number;
  searchText: string;
  incomplete?: boolean;
  finishReason?: string;
}
export interface OpenCodeTimelineViewModel {
  session: OpenCodeTimelineSessionHeader;
  metrics: OpenCodeTimelineMetrics;
  filters: OpenCodeTimelineFilterCounts;
  events: OpenCodeTimelineEvent[];
  diagnosticsSummary: OpenCodeTimelineDiagnosticsSummary;
  details: OpenCodeTimelineSessionDetails;
  initialState: { expandedEventIds: string[]; activeFilter: OpenCodeTimelineFilter };
  large: boolean;
}
export interface OpenCodeTimelineEventDetails {
  title?: string;
  input?: string;
  output?: string;
  outputLineCount?: number;
  outputTruncated?: boolean;
  fullOutputAvailable?: boolean;
  error?: string;
  metadata?: string;
  attachments?: string;
  patch?: string;
  patchTruncated?: boolean;
  raw?: string;
  temporalWarning?: string;
}

const SCHEMA_COMMIT = '17544802c38a4d35834275526ccf38be1cdcfbf4';

export function buildOpenCodeTimelineViewModel(
  session: NormalizedOpenCodeSession,
): OpenCodeTimelineViewModel {
  const start = valid(session.created) ? session.created : firstTimestamp(session.nodes);
  const durations = session.nodes
    .map((n) => n.durationMs)
    .filter((n): n is number => valid(n) && n >= 0)
    .sort((a, b) => a - b);
  const p95 = percentile(durations, 0.95);
  const events = session.nodes
    .filter((n) => n.kind !== 'session' && !(n.kind === 'step' && n.synthetic))
    .sort((a, b) => a.sourceOrder - b.sourceOrder)
    .map((n) => eventFromNode(n, start, p95));
  const counts = filterCounts(events);
  const expandedEventIds = events.filter((e) => e.initiallyExpanded).map((e) => e.id);
  return {
    session: {
      title: session.title,
      id: session.id,
      parentId: session.parentId,
      agent: session.agent,
      provider: session.provider,
      model: session.model,
      version: session.version,
      variant: session.details.variant,
      created: session.created,
      updated: session.updated,
      durationMs: session.metrics.sessionDurationMs,
      sanitization: session.sanitization,
    },
    metrics: metrics(session),
    filters: counts,
    events,
    diagnosticsSummary: diagnostics(session),
    details: details(session),
    initialState: { expandedEventIds, activeFilter: 'all' },
    large: events.length > 1000,
  };
}

export function buildOpenCodeTimelineEventDetails(
  session: NormalizedOpenCodeSession,
  eventId: string,
  hardLimit: number,
): OpenCodeTimelineEventDetails | undefined {
  const node = session.nodes.find((n) => n.id === eventId);
  if (!node?.rawReference) return undefined;
  const raw = session.rawByReference.get(node.rawReference);
  const input = getPath(raw, ['state', 'input']);
  const output = getPath(raw, ['state', 'output']);
  const error =
    getPath(raw, ['state', 'error']) ??
    (raw && typeof raw === 'object' ? (raw as Record<string, unknown>).error : undefined);
  const patch = getPath(raw, ['patch']) ?? getPath(raw, ['files']);
  const outputText = bounded(output, hardLimit);
  return {
    title: stringValue(getPath(raw, ['state', 'title'])),
    input: bounded(input, hardLimit).text,
    output: outputText.text,
    outputLineCount:
      outputText.original === undefined ? undefined : outputText.original.split(/\r?\n/).length,
    outputTruncated: outputText.truncated,
    fullOutputAvailable: outputText.truncated,
    error: bounded(error, hardLimit).text,
    metadata: bounded(getPath(raw, ['state', 'metadata']), hardLimit).text,
    attachments: bounded(getPath(raw, ['state', 'attachments']), hardLimit).text,
    patch: bounded(patch, hardLimit).text,
    patchTruncated: bounded(patch, hardLimit).truncated,
    raw: bounded(raw, hardLimit).text,
    temporalWarning:
      node.kind === 'skill'
        ? l10n.t(
            'Actions observed after a skill load are temporal observations and do not prove causation.',
          )
        : undefined,
  };
}

function eventFromNode(
  n: TrajectoryNode,
  start: number | undefined,
  p95: number | undefined,
): OpenCodeTimelineEvent {
  const category = categoryFor(n);
  const diffSummary = diff(n);
  const tokens = tokenSummary(n.details?.tokens);
  const timestamp = n.start;
  const elapsedMs =
    valid(start) && valid(timestamp) && timestamp >= start ? timestamp - start : undefined;
  const fileReferences = files(n);
  const label = n.kind === 'step' ? stepLabel(n) : n.label;
  return {
    id: n.id,
    kind: kindFor(n),
    category,
    sourceOrder: n.sourceOrder,
    messageId: String(n.details?.messageID ?? '').trim() || undefined,
    stepId: n.parentId?.includes('step') ? n.parentId : undefined,
    label,
    secondaryLabel: n.description,
    preview: n.preview,
    status: n.status,
    toolName: n.toolName,
    skillName: n.skillName,
    callId: n.callId,
    elapsedMs,
    timestamp,
    durationMs: valid(n.durationMs) && n.durationMs >= 0 ? n.durationMs : undefined,
    cost: numberValue(n.details?.cost),
    tokens,
    expandable: expandable(n),
    initiallyExpanded: category === 'error',
    hasLazyDetails:
      !!n.rawReference &&
      [
        'tool',
        'skill',
        'patch',
        'snapshot',
        'file',
        'retry',
        'agent',
        'subtask',
        'assistant-message',
        'user-message',
        'reasoning',
        'unknown',
      ].includes(n.kind),
    fileReferences,
    diffSummary,
    latencyRatio: latencyRatio(n.durationMs, p95),
    searchText: [
      label,
      n.description,
      n.preview,
      n.status,
      n.toolName,
      n.skillName,
      n.callId,
      ...fileReferences.map((f) => f.path ?? f.label),
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase(),
    incomplete: n.incomplete,
    finishReason: stringValue(n.details?.finish),
  };
}
export function latencyRatio(durationMs?: number, p95DurationMs?: number): number | undefined {
  if (!valid(durationMs) || durationMs < 0 || !valid(p95DurationMs) || p95DurationMs <= 0)
    return undefined;
  return Math.max(0.08, Math.min(1, durationMs / p95DurationMs));
}
function percentile(values: number[], p: number): number | undefined {
  if (!values.length) return undefined;
  return values[Math.min(values.length - 1, Math.max(0, Math.ceil(values.length * p) - 1))];
}
function metrics(session: NormalizedOpenCodeSession): OpenCodeTimelineMetrics {
  const m = session.metrics;
  const totalTokens = tokenTotal(m.inputTokens, m.outputTokens, m.reasoningTokens);
  const denom = (m.inputTokens ?? 0) + (m.cacheReadTokens ?? 0);
  const summary =
    session.details.summary && typeof session.details.summary === 'object'
      ? (session.details.summary as Record<string, unknown>)
      : {};
  return {
    totalCost: m.totalCost,
    totalTokens,
    inputTokens: m.inputTokens,
    outputTokens: m.outputTokens,
    reasoningTokens: m.reasoningTokens,
    cacheReadTokens: m.cacheReadTokens,
    cacheWriteTokens: m.cacheWriteTokens,
    cachedShare:
      denom > 0 && m.cacheReadTokens !== undefined ? m.cacheReadTokens / denom : undefined,
    durationMs: m.sessionDurationMs,
    filesChanged: numberValue(summary.files),
    additions: numberValue(summary.additions),
    deletions: numberValue(summary.deletions),
    errorCount: m.errorCount,
    retryCount: m.retryCount,
  };
}
export function tokenTotal(
  input?: number,
  output?: number,
  reasoning?: number,
): number | undefined {
  return input === undefined && output === undefined && reasoning === undefined
    ? undefined
    : (input ?? 0) + (output ?? 0) + (reasoning ?? 0);
}
function categoryFor(n: TrajectoryNode): OpenCodeTimelineCategory {
  if (n.status === 'error' || n.kind === 'retry') return 'error';
  if (n.kind === 'tool' || n.kind === 'skill') return 'tool';
  if (n.kind === 'reasoning') return 'reasoning';
  if (n.kind === 'patch') return 'diff';
  if (n.kind === 'subtask' || n.kind === 'agent') return 'subtask';
  if (n.kind === 'user-message' || n.kind === 'assistant-message' || n.kind === 'text')
    return 'text';
  if (n.kind === 'step' || n.kind === 'compaction') return 'structure';
  return 'unknown';
}
function kindFor(n: TrajectoryNode): OpenCodeTimelineEventKind {
  return [
    'user-message',
    'assistant-message',
    'step',
    'reasoning',
    'text',
    'tool',
    'skill',
    'file',
    'patch',
    'snapshot',
    'agent',
    'subtask',
    'retry',
    'compaction',
  ].includes(n.kind)
    ? (n.kind as OpenCodeTimelineEventKind)
    : 'unknown';
}
function filterCounts(events: OpenCodeTimelineEvent[]): OpenCodeTimelineFilterCounts {
  return {
    all: events.length,
    tools: events.filter((e) => e.kind === 'tool' || e.kind === 'skill').length,
    skills: events.filter((e) => e.kind === 'skill').length,
    reasoning: events.filter((e) => e.kind === 'reasoning').length,
    errors: events.filter((e) => e.category === 'error').length,
    diffs: events.filter((e) => e.category === 'diff').length,
    text: events.filter((e) => e.category === 'text').length,
    subtasks: events.filter((e) => e.category === 'subtask').length,
  };
}
function diagnostics(session: NormalizedOpenCodeSession): OpenCodeTimelineDiagnosticsSummary {
  return {
    error: session.diagnostics.filter((d) => d.severity === 'error').length,
    warning: session.diagnostics.filter((d) => d.severity === 'warning').length,
    information: session.diagnostics.filter((d) => d.severity === 'information').length,
    reconstructedSchema: SCHEMA_COMMIT,
    diagnostics: session.diagnostics,
  };
}
function details(session: NormalizedOpenCodeSession): OpenCodeTimelineSessionDetails {
  return {
    metadata: [
      [l10n.t('Session ID'), session.id],
      [l10n.t('Parent session ID'), session.parentId],
      [l10n.t('Slug'), session.details.slug],
      [l10n.t('Project ID'), session.details.projectID],
      [l10n.t('Workspace ID'), session.details.workspaceID],
      [l10n.t('Directory'), stringValue(session.details.directory)],
      [l10n.t('Variant'), session.details.variant],
    ].filter((r): r is [string, string] => r[1] !== undefined),
    changeSummary: [
      [l10n.t('Files changed'), stringValue(metrics(session).filesChanged)],
      [l10n.t('Additions'), stringValue(metrics(session).additions)],
      [l10n.t('Deletions'), stringValue(metrics(session).deletions)],
    ].filter((r): r is [string, string] => r[1] !== undefined),
    skills: session.skills.map(skillSummary),
    temporalWarning: l10n.t(
      'Actions observed after a skill load are temporal observations and do not prove that a SKILL.md rule caused an action.',
    ),
  };
}
function skillSummary(s: SkillLoadObservation): {
  skillName?: string;
  status: string;
  followingActions: number;
  matchingStatus: string;
  actionSummary: string;
} {
  return {
    skillName: s.skillName,
    status: s.status,
    followingActions: s.followingNodeIds.length,
    matchingStatus: s.matchingSkills.map((m) => m.status).join(', ') || l10n.t('none'),
    actionSummary:
      Object.entries(s.actionSummary)
        .map(([k, v]) => `${k} × ${v}`)
        .join(', ') || l10n.t('none'),
  };
}
function expandable(n: TrajectoryNode): boolean {
  return n.kind !== 'step' || !!n.incomplete || !!n.details;
}
function firstTimestamp(nodes: TrajectoryNode[]): number | undefined {
  return nodes.map((n) => n.start).find((n): n is number => valid(n));
}
function valid(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n);
}
function numberValue(v: unknown): number | undefined {
  return valid(v) && v >= 0 ? v : undefined;
}
function stringValue(v: unknown): string | undefined {
  return v === undefined || v === null || v === ''
    ? undefined
    : typeof v === 'string'
      ? v
      : JSON.stringify(v);
}
function tokenSummary(v: unknown): OpenCodeTimelineTokenSummary | undefined {
  if (!v || typeof v !== 'object') return undefined;
  const r = v as Record<string, unknown>;
  const input = numberValue(r.input);
  const output = numberValue(r.output);
  const reasoning = numberValue(r.reasoning);
  const cache = r.cache && typeof r.cache === 'object' ? (r.cache as Record<string, unknown>) : {};
  const total = tokenTotal(input, output, reasoning);
  return total === undefined
    ? undefined
    : {
        total,
        input,
        output,
        reasoning,
        cacheRead: numberValue(cache.read),
        cacheWrite: numberValue(cache.write),
      };
}
function diff(n: TrajectoryNode): OpenCodeTimelineDiffSummary | undefined {
  const d = n.details ?? {};
  if (n.kind !== 'patch') return undefined;
  const files = Array.isArray(d.files) ? d.files : [];
  return {
    hash: stringValue(d.hash),
    filesChanged: files.length || undefined,
    additions: sumFiles(files, 'additions'),
    deletions: sumFiles(files, 'deletions'),
  };
}
function sumFiles(files: unknown[], key: string): number | undefined {
  let total = 0;
  let found = false;
  for (const file of files) {
    if (file && typeof file === 'object') {
      const n = numberValue((file as Record<string, unknown>)[key]);
      if (n !== undefined) {
        total += n;
        found = true;
      }
    }
  }
  return found ? total : undefined;
}
function files(n: TrajectoryNode): OpenCodeTimelineFileReference[] {
  const values = [
    n.details?.filename,
    getPath(n.details, ['source', 'path']),
    getPath(n.details, ['state', 'input', 'path']),
    getPath(n.details, ['state', 'input', 'filePath']),
  ].filter((v): v is string => typeof v === 'string');
  return [...new Set(values)].map((path, index) => ({
    index,
    label: path.split(/[\\/]/).pop() || path,
    path,
    canOpen: false,
  }));
}
function stepLabel(n: TrajectoryNode): string {
  const finish = stringValue(n.details?.finish);
  // {0} is the node's already-localized label; {1} the raw finish reason.
  return finish
    ? l10n.t('{0} finish · {1}', n.label, finish)
    : n.incomplete
      ? l10n.t('{0} · incomplete', n.label)
      : n.label;
}
function bounded(
  value: unknown,
  max: number,
): { text?: string; original?: string; truncated: boolean } {
  const original = preview(value, Number.MAX_SAFE_INTEGER);
  if (original === undefined) return { truncated: false };
  return original.length > max
    ? {
        text: `${original.slice(0, max)}\n${l10n.t('… truncated {0} characters', original.length - max)}`,
        original,
        truncated: true,
      }
    : { text: original, original, truncated: false };
}
