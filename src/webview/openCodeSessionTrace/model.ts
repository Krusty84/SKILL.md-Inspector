import type { NodeDetailsViewModel, TraceGraphViewModel } from '../../opencode/model';

export type WebviewToExtensionMessage =
  | { type: 'ready' }
  | { type: 'requestNodeDetails'; nodeId: string }
  | { type: 'openSkill'; uri: string }
  | { type: 'openSkillReport'; uri: string }
  | { type: 'openRawSession' }
  | { type: 'copyText'; value: string };

export type ExtensionToWebviewMessage =
  | { type: 'initialize'; model: TraceGraphViewModel }
  | { type: 'nodeDetails'; nodeId: string; details: NodeDetailsViewModel }
  | { type: 'showError'; message: string };

export function isWebviewToExtensionMessage(value: unknown): value is WebviewToExtensionMessage {
  if (!value || typeof value !== 'object') return false;
  const msg = value as Record<string, unknown>;
  if (msg.type === 'ready' || msg.type === 'openRawSession') return true;
  if (msg.type === 'requestNodeDetails') return typeof msg.nodeId === 'string' && msg.nodeId.length > 0 && msg.nodeId.length < 1000;
  if (msg.type === 'openSkill' || msg.type === 'openSkillReport') return typeof msg.uri === 'string' && msg.uri.length > 0 && msg.uri.length < 10000;
  if (msg.type === 'copyText') return typeof msg.value === 'string' && msg.value.length <= 1_000_000;
  return false;
}
