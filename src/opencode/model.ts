import * as vscode from 'vscode';

export type DiagnosticSeverity = 'error' | 'warning' | 'information';
export type SanitizationStatus = 'not-detected' | 'likely-sanitized' | 'unknown';
export type MessageRole = 'user' | 'assistant' | 'unknown';
export type NodeKind = 'session' | 'user-message' | 'assistant-message' | 'step' | 'text' | 'reasoning' | 'tool' | 'skill' | 'file' | 'subtask' | 'patch' | 'snapshot' | 'agent' | 'retry' | 'compaction' | 'unknown';

export interface OpenCodeParseDiagnostic { severity: DiagnosticSeverity; code: string; message: string; path?: string }
export interface ParseResult { session?: ParsedOpenCodeSession; diagnostics: OpenCodeParseDiagnostic[]; fatal: boolean }
export interface ParsedOpenCodeSession { info: Record<string, unknown>; messages: ParsedMessage[]; raw: Record<string, unknown>; sanitization: SanitizationStatus }
export interface ParsedMessage { id: string; role: MessageRole; originalRole?: string; info: Record<string, unknown>; parts: ParsedPart[]; raw: Record<string, unknown>; sourceOrder: number }
export interface ParsedPart { id: string; kind: NodeKind; originalType?: string; toolName?: string; callId?: string; status?: string; skillName?: string; start?: number; end?: number; text?: string; raw: Record<string, unknown>; sourceOrder: number }

export interface TrajectoryNode { id: string; kind: NodeKind; parentId?: string; sourceOrder: number; label: string; description?: string; start?: number; end?: number; durationMs?: number; status?: string; toolName?: string; skillName?: string; callId?: string; children: string[]; preview?: string; rawReference?: string; synthetic?: boolean; incomplete?: boolean; originalType?: string }
export interface SkillLoadObservation { skillName?: string; partId?: string; callId?: string; messageId?: string; status: string; start?: number; end?: number; followingNodeIds: string[]; relationship: 'temporal'; actionSummary: Record<string, number>; matchingSkills: SkillMatch[] }
export interface OpenCodeMetrics { messageCount: number; userMessageCount: number; assistantMessageCount: number; stepCount: number; toolCallCount: number; toolErrorCount: number; skillCallCount: number; uniqueLoadedSkills: number; retryCount: number; compactionCount: number; unknownPartCount: number; totalCost?: number; inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; sessionDurationMs?: number }
export interface NormalizedOpenCodeSession { id?: string; parentId?: string; title: string; version?: string; model?: string; provider?: string; agent?: string; created?: number; updated?: number; sanitization: SanitizationStatus; diagnostics: OpenCodeParseDiagnostic[]; nodes: TrajectoryNode[]; rootNodeId: string; rawByReference: Map<string, unknown>; messages: ParsedMessage[]; metrics: OpenCodeMetrics; skills: SkillLoadObservation[] }
export interface SkillMatch { status: 'none' | 'single' | 'multiple'; candidates: SkillCandidate[]; warning?: string }
export interface SkillCandidate { uri: string; path: string; name?: string; validationStatus: string; triggerQuality?: number; profile?: string }
export interface SessionViewModel { session: SessionHeaderViewModel; metrics: OpenCodeMetrics; diagnostics: OpenCodeParseDiagnostic[]; nodes: CompactNodeViewModel[]; skills: SkillLoadObservationViewModel[]; large: boolean; hideReasoningByDefault: boolean }
export interface SessionHeaderViewModel { title: string; id?: string; parentId?: string; version?: string; model?: string; provider?: string; agent?: string; created?: number; updated?: number; durationMs?: number; sanitization: SanitizationStatus }
export interface CompactNodeViewModel { id: string; kind: NodeKind; parentId?: string; sourceOrder: number; label: string; description?: string; start?: number; end?: number; durationMs?: number; status?: string; toolName?: string; skillName?: string; children: string[]; preview?: string; synthetic?: boolean; incomplete?: boolean; originalType?: string }
export type SkillLoadObservationViewModel = SkillLoadObservation;
export interface NodeDetailsViewModel { nodeId: string; title: string; kind: NodeKind; fields: Array<{ label: string; value: string }>; json?: string; matchingSkills?: SkillCandidate[]; followingNodes?: CompactNodeViewModel[]; warning?: string }

export type TracePresentationMode = 'path' | 'execution';
export type SessionPathNodeKind = 'request' | 'response' | 'assistant-turn' | 'agent' | 'subtask' | 'skill' | 'phase' | 'tool-group' | 'error' | 'retry' | 'unknown';
export type SessionPathPhaseCategory = 'inspect' | 'search' | 'retrieve' | 'modify' | 'execute' | 'validate' | 'communicate' | 'other';
export interface SessionPathNode { id: string; kind: SessionPathNodeKind; fullLabel: string; displayLabel: string; sourceNodeIds: string[]; firstSourceOrder: number; lastSourceOrder: number; assistantMessageId?: string; stepIds: string[]; phaseCategory?: SessionPathPhaseCategory; status?: string; actionCount: number; errorCount: number; retryCount: number; start?: number; end?: number; durationMs?: number; expandable: boolean; childIds: string[]; parentGroupId?: string; level: 0 | 1 | 2; aggregate?: { tools: number; skills: number; files: number; edits: number; errors: number; retries: number; sourceNodes: number } }
export type SessionPathEdgeKind = 'sequence' | 'branch' | 'temporal-after-skill' | 'return';
export interface SessionPathEdge { id: string; source: string; target: string; kind: SessionPathEdgeKind; temporalOnly?: boolean }
export interface SessionPathViewModel { nodes: SessionPathNode[]; edges: SessionPathEdge[]; rootNodeIds: string[]; initialState: { collapsedNodeIds: string[]; focusNodeId?: string }; sourceNodeToPathNodeIds: Record<string, string[]> }

export type TraceGraphMode = 'overview' | 'skills' | 'errors' | 'full';
export type TraceGraphDirection = 'top-to-bottom' | 'left-to-right';
export type TraceGraphEdgeKind = 'sequence' | 'message-transition' | 'temporal-after-skill' | 'subtask' | 'retry' | 'related-file';

export interface TraceGraphAggregate {
  directChildren: number;
  descendants: number;
  tools: number;
  skills: number;
  errors: number;
  files: number;
  textParts: number;
  reasoningParts: number;
  retries: number;
}

export interface TraceGraphNode {
  id: string;
  parentId?: string;
  kind: NodeKind;
  label: string;
  fullLabel: string;
  displayLabel: string;
  description?: string;
  preview?: string;
  sourceOrder: number;
  status?: string;
  toolName?: string;
  skillName?: string;
  start?: number;
  end?: number;
  durationMs?: number;
  synthetic?: boolean;
  incomplete?: boolean;
  originalType?: string;
  collapsible: boolean;
  initiallyCollapsed: boolean;
  aggregate?: TraceGraphAggregate;
}

export interface TraceGraphEdge {
  id: string;
  source: string;
  target: string;
  kind: TraceGraphEdgeKind;
  label?: string;
  temporalOnly?: boolean;
}

export interface TraceGraphViewModel {
  session: SessionHeaderViewModel;
  path?: SessionPathViewModel;
  metrics: OpenCodeMetrics;
  diagnostics: OpenCodeParseDiagnostic[];
  nodes: TraceGraphNode[];
  edges: TraceGraphEdge[];
  initialState: {
    mode: TraceGraphMode;
    direction: TraceGraphDirection;
    collapsedNodeIds: string[];
    focusNodeId?: string;
  };
  large: boolean;
}
export interface SessionSummary { uri: vscode.Uri; uriString: string; fileName: string; size: number; mtime: number; id?: string; parentId?: string; title: string; updated?: number; model?: string; toolCalls: number; skillCalls: number; errors: number; children: SessionSummary[] }
export interface DiscoveryOptions { maxFileSizeBytes: number; maxDiscoveredSessions: number; scanRecursively: boolean; maxPreviewCharacters: number }
