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

export interface TrajectoryNode { id: string; kind: NodeKind; parentId?: string; sourceOrder: number; label: string; description?: string; start?: number; end?: number; durationMs?: number; status?: string; toolName?: string; skillName?: string; callId?: string; children: string[]; preview?: string; rawReference?: string; synthetic?: boolean; incomplete?: boolean; originalType?: string; details?: Record<string, unknown> }
export interface SkillLoadObservation { skillName?: string; partId?: string; callId?: string; messageId?: string; status: string; start?: number; end?: number; followingNodeIds: string[]; relationship: 'temporal'; actionSummary: Record<string, number>; matchingSkills: SkillMatch[] }
export interface SessionDetails { slug?: string; projectID?: string; workspaceID?: string; directory?: string; path?: unknown; shareUrl?: string; summary?: unknown; permission?: unknown; revert?: unknown; metadata?: unknown; variant?: string }
export interface OpenCodeMetrics { messageCount: number; userMessageCount: number; assistantMessageCount: number; stepCount: number; toolCallCount: number; toolErrorCount: number; assistantErrorCount: number; errorCount: number; skillCallCount: number; uniqueLoadedSkills: number; retryCount: number; compactionCount: number; unknownPartCount: number; totalCost?: number; inputTokens?: number; outputTokens?: number; reasoningTokens?: number; cacheReadTokens?: number; cacheWriteTokens?: number; sessionDurationMs?: number }
export interface NormalizeSessionOptions { maxPreviewCharacters: number }
export interface NormalizedOpenCodeSession { id?: string; parentId?: string; title: string; version?: string; model?: string; provider?: string; agent?: string; created?: number; updated?: number; details: SessionDetails; sanitization: SanitizationStatus; diagnostics: OpenCodeParseDiagnostic[]; nodes: TrajectoryNode[]; rootNodeId: string; rawByReference: Map<string, unknown>; messages: ParsedMessage[]; metrics: OpenCodeMetrics; skills: SkillLoadObservation[] }
export interface SkillMatch { status: 'none' | 'single' | 'multiple'; candidates: SkillCandidate[]; warning?: string }
export interface SkillCandidate { uri: string; path: string; name?: string; validationStatus: string; triggerQuality?: number; profile?: string }
export interface SessionViewModel { session: SessionHeaderViewModel; metrics: OpenCodeMetrics; diagnostics: OpenCodeParseDiagnostic[]; nodes: CompactNodeViewModel[]; skills: SkillLoadObservationViewModel[]; large: boolean }
export interface SessionHeaderViewModel { title: string; id?: string; parentId?: string; version?: string; model?: string; provider?: string; agent?: string; created?: number; updated?: number; durationMs?: number; details: SessionDetails; sanitization: SanitizationStatus }
export interface CompactNodeViewModel { id: string; kind: NodeKind; parentId?: string; sourceOrder: number; label: string; description?: string; start?: number; end?: number; durationMs?: number; status?: string; toolName?: string; skillName?: string; callId?: string; children: string[]; preview?: string; synthetic?: boolean; incomplete?: boolean; originalType?: string; details?: Record<string, unknown> }
export type SkillLoadObservationViewModel = SkillLoadObservation;
export interface SessionSummary { uri: vscode.Uri; uriString: string; fileName: string; size: number; mtime: number; id?: string; parentId?: string; title: string; updated?: number; model?: string; provider?: string; toolCalls: number; skillCalls: number; errors: number; children: SessionSummary[] }
export interface DiscoveryOptions { maxFileSizeBytes: number; maxDiscoveredSessions: number; scanRecursively: boolean; maxPreviewCharacters: number }
