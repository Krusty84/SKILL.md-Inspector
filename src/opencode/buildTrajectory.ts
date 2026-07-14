import type { NormalizedOpenCodeSession, OpenCodeMetrics, OpenCodeParseDiagnostic, ParsedOpenCodeSession, ParsedMessage, ParsedPart, SkillLoadObservation, TrajectoryNode } from './model';
import { asNumber, asString, getPath, preview, safeDuration } from './util';

export function normalizeSession(session: ParsedOpenCodeSession, diagnostics: OpenCodeParseDiagnostic[] = []): NormalizedOpenCodeSession {
  const rawByReference = new Map<string, unknown>();
  const nodes: TrajectoryNode[] = [];
  const info = session.info;
  const id = asString(info.id) ?? asString(info.sessionID) ?? asString(info.sessionId);
  const title = asString(info.title) ?? asString(info.name) ?? id ?? 'OpenCode Session';
  const created = asNumber(getPath(info, ['time','created'])) ?? asNumber(info.created);
  const updated = asNumber(getPath(info, ['time','updated'])) ?? asNumber(info.updated);
  const root: TrajectoryNode = { id: 'session', kind: 'session', sourceOrder: 0, label: title, start: created, end: updated, durationMs: safeDuration(created, updated), children: [], rawReference: 'session' };
  nodes.push(root); rawByReference.set('session', session.raw);
  let order = 1;
  for (const message of session.messages) {
    const messageNode = messageToNode(message, order++);
    nodes.push(messageNode); root.children.push(messageNode.id); rawByReference.set(messageNode.rawReference!, message.raw);
    if (message.role === 'assistant') order = addAssistantParts(message, messageNode, nodes, rawByReference, diagnostics, order);
    else order = addFlatParts(message.parts, messageNode, nodes, rawByReference, order);
    deriveParentTime(messageNode, nodes);
  }
  const skills = analyzeSkillUsage(nodes);
  const metrics = calculateMetrics(session, nodes, skills, root.durationMs);
  if (session.sanitization === 'likely-sanitized') diagnostics.push({ severity: 'warning', code: 'opencode.sanitized.likely', message: 'This export appears sanitized; detailed trajectory analysis may be incomplete.' });
  return { id, parentId: asString(info.parentID) ?? asString(info.parentId), title, version: asString(info.version), model: asString(info.model) ?? asString(getPath(info, ['model','id'])), provider: asString(info.provider) ?? asString(getPath(info, ['provider','id'])), agent: asString(info.agent), created, updated, sanitization: session.sanitization, diagnostics, nodes, rootNodeId: root.id, rawByReference, messages: session.messages, metrics, skills };
}

function messageToNode(message: ParsedMessage, sourceOrder: number): TrajectoryNode {
  const start = asNumber(getPath(message.info, ['time','start'])) ?? asNumber(getPath(message.info, ['time','created']));
  const end = asNumber(getPath(message.info, ['time','end'])) ?? asNumber(getPath(message.info, ['time','updated']));
  return { id: `message-${message.sourceOrder}`, kind: message.role === 'assistant' ? 'assistant-message' : message.role === 'user' ? 'user-message' : 'unknown', parentId: 'session', sourceOrder, label: `${message.role === 'unknown' ? `Unknown (${message.originalRole ?? 'missing'})` : message.role} message`, start, end, durationMs: safeDuration(start, end), children: [], rawReference: `message-${message.sourceOrder}` };
}
function addFlatParts(parts: ParsedPart[], parent: TrajectoryNode, nodes: TrajectoryNode[], raw: Map<string, unknown>, order: number): number { for (const part of parts) { const n = partToNode(part, parent.id, order++); nodes.push(n); parent.children.push(n.id); raw.set(n.rawReference!, part.raw); } return order; }
function addAssistantParts(message: ParsedMessage, parent: TrajectoryNode, nodes: TrajectoryNode[], raw: Map<string, unknown>, diagnostics: OpenCodeParseDiagnostic[], order: number): number {
  let current: TrajectoryNode | undefined;
  const ensureSynthetic = (): TrajectoryNode => { if (current) return current; current = { id: `${parent.id}-step-synthetic-${parent.children.length}`, kind: 'step', parentId: parent.id, sourceOrder: order++, label: 'Ungrouped step', description: 'Synthetic group for parts outside explicit step boundaries', children: [], synthetic: true }; nodes.push(current); parent.children.push(current.id); return current; };
  for (const part of message.parts) {
    if (part.originalType === 'step-start') { if (current && !current.synthetic) { current.incomplete = true; diagnostics.push({ severity: 'warning', code: 'opencode.step.repeatedStart', message: 'A step-start appeared before the previous step-finish.', path: part.id }); } current = { id: `${parent.id}-step-${part.sourceOrder}`, kind: 'step', parentId: parent.id, sourceOrder: order++, label: 'Step', start: part.start, children: [], rawReference: `${parent.id}-step-${part.sourceOrder}` }; nodes.push(current); parent.children.push(current.id); raw.set(current.rawReference!, part.raw); continue; }
    if (part.originalType === 'step-finish') { if (!current || current.synthetic) diagnostics.push({ severity: 'warning', code: 'opencode.step.unmatchedFinish', message: 'A step-finish appeared without a matching step-start.', path: part.id }); else { current.end = part.end ?? part.start; current.durationMs = safeDuration(current.start, current.end); deriveParentTime(current, nodes); current = undefined; } continue; }
    const step = ensureSynthetic(); const n = partToNode(part, step.id, order++); nodes.push(n); step.children.push(n.id); raw.set(n.rawReference!, part.raw);
  }
  if (current && !current.synthetic) { current.incomplete = true; diagnostics.push({ severity: 'warning', code: 'opencode.step.unclosed', message: 'A step-start was not closed by a step-finish.' }); deriveParentTime(current, nodes); }
  for (const stepId of parent.children) { const step = nodes.find((n) => n.id === stepId); if (step) deriveParentTime(step, nodes); }
  return order;
}
function partToNode(part: ParsedPart, parentId: string, sourceOrder: number): TrajectoryNode { const label = part.kind === 'skill' ? `Skill: ${part.skillName ?? 'unknown'}` : part.kind === 'tool' ? toolLabel(part) : part.kind === 'unknown' ? `Unknown: ${part.originalType ?? 'missing type'}` : part.kind; return { id: `${parentId}-part-${part.sourceOrder}`, kind: part.kind, parentId, sourceOrder, label, start: part.start, end: part.end, durationMs: safeDuration(part.start, part.end), status: part.status, toolName: part.toolName, skillName: part.skillName, callId: part.callId, children: [], preview: preview(part.text ?? part.raw.output ?? part.raw.error ?? part.raw, 500), rawReference: `${parentId}-part-${part.sourceOrder}`, originalType: part.originalType }; }
function toolLabel(part: ParsedPart): string { const name = part.toolName ?? 'unknown'; const detail = asString(getPath(part.raw, ['state','input','command'])) ?? asString(getPath(part.raw, ['state','input','path'])) ?? asString(getPath(part.raw, ['state','input','filePath'])); const short = detail && detail.length > 80 ? `${detail.slice(0, 79)}…` : detail; return short ? `${name}: ${short}` : name; }
function deriveParentTime(node: TrajectoryNode, all: TrajectoryNode[]): void { const children = node.children.map((id) => all.find((n) => n.id === id)).filter((n): n is TrajectoryNode => !!n); const starts = children.map((n) => n.start).filter((n): n is number => n !== undefined); const ends = children.map((n) => n.end).filter((n): n is number => n !== undefined); node.start ??= starts.length ? Math.min(...starts) : undefined; node.end ??= ends.length ? Math.max(...ends) : undefined; node.durationMs ??= safeDuration(node.start, node.end); }
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
      result.push({ skillName: skill.skillName, partId: skill.id, callId: skill.callId, messageId: message.id, status: skill.status ?? 'unknown', start: skill.start, end: skill.end, followingNodeIds: segment.map((node) => node.id), relationship: 'temporal', actionSummary, matchingSkills: [] });
    }
  }
  return result;
}
function calculateMetrics(session: ParsedOpenCodeSession, nodes: TrajectoryNode[], skills: SkillLoadObservation[], sessionDurationMs?: number): OpenCodeMetrics { const assistant = session.messages.filter((m) => m.role === 'assistant').length; const user = session.messages.filter((m) => m.role === 'user').length; return { messageCount: session.messages.length, userMessageCount: user, assistantMessageCount: assistant, stepCount: nodes.filter((n) => n.kind === 'step').length, toolCallCount: nodes.filter((n) => n.kind === 'tool' || n.kind === 'skill').length, toolErrorCount: nodes.filter((n) => (n.kind === 'tool' || n.kind === 'skill') && n.status === 'error').length, skillCallCount: skills.length, uniqueLoadedSkills: new Set(skills.map((s) => s.skillName).filter(Boolean)).size, retryCount: nodes.filter((n) => n.kind === 'retry').length, compactionCount: nodes.filter((n) => n.kind === 'compaction').length, unknownPartCount: nodes.filter((n) => n.kind === 'unknown').length, totalCost: asNumber(session.info.cost), inputTokens: asNumber(session.info.inputTokens), outputTokens: asNumber(session.info.outputTokens), reasoningTokens: asNumber(session.info.reasoningTokens), cacheReadTokens: asNumber(session.info.cacheReadTokens), cacheWriteTokens: asNumber(session.info.cacheWriteTokens), sessionDurationMs }; }
