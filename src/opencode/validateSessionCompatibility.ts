import type { OpenCodeParseDiagnostic } from './model';
import { asString, isRecord } from './util';

export interface OpenCodeCompatibilityOptions { schemaSourceCommit: string }

const DEFAULT_COMMIT = '17544802c38a4d35834275526ccf38be1cdcfbf4';
const knownParts = new Set(['text','subtask','reasoning','file','tool','step-start','step-finish','snapshot','patch','agent','retry','compaction']);
const knownStatuses = new Set(['pending','running','completed','error']);

export function validateSessionCompatibility(value: unknown, options: OpenCodeCompatibilityOptions = { schemaSourceCommit: DEFAULT_COMMIT }): OpenCodeParseDiagnostic[] {
  const diagnostics: OpenCodeParseDiagnostic[] = [];
  if (!isRecord(value)) return diagnostics;
  diagnostics.push({ severity: 'information', code: 'opencode.compat.schemaReference', message: `Compatibility diagnostics use reconstructed OpenCode schema reference pinned to source commit ${options.schemaSourceCommit}.`, path: '$' });
  const info = isRecord(value.info) ? value.info : undefined;
  const messages = Array.isArray(value.messages) ? value.messages : undefined;
  if (!info || !messages) return diagnostics;
  requireSessionInfo(info, diagnostics);
  const sessionId = asString(info.id);
  const workspaceId = asString(info.workspaceID) ?? asString(info.workspaceId);
  if (!sessionId) warn(diagnostics, 'opencode.id.sessionMissing', '$.info.id', 'Session info is missing schema-defined id.');
  else if (!sessionId.startsWith('ses')) infoDiag(diagnostics, 'opencode.id.sessionNoncanonical', '$.info.id', `Session id uses noncanonical prefix: ${safe(sessionId)}.`);
  if (workspaceId && !workspaceId.startsWith('wrk')) infoDiag(diagnostics, 'opencode.id.workspaceNoncanonical', '$.info.workspaceID', `Workspace id uses noncanonical prefix: ${safe(workspaceId)}.`);

  const messageIds = new Map<string, string>();
  const partIds = new Map<string, string>();
  const callIds = new Map<string, string>();
  const assistantParents: { id: string; parentId: string; path: string }[] = [];

  messages.forEach((messageValue, messageIndex) => {
    const messagePath = `$.messages[${messageIndex}]`;
    if (!isRecord(messageValue)) return;
    const messageInfo = isRecord(messageValue.info) ? messageValue.info : {};
    const role = asString(messageInfo.role);
    const messageId = asString(messageInfo.id);
    const sessionRef = asString(messageInfo.sessionID);
    if (role === 'assistant') requireAssistantMessage(messageInfo, `${messagePath}.info`, diagnostics);
    else requireUserMessage(messageInfo, `${messagePath}.info`, diagnostics);
    if (!messageId) warn(diagnostics, 'opencode.id.messageMissing', `${messagePath}.info.id`, 'Message info is missing schema-defined id.');
    else {
      if (!messageId.startsWith('msg')) infoDiag(diagnostics, 'opencode.id.messageNoncanonical', `${messagePath}.info.id`, `Message id uses noncanonical prefix: ${safe(messageId)}.`);
      duplicate(messageIds, messageId, `${messagePath}.info.id`, diagnostics, 'opencode.id.messageDuplicate', 'Message id is duplicated');
    }
    if (sessionId && sessionRef && sessionRef !== sessionId) warn(diagnostics, 'opencode.invariant.messageSessionIdMismatch', `${messagePath}.info.sessionID`, `Message sessionID mismatch: expected ${safe(sessionId)}, actual ${safe(sessionRef)}.`);
    const parentId = asString(messageInfo.parentID);
    if (role === 'assistant' && parentId && messageId) assistantParents.push({ id: messageId, parentId, path: `${messagePath}.info.parentID` });
    const parts = Array.isArray(messageValue.parts) ? messageValue.parts : [];
    parts.forEach((partValue, partIndex) => {
      const partPath = `${messagePath}.parts[${partIndex}]`;
      if (!isRecord(partValue)) return;
      const type = asString(partValue.type);
      if (type && knownParts.has(type)) requireBasePart(partValue, partPath, diagnostics);
      if (!asString(partValue.id)) warn(diagnostics, 'opencode.id.partMissing', `${partPath}.id`, 'Part is missing schema-defined id.');
      const partId = asString(partValue.id);
      if (partId) {
        if (!partId.startsWith('prt')) infoDiag(diagnostics, 'opencode.id.partNoncanonical', `${partPath}.id`, `Part id uses noncanonical prefix: ${safe(partId)}.`);
        duplicate(partIds, partId, `${partPath}.id`, diagnostics, 'opencode.id.partDuplicate', 'Part id is duplicated');
      }
      const partSessionId = asString(partValue.sessionID);
      if (sessionId && partSessionId && partSessionId !== sessionId) warn(diagnostics, 'opencode.invariant.partSessionIdMismatch', `${partPath}.sessionID`, `Part sessionID mismatch: expected ${safe(sessionId)}, actual ${safe(partSessionId)}.`);
      const partMessageId = asString(partValue.messageID);
      if (messageId && partMessageId && partMessageId !== messageId) warn(diagnostics, 'opencode.invariant.partMessageIdMismatch', `${partPath}.messageID`, `Part messageID mismatch: expected ${safe(messageId)}, actual ${safe(partMessageId)}.`);
      if (type) requirePartType(partValue, type, partPath, diagnostics);
      const callId = asString(partValue.callID) ?? asString(partValue.callId);
      if (callId) duplicate(callIds, callId, `${partPath}.callID`, diagnostics, 'opencode.id.toolCallDuplicate', 'Tool call id is duplicated');
    });
  });
  for (const parent of assistantParents) {
    if (parent.parentId === parent.id) warn(diagnostics, 'opencode.invariant.assistantParentSelfReference', parent.path, `Assistant parentID self-references message ${safe(parent.id)}.`);
    else if (!messageIds.has(parent.parentId)) warn(diagnostics, 'opencode.invariant.assistantParentMissing', parent.path, `Assistant parentID references missing message ${safe(parent.parentId)}.`);
  }
  return diagnostics;
}

function requireSessionInfo(o: Record<string, unknown>, d: OpenCodeParseDiagnostic[]): void { for (const f of ['id','slug','projectID','directory','title','version']) requireString(o, f, '$.info', d); requireObject(o, 'time', '$.info', d); if (isRecord(o.time)) { requireNumber(o.time, 'created', '$.info.time', d); requireNumber(o.time, 'updated', '$.info.time', d); } }
function requireUserMessage(o: Record<string, unknown>, p: string, d: OpenCodeParseDiagnostic[]): void { for (const f of ['id','sessionID','role','agent']) requireString(o, f, p, d); requireObject(o, 'time', p, d); if (isRecord(o.time)) requireNumber(o.time, 'created', `${p}.time`, d); requireObject(o, 'model', p, d); if (isRecord(o.model)) { requireString(o.model, 'providerID', `${p}.model`, d); requireString(o.model, 'modelID', `${p}.model`, d); } }
function requireAssistantMessage(o: Record<string, unknown>, p: string, d: OpenCodeParseDiagnostic[]): void { for (const f of ['id','sessionID','role','parentID','modelID','providerID','mode','agent']) requireString(o, f, p, d); requireObject(o, 'time', p, d); if (isRecord(o.time)) requireNumber(o.time, 'created', `${p}.time`, d); requireObject(o, 'path', p, d); if (isRecord(o.path)) { requireString(o.path, 'cwd', `${p}.path`, d); requireString(o.path, 'root', `${p}.path`, d); } requireNumber(o, 'cost', p, d); requireObject(o, 'tokens', p, d); }
function requireBasePart(o: Record<string, unknown>, p: string, d: OpenCodeParseDiagnostic[]): void { for (const f of ['id','sessionID','messageID','type']) requireString(o, f, p, d); }
function requirePartType(o: Record<string, unknown>, type: string, p: string, d: OpenCodeParseDiagnostic[]): void { const fields: Record<string, string[]> = { text: ['text'], reasoning: ['text'], file: ['mime'], tool: ['callID','tool'], 'step-start': [], 'step-finish': [], snapshot: ['snapshot'], patch: ['hash'], agent: ['name'], subtask: ['prompt','description','agent'], retry: ['attempt'], compaction: [] }; for (const f of fields[type] ?? []) (f === 'attempt' ? requireNumber : requireString)(o, f, p, d); if (type === 'tool') requireToolState(o, p, d); }
function requireToolState(o: Record<string, unknown>, p: string, d: OpenCodeParseDiagnostic[]): void { requireObject(o, 'state', p, d); if (!isRecord(o.state)) return; const s = o.state; requireString(s, 'status', `${p}.state`, d); const status = asString(s.status); if (!status || !knownStatuses.has(status)) return; if (status === 'pending') { requirePresent(s, 'input', `${p}.state`, d); requirePresent(s, 'raw', `${p}.state`, d); } if (status === 'running') { requirePresent(s, 'input', `${p}.state`, d); requireObject(s, 'time', `${p}.state`, d); if (isRecord(s.time)) requireNumber(s.time, 'start', `${p}.state.time`, d); } if (status === 'completed') { for (const f of ['input','output','metadata']) requirePresent(s, f, `${p}.state`, d); requireString(s, 'title', `${p}.state`, d); requireObject(s, 'time', `${p}.state`, d); if (isRecord(s.time)) { requireNumber(s.time, 'start', `${p}.state.time`, d); requireNumber(s.time, 'end', `${p}.state.time`, d); } } if (status === 'error') { requirePresent(s, 'input', `${p}.state`, d); requirePresent(s, 'error', `${p}.state`, d); requireObject(s, 'time', `${p}.state`, d); if (isRecord(s.time)) { requireNumber(s.time, 'start', `${p}.state.time`, d); requireNumber(s.time, 'end', `${p}.state.time`, d); } } }

export function requireString(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (typeof object[field] !== 'string') warn(diagnostics, 'opencode.required.string', `${path}.${field}`, `Required string field ${field} is missing or invalid.`); }
export function requireObject(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (!isRecord(object[field])) warn(diagnostics, 'opencode.required.object', `${path}.${field}`, `Required object field ${field} is missing or invalid.`); }
export function requireArray(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (!Array.isArray(object[field])) warn(diagnostics, 'opencode.required.array', `${path}.${field}`, `Required array field ${field} is missing or invalid.`); }
export function requireNumber(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (typeof object[field] !== 'number' || !Number.isFinite(object[field])) warn(diagnostics, 'opencode.required.number', `${path}.${field}`, `Required number field ${field} is missing or invalid.`); }
export function requireBoolean(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (typeof object[field] !== 'boolean') warn(diagnostics, 'opencode.required.boolean', `${path}.${field}`, `Required boolean field ${field} is missing or invalid.`); }
function requirePresent(object: Record<string, unknown>, field: string, path: string, diagnostics: OpenCodeParseDiagnostic[]): void { if (object[field] === undefined) warn(diagnostics, 'opencode.required.present', `${path}.${field}`, `Required field ${field} is missing.`); }
function duplicate(seen: Map<string, string>, id: string, path: string, diagnostics: OpenCodeParseDiagnostic[], code: string, label: string): void { const first = seen.get(id); if (first) warn(diagnostics, code, path, `${label}: ${safe(id)} (first seen at ${first}).`); else seen.set(id, path); }
function warn(diagnostics: OpenCodeParseDiagnostic[], code: string, path: string, message: string): void { diagnostics.push({ severity: 'warning', code, message, path }); }
function infoDiag(diagnostics: OpenCodeParseDiagnostic[], code: string, path: string, message: string): void { diagnostics.push({ severity: 'information', code, message, path }); }
function safe(value: unknown): string { const text = typeof value === 'string' ? value : JSON.stringify(value); return text && text.length > 120 ? `${text.slice(0, 117)}…` : String(text); }
