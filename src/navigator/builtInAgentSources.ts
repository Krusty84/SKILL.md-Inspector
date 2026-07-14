import * as path from 'node:path';
import type { AgentSource } from './types';

export interface BuiltInAgentContext {
  homeDir: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
}

export function resolveBuiltInAgentSources(context: BuiltInAgentContext): AgentSource[] {
  const codexHome = context.env.CODEX_HOME?.trim() || path.join(context.homeDir, '.codex');
  const claudeHome = path.join(context.homeDir, '.claude');
  const sources: AgentSource[] = [
    {
      id: 'codex-global', agentId: 'codex', agentLabel: 'Codex', groupLabel: 'Global Instructions',
      rootPath: codexHome, files: ['AGENTS.md'], recursive: false,
    },
    {
      id: 'codex-user-skills', agentId: 'codex', agentLabel: 'Codex', groupLabel: 'User Skills',
      rootPath: path.join(codexHome, 'skills'), files: ['SKILL.md'], recursive: true,
    },
    {
      id: 'claude-global', agentId: 'claude-code', agentLabel: 'Claude Code', groupLabel: 'Global Instructions',
      rootPath: claudeHome, files: ['CLAUDE.md'], recursive: false,
    },
    {
      id: 'claude-skills', agentId: 'claude-code', agentLabel: 'Claude Code', groupLabel: 'Skills',
      rootPath: path.join(claudeHome, 'skills'), files: ['SKILL.md'], recursive: true,
    },
    {
      id: 'copilot-skills', agentId: 'github-copilot', agentLabel: 'GitHub Copilot', groupLabel: 'Skills',
      rootPath: path.join(context.homeDir, '.copilot', 'skills'), files: ['SKILL.md'], recursive: true,
    },
  ];
  if (context.platform !== 'win32') {
    sources.splice(2, 0, {
      id: 'codex-admin-skills', agentId: 'codex', agentLabel: 'Codex', groupLabel: 'Admin Skills',
      rootPath: '/etc/codex/skills', files: ['SKILL.md'], recursive: true,
    });
  }
  return sources;
}
