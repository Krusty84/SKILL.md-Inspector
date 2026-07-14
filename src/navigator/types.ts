export type AgentFileName = 'SKILL.md' | 'AGENTS.md' | 'CLAUDE.md';

export interface AdditionalAgentRoot {
  id: string;
  label: string;
  path: string;
  files?: AgentFileName[];
  recursive?: boolean;
}

export interface NormalizedAgentRoot {
  id: string;
  label: string;
  path: string;
  files: AgentFileName[];
  recursive: boolean;
}

export interface AgentSource {
  id: string;
  agentId: string;
  agentLabel: string;
  groupLabel: string;
  rootPath: string;
  files: AgentFileName[];
  recursive: boolean;
  depthLimit?: number;
}

export interface DiscoveredFile {
  sourceId: string;
  sourceLabel: string;
  fileName: AgentFileName;
  absolutePath: string;
  relativePath: string;
}

export interface DiscoveryResult {
  files: DiscoveredFile[];
  messages: string[];
}

export interface FavoriteEntry {
  uri: string;
}
