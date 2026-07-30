import * as l10n from '@vscode/l10n';
import type {
  NormalizedOpenCodeSession,
  NormalizeSessionOptions,
  OpenCodeMetrics,
  OpenCodeParseDiagnostic,
  ParsedMessage,
  ParsedOpenCodeSession,
  ParsedPart,
  SkillLoadObservation,
  TrajectoryNode,
} from './model';
import { asNumber, asString, getPath, preview, safeDuration } from './util';

const DEFAULT_NORMALIZE_OPTIONS: NormalizeSessionOptions = { maxPreviewCharacters: 20000 };

export function normalizeSession(
  session: ParsedOpenCodeSession,
  diagnostics: OpenCodeParseDiagnostic[] = [],
  options: NormalizeSessionOptions = DEFAULT_NORMALIZE_OPTIONS,
): NormalizedOpenCodeSession {
  const normalizedDiagnostics = [...diagnostics];
  const maxPreviewCharacters = validPreviewLimit(options.maxPreviewCharacters);
  const rawByReference = new Map<string, unknown>();
  const nodes: TrajectoryNode[] = [];
  const info = session.info;
  const id = asString(info.id) ?? asString(info.sessionID) ?? asString(info.sessionId);
  const title = asString(info.title) ?? asString(info.name) ?? id ?? l10n.t('OpenCode Session');
  const created = asNumber(getPath(info, ['time', 'created'])) ?? asNumber(info.created);
  const updated = asNumber(getPath(info, ['time', 'updated'])) ?? asNumber(info.updated);
  const root: TrajectoryNode = {
    id: 'session',
    kind: 'session',
    sourceOrder: 0,
    label: title,
    start: created,
    end: updated,
    durationMs: safeDuration(created, updated),
    children: [],
    rawReference: 'session',
  };
  nodes.push(root);
  rawByReference.set('session', session.raw);

  let order = 1;
  for (const message of session.messages) {
    const messageNode = messageToNode(message, order++, maxPreviewCharacters);
    nodes.push(messageNode);
    root.children.push(messageNode.id);
    rawByReference.set(messageNode.rawReference!, message.raw);
    if (message.role === 'assistant') {
      order = addAssistantParts(
        message,
        messageNode,
        nodes,
        rawByReference,
        normalizedDiagnostics,
        order,
        maxPreviewCharacters,
      );
    } else {
      order = addFlatParts(
        message.parts,
        messageNode,
        nodes,
        rawByReference,
        order,
        maxPreviewCharacters,
      );
    }
    deriveParentTime(messageNode, nodes);
  }
  deriveParentTime(root, nodes);

  const skills = analyzeSkillUsage(nodes);
  const metrics = calculateMetrics(session, nodes, skills, root.durationMs);
  if (session.sanitization === 'likely-sanitized') {
    normalizedDiagnostics.push({
      severity: 'warning',
      code: 'opencode.sanitized.likely',
      message: l10n.t(
        'This export appears sanitized; detailed trajectory analysis may be incomplete.',
      ),
    });
  }

  const sessionModel =
    asString(getPath(info, ['model', 'id'])) ??
    asString(getPath(info, ['model', 'modelID'])) ??
    asString(info.model) ??
    asString(info.modelID);
  const sessionProvider =
    asString(getPath(info, ['model', 'providerID'])) ??
    asString(info.provider) ??
    asString(info.providerID) ??
    asString(getPath(info, ['provider', 'id']));
  return {
    id,
    parentId: asString(info.parentID) ?? asString(info.parentId),
    title,
    version: asString(info.version),
    model: sessionModel ?? firstAssistantString(session.messages, [['modelID'], ['model', 'id']]),
    provider:
      sessionProvider ??
      firstAssistantString(session.messages, [
        ['providerID'],
        ['model', 'providerID'],
        ['provider', 'id'],
      ]),
    agent:
      asString(info.agent) ??
      firstAssistantString(session.messages, [['agent']]) ??
      firstUserString(session.messages, [['agent']]),
    created,
    updated,
    details: sessionDetails(info),
    sanitization: session.sanitization,
    diagnostics: normalizedDiagnostics,
    nodes,
    rootNodeId: root.id,
    rawByReference,
    messages: session.messages,
    metrics,
    skills,
  };
}

function validPreviewLimit(value: number): number {
  return Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_NORMALIZE_OPTIONS.maxPreviewCharacters;
}

function messageToNode(
  message: ParsedMessage,
  sourceOrder: number,
  maxPreviewCharacters: number,
): TrajectoryNode {
  const start =
    asNumber(getPath(message.info, ['time', 'created'])) ??
    asNumber(getPath(message.info, ['time', 'start'])) ??
    asNumber(message.info.created);
  const end =
    asNumber(getPath(message.info, ['time', 'completed'])) ??
    asNumber(getPath(message.info, ['time', 'end'])) ??
    asNumber(getPath(message.info, ['time', 'updated'])) ??
    asNumber(message.info.completed) ??
    asNumber(message.info.updated);
  const error = message.role === 'assistant' ? assistantError(message) : undefined;
  return {
    id: `message-${message.sourceOrder}`,
    kind:
      message.role === 'assistant'
        ? 'assistant-message'
        : message.role === 'user'
          ? 'user-message'
          : 'unknown',
    parentId: 'session',
    sourceOrder,
    label: messageLabel(message),
    start,
    end,
    durationMs: safeDuration(start, end),
    status: error === undefined ? undefined : 'error',
    children: [],
    preview: error === undefined ? undefined : previewAssistantError(error, maxPreviewCharacters),
    rawReference: `message-${message.sourceOrder}`,
    details: messageDetails(message),
  };
}

/**
 * Roles are a closed set, so each label is a whole localization key rather
 * than a `{role} message` composition; the unknown branch carries the raw
 * role value (or the `missing` marker) as its argument.
 */
function messageLabel(message: ParsedMessage): string {
  if (message.role === 'user') return l10n.t('user message');
  if (message.role === 'assistant') return l10n.t('assistant message');
  return l10n.t('Unknown ({0}) message', message.originalRole ?? 'missing');
}

function addFlatParts(
  parts: ParsedPart[],
  parent: TrajectoryNode,
  nodes: TrajectoryNode[],
  raw: Map<string, unknown>,
  order: number,
  maxPreviewCharacters: number,
): number {
  for (const part of parts) {
    const node = partToNode(part, parent.id, order++, maxPreviewCharacters);
    nodes.push(node);
    parent.children.push(node.id);
    raw.set(node.rawReference!, part.raw);
  }
  return order;
}

function addAssistantParts(
  message: ParsedMessage,
  parent: TrajectoryNode,
  nodes: TrajectoryNode[],
  raw: Map<string, unknown>,
  diagnostics: OpenCodeParseDiagnostic[],
  order: number,
  maxPreviewCharacters: number,
): number {
  let current: TrajectoryNode | undefined;
  const ensureSynthetic = (): TrajectoryNode => {
    if (current) return current;
    current = {
      id: `${parent.id}-step-synthetic-${parent.children.length}`,
      kind: 'step',
      parentId: parent.id,
      sourceOrder: order++,
      label: l10n.t('Ungrouped step'),
      description: l10n.t('Synthetic group for parts outside explicit step boundaries'),
      children: [],
      synthetic: true,
    };
    nodes.push(current);
    parent.children.push(current.id);
    return current;
  };

  for (const part of message.parts) {
    if (part.originalType === 'step-start') {
      if (current && !current.synthetic) {
        current.incomplete = true;
        diagnostics.push({
          severity: 'warning',
          code: 'opencode.step.repeatedStart',
          message: l10n.t('A step-start appeared before the previous step-finish.'),
          path: part.id,
        });
      }
      current = {
        id: `${parent.id}-step-${part.sourceOrder}`,
        kind: 'step',
        parentId: parent.id,
        sourceOrder: order++,
        label: l10n.t('Step'),
        start: part.start,
        children: [],
        rawReference: `${parent.id}-step-${part.sourceOrder}`,
      };
      nodes.push(current);
      parent.children.push(current.id);
      raw.set(current.rawReference!, part.raw);
      continue;
    }
    if (part.originalType === 'step-finish') {
      if (!current || current.synthetic) {
        diagnostics.push({
          severity: 'warning',
          code: 'opencode.step.unmatchedFinish',
          message: l10n.t('A step-finish appeared without a matching step-start.'),
          path: part.id,
        });
      } else {
        current.end = part.end ?? part.start;
        current.durationMs = safeDuration(current.start, current.end);
        deriveParentTime(current, nodes);
        current = undefined;
      }
      continue;
    }
    const step = ensureSynthetic();
    const node = partToNode(part, step.id, order++, maxPreviewCharacters);
    nodes.push(node);
    step.children.push(node.id);
    raw.set(node.rawReference!, part.raw);
  }

  if (current && !current.synthetic) {
    current.incomplete = true;
    diagnostics.push({
      severity: 'warning',
      code: 'opencode.step.unclosed',
      message: l10n.t('A step-start was not closed by a step-finish.'),
    });
    deriveParentTime(current, nodes);
  }
  for (const stepId of parent.children) {
    const step = nodes.find((node) => node.id === stepId);
    if (step) deriveParentTime(step, nodes);
  }
  return order;
}

function partToNode(
  part: ParsedPart,
  parentId: string,
  sourceOrder: number,
  maxPreviewCharacters: number,
): TrajectoryNode {
  const label =
    part.kind === 'skill'
      ? l10n.t('Skill: {0}', part.skillName ?? 'unknown')
      : part.kind === 'tool'
        ? toolLabel(part)
        : part.kind === 'unknown'
          ? l10n.t('Unknown: {0}', part.originalType ?? 'missing type')
          : part.kind === 'agent' && asString(part.raw.name)
            ? l10n.t('Agent: {0}', asString(part.raw.name)!)
            : part.kind === 'subtask'
              ? subtaskLabel(part)
              : part.kind;
  return {
    id: `${parentId}-part-${part.sourceOrder}`,
    kind: part.kind,
    parentId,
    sourceOrder,
    label,
    start: part.start,
    end: part.end,
    durationMs: safeDuration(part.start, part.end),
    status: part.status,
    toolName: part.toolName,
    skillName: part.skillName,
    callId: part.callId,
    children: [],
    preview: preview(partPreviewValue(part), maxPreviewCharacters),
    rawReference: `${parentId}-part-${part.sourceOrder}`,
    originalType: part.originalType,
    details: partDetails(part),
  };
}

function partPreviewValue(part: ParsedPart): unknown {
  if (part.kind === 'retry') return retryPreview(part.raw);
  if ((part.kind === 'text' || part.kind === 'reasoning') && part.text !== undefined)
    return part.text;
  const output = getPath(part.raw, ['state', 'output']);
  if (output !== undefined) return output;
  const error = getPath(part.raw, ['state', 'error']);
  if (error !== undefined) return error;
  const typeSpecific = firstDefined(part.raw, typeSpecificPreviewPaths(part));
  return typeSpecific ?? part.raw;
}

function typeSpecificPreviewPaths(part: ParsedPart): string[][] {
  switch (part.kind) {
    case 'tool':
    case 'skill':
      return [['state', 'input']];
    case 'retry':
      return [['error'], ['message'], ['reason'], ['attempt']];
    case 'file':
      return [['filename'], ['source', 'path'], ['source', 'uri'], ['url'], ['mime']];
    case 'patch':
      return [['files'], ['hash'], ['patch']];
    case 'snapshot':
      return [['snapshot'], ['hash']];
    case 'agent':
    case 'subtask':
      return [['prompt'], ['description'], ['agent']];
    default:
      return [['value']];
  }
}

function subtaskLabel(part: ParsedPart): string {
  const detail =
    asString(part.raw.description) ?? asString(part.raw.agent) ?? asString(part.raw.command);
  return detail ? l10n.t('Subtask: {0}', short(detail)) : l10n.t('Subtask');
}

function short(value: string): string {
  return value.length > 80 ? `${value.slice(0, 79)}…` : value;
}

function toolLabel(part: ParsedPart): string {
  const name = part.toolName ?? 'unknown';
  const detail =
    asString(getPath(part.raw, ['state', 'input', 'command'])) ??
    asString(getPath(part.raw, ['state', 'input', 'path'])) ??
    asString(getPath(part.raw, ['state', 'input', 'filePath']));
  const label = detail ? short(detail) : undefined;
  return label ? `${name}: ${label}` : name;
}

function deriveParentTime(node: TrajectoryNode, all: TrajectoryNode[]): void {
  const children = node.children
    .map((id) => all.find((candidate) => candidate.id === id))
    .filter((candidate): candidate is TrajectoryNode => !!candidate);
  const starts = children
    .map((child) => child.start)
    .filter((value): value is number => value !== undefined);
  const ends = children
    .map((child) => child.end)
    .filter((value): value is number => value !== undefined);
  node.start ??= starts.length ? Math.min(...starts) : undefined;
  node.end ??= ends.length ? Math.max(...ends) : undefined;
  node.durationMs ??= safeDuration(node.start, node.end);
}

function analyzeSkillUsage(nodes: TrajectoryNode[]): SkillLoadObservation[] {
  const result: SkillLoadObservation[] = [];
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const actionKinds = new Set(['tool', 'subtask', 'agent', 'retry', 'file', 'patch', 'unknown']);
  for (const message of nodes.filter((node) => node.kind === 'assistant-message')) {
    const descendants: TrajectoryNode[] = [];
    const visit = (nodeId: string): void => {
      const node = nodeById.get(nodeId);
      if (!node) return;
      if (node.kind !== 'step') descendants.push(node);
      for (const childId of node.children) visit(childId);
    };
    for (const childId of message.children) visit(childId);
    const ordered = descendants.sort((a, b) => a.sourceOrder - b.sourceOrder);
    for (let index = 0; index < ordered.length; index += 1) {
      const skill = ordered[index];
      if (skill.kind !== 'skill') continue;
      const segment: TrajectoryNode[] = [];
      for (const candidate of ordered.slice(index + 1)) {
        if (candidate.kind === 'skill') break;
        if (actionKinds.has(candidate.kind)) segment.push(candidate);
      }
      const actionSummary: Record<string, number> = {};
      for (const action of segment) {
        const key = action.toolName ?? action.kind;
        actionSummary[key] = (actionSummary[key] ?? 0) + 1;
        if (action.status === 'error') actionSummary.errors = (actionSummary.errors ?? 0) + 1;
      }
      result.push({
        skillName: skill.skillName,
        partId: skill.id,
        callId: skill.callId,
        messageId: message.id,
        status: skill.status ?? 'unknown',
        start: skill.start,
        end: skill.end,
        followingNodeIds: segment.map((node) => node.id),
        relationship: 'temporal',
        actionSummary,
        matchingSkills: [],
      });
    }
  }
  return result;
}

function calculateMetrics(
  session: ParsedOpenCodeSession,
  nodes: TrajectoryNode[],
  skills: SkillLoadObservation[],
  sessionDurationMs?: number,
): OpenCodeMetrics {
  const assistant = session.messages.filter((message) => message.role === 'assistant').length;
  const user = session.messages.filter((message) => message.role === 'user').length;
  const toolErrorCount = nodes.filter(
    (node) => (node.kind === 'tool' || node.kind === 'skill') && node.status === 'error',
  ).length;
  const assistantErrorCount = session.messages.filter(
    (message) => message.role === 'assistant' && assistantError(message) !== undefined,
  ).length;
  return {
    messageCount: session.messages.length,
    userMessageCount: user,
    assistantMessageCount: assistant,
    stepCount: nodes.filter((node) => node.kind === 'step').length,
    toolCallCount: nodes.filter((node) => node.kind === 'tool' || node.kind === 'skill').length,
    toolErrorCount,
    assistantErrorCount,
    errorCount: toolErrorCount + assistantErrorCount,
    skillCallCount: skills.length,
    uniqueLoadedSkills: new Set(skills.map((skill) => skill.skillName).filter(Boolean)).size,
    retryCount: nodes.filter((node) => node.kind === 'retry').length,
    compactionCount: nodes.filter((node) => node.kind === 'compaction').length,
    unknownPartCount: nodes.filter((node) => node.kind === 'unknown').length,
    totalCost: sessionOrAssistantTotal(session, [['cost'], ['totalCost']]),
    inputTokens: sessionOrAssistantTotal(session, [['tokens', 'input'], ['inputTokens']]),
    outputTokens: sessionOrAssistantTotal(session, [['tokens', 'output'], ['outputTokens']]),
    reasoningTokens: sessionOrAssistantTotal(session, [
      ['tokens', 'reasoning'],
      ['reasoningTokens'],
    ]),
    cacheReadTokens: sessionOrAssistantTotal(session, [
      ['tokens', 'cache', 'read'],
      ['cacheReadTokens'],
    ]),
    cacheWriteTokens: sessionOrAssistantTotal(session, [
      ['tokens', 'cache', 'write'],
      ['cacheWriteTokens'],
    ]),
    sessionDurationMs,
  };
}

function sessionOrAssistantTotal(
  session: ParsedOpenCodeSession,
  paths: string[][],
): number | undefined {
  return firstNumber(session.info, paths) ?? sumAssistantNumbers(session.messages, paths);
}

function sumAssistantNumbers(messages: ParsedMessage[], paths: string[][]): number | undefined {
  let found = false;
  let total = 0;
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    const value = firstNumber(message.info, paths);
    if (value === undefined) continue;
    found = true;
    total += value;
    if (!Number.isFinite(total)) return undefined;
  }
  return found ? total : undefined;
}

function firstNumber(root: Record<string, unknown>, paths: string[][]): number | undefined {
  for (const path of paths) {
    const value = asNumber(getPath(root, path));
    if (value !== undefined) return value;
  }
  return undefined;
}

function firstAssistantString(messages: ParsedMessage[], paths: string[][]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'assistant') continue;
    for (const path of paths) {
      const value = asString(getPath(message.info, path));
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function firstDefined(root: Record<string, unknown>, paths: string[][]): unknown {
  for (const path of paths) {
    const value = getPath(root, path);
    if (value !== undefined) return value;
  }
  return undefined;
}

function assistantError(message: ParsedMessage): unknown {
  const error = message.info.error;
  return error === undefined || error === null ? undefined : error;
}

function previewAssistantError(error: unknown, maxPreviewCharacters: number): string | undefined {
  const name = asString(getPath(error, ['name']));
  const message =
    asString(getPath(error, ['data', 'message'])) ?? asString(getPath(error, ['message']));
  const summary = name && message ? `${name}: ${message}` : (message ?? name ?? error);
  return preview(summary, maxPreviewCharacters);
}

function firstUserString(messages: ParsedMessage[], paths: string[][]): string | undefined {
  for (const message of messages) {
    if (message.role !== 'user') continue;
    for (const path of paths) {
      const value = asString(getPath(message.info, path));
      if (value !== undefined) return value;
    }
  }
  return undefined;
}

function sessionDetails(info: Record<string, unknown>): Record<string, unknown> {
  return {
    slug: asString(info.slug),
    projectID: asString(info.projectID),
    workspaceID: asString(info.workspaceID) ?? asString(info.workspaceId),
    directory: asString(info.directory),
    path: info.path,
    shareUrl: asString(getPath(info, ['share', 'url'])),
    summary: info.summary,
    permission: info.permission,
    revert: info.revert,
    metadata: info.metadata,
    variant: asString(info.variant),
  };
}

function messageDetails(message: ParsedMessage): Record<string, unknown> {
  const i = message.info;
  return {
    messageID: asString(i.id),
    parentID: asString(i.parentID),
    agent: asString(i.agent),
    provider: asString(i.providerID) ?? asString(getPath(i, ['model', 'providerID'])),
    model: asString(i.modelID) ?? asString(getPath(i, ['model', 'modelID'])),
    mode: asString(i.mode),
    variant: asString(i.variant),
    finish: i.finish,
    summary: i.summary,
    cwd: asString(getPath(i, ['path', 'cwd'])),
    root: asString(getPath(i, ['path', 'root'])),
    cost: i.cost,
    tokens: i.tokens,
    error: i.error,
    output: i.output,
  };
}

function partDetails(part: ParsedPart): Record<string, unknown> {
  const r = part.raw;
  return {
    name: r.name,
    source: r.source,
    prompt: r.prompt,
    description: r.description,
    agent: r.agent,
    model: r.model,
    command: r.command,
    mime: r.mime,
    filename: r.filename,
    url: r.url,
    hash: r.hash,
    files: r.files,
    snapshot: r.snapshot,
    attempt: r.attempt,
    error: r.error,
    auto: r.auto,
    overflow: r.overflow,
    tail_start_id: r.tail_start_id,
    callID: part.callId,
    tool: part.toolName,
    state: r.state,
  };
}

function retryPreview(root: Record<string, unknown>): unknown {
  const error = getPath(root, ['error']);
  const name = asString(getPath(error, ['name']));
  const message =
    asString(getPath(error, ['data', 'message'])) ?? asString(getPath(error, ['message']));
  const statusCode = asNumber(getPath(error, ['data', 'statusCode']));
  const retryable = getPath(error, ['data', 'isRetryable']);
  const parts = [
    name && message ? `${name}: ${message}` : (message ?? name),
    statusCode !== undefined ? l10n.t('HTTP {0}', statusCode) : undefined,
    retryable === true ? l10n.t('retryable') : retryable === false ? l10n.t('not retryable') : undefined,
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : (root.error ?? root);
}
