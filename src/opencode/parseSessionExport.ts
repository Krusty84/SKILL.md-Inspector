import type { OpenCodeParseDiagnostic, ParsedMessage, ParsedOpenCodeSession, ParsedPart, ParseResult, MessageRole, NodeKind } from './model';
import { detectSanitizedExport } from './detectSanitizedExport';
import { validateSessionCompatibility } from './validateSessionCompatibility';
import { asNumber, asString, getPath, isRecord } from './util';

const knownParts = new Set(['text','subtask','reasoning','file','tool','step-start','step-finish','snapshot','patch','agent','retry','compaction']);
const knownStatuses = new Set(['pending','running','completed','error']);

export function parseSessionExport(value: unknown): ParseResult {
  const diagnostics: OpenCodeParseDiagnostic[] = [];
  if (!isRecord(value)) return fatal('opencode.root.invalid', 'OpenCode export root must be an object.');
  if (!isRecord(value.info)) return fatal('opencode.info.invalid', 'OpenCode export info must be an object.', '$.info');
  if (!Array.isArray(value.messages)) return fatal('opencode.messages.invalid', 'OpenCode export messages must be an array.', '$.messages');
  diagnostics.push(...validateSessionCompatibility(value));
  const messages: ParsedMessage[] = [];
  value.messages.forEach((messageValue, messageIndex) => {
    if (!isRecord(messageValue)) { diagnostics.push(warn('opencode.message.invalid', 'Message is not an object.', `$.messages[${messageIndex}]`)); return; }
    const info = isRecord(messageValue.info) ? messageValue.info : {};
    if (!isRecord(messageValue.info)) diagnostics.push(warn('opencode.message.info.invalid', 'Message info is missing or not an object.', `$.messages[${messageIndex}].info`));
    const roleText = asString(info.role);
    const role: MessageRole = roleText === 'user' || roleText === 'assistant' ? roleText : 'unknown';
    if (role === 'unknown') diagnostics.push({ severity: 'information', code: 'opencode.message.role.unknown', message: `Unknown message role: ${roleText ?? '<missing>'}.`, path: `$.messages[${messageIndex}].info.role` });
    const partsArray = Array.isArray(messageValue.parts) ? messageValue.parts : [];
    if (!Array.isArray(messageValue.parts)) diagnostics.push(warn('opencode.message.parts.invalid', 'Message parts is missing or not an array.', `$.messages[${messageIndex}].parts`));
    const parts = partsArray.map((part, partIndex) => parsePart(part, messageIndex, partIndex, diagnostics)).filter((part): part is ParsedPart => part !== undefined);
    messages.push({ id: asString(info.id) ?? `message-${messageIndex}`, role, originalRole: roleText, info, parts, raw: messageValue, sourceOrder: messageIndex });
  });
  const session: ParsedOpenCodeSession = { info: value.info, messages, raw: value, sanitization: detectSanitizedExport(value) };
  return { session, diagnostics, fatal: false };

  function fatal(code: string, message: string, path = '$'): ParseResult { return { diagnostics: [{ severity: 'error', code, message, path }], fatal: true }; }
}

function parsePart(value: unknown, messageIndex: number, partIndex: number, diagnostics: OpenCodeParseDiagnostic[]): ParsedPart | undefined {
  const path = `$.messages[${messageIndex}].parts[${partIndex}]`;
  if (!isRecord(value)) { diagnostics.push(warn('opencode.part.invalid', 'Part is not an object.', path)); return undefined; }
  const type = asString(value.type);
  let kind: NodeKind;
  if (!type || !knownParts.has(type)) { kind = 'unknown'; diagnostics.push({ severity: 'information', code: 'opencode.part.type.unknown', message: `Unknown part type: ${type ?? '<missing>'}.`, path: `${path}.type` }); }
  else if (type === 'tool') kind = asString(value.tool) === 'skill' ? 'skill' : 'tool';
  else if (type === 'step-start' || type === 'step-finish') kind = 'step';
  else kind = type as NodeKind;
  const state = isRecord(value.state) ? value.state : undefined;
  const status = asString(state?.status);
  if (type === 'tool' && status && !knownStatuses.has(status)) diagnostics.push({ severity: 'information', code: 'opencode.tool.status.unknown', message: `Unknown tool status: ${status}.`, path: `${path}.state.status` });
  const input = isRecord(state?.input) ? state.input : undefined;
  return {
    id: asString(value.id) ?? asString(value.partID) ?? `message-${messageIndex}-part-${partIndex}`,
    kind,
    originalType: type,
    toolName: asString(value.tool),
    callId: asString(value.callID) ?? asString(value.callId),
    status,
    skillName: asString(input?.name),
    start: asNumber(getPath(value, ['time','start'])) ?? asNumber(getPath(state, ['time','start'])) ?? (type === 'retry' ? asNumber(getPath(value, ['time','created'])) : undefined),
    end: asNumber(getPath(value, ['time','end'])) ?? asNumber(getPath(state, ['time','end'])),
    text: asString(value.text) ?? asString(value.content),
    raw: value,
    sourceOrder: partIndex,
  };
}

function warn(code: string, message: string, path: string): OpenCodeParseDiagnostic { return { severity: 'warning', code, message, path }; }
