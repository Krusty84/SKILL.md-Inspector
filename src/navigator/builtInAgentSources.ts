import * as path from 'node:path';
import * as l10n from '@vscode/l10n';
import type { AgentSource } from './types';

export interface BuiltInAgentContext {
  homeDir: string;
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
}

export function resolveBuiltInAgentSources(context: BuiltInAgentContext): AgentSource[] {
  const codexHome = context.env.CODEX_HOME?.trim() || path.join(context.homeDir, '.codex');
  const sources: AgentSource[] = [
    {
      id: 'codex-global',
      agentId: 'codex',
      agentLabel: 'Codex',
      groupLabel: l10n.t('Global Instructions'),
      rootPath: codexHome,
      files: ['AGENTS.md'],
      recursive: false,
    },
    {
      id: 'codex-home-skills',
      agentId: 'codex',
      agentLabel: 'Codex',
      groupLabel: l10n.t('Codex Home Skills'),
      rootPath: path.join(codexHome, 'skills'),
      files: ['SKILL.md'],
      recursive: true,
    },
    {
      id: 'codex-user-skills',
      agentId: 'codex',
      agentLabel: 'Codex',
      groupLabel: l10n.t('User Skills'),
      rootPath: path.join(context.homeDir, '.agents', 'skills'),
      files: ['SKILL.md'],
      recursive: true,
    },
    {
      id: 'opencode-global',
      agentId: 'opencode',
      agentLabel: 'OpenCode',
      groupLabel: l10n.t('Global Instructions'),
      rootPath: path.join(context.homeDir, '.config', 'opencode'),
      files: ['AGENTS.md'],
      recursive: false,
    },
    {
      id: 'opencode-skills',
      agentId: 'opencode',
      agentLabel: 'OpenCode',
      groupLabel: l10n.t('Skills'),
      rootPath: path.join(context.homeDir, '.config', 'opencode', 'skills'),
      files: ['SKILL.md'],
      recursive: true,
    },
    {
      id: 'claude-global',
      agentId: 'claude-code',
      agentLabel: 'Claude Code',
      groupLabel: l10n.t('Global Instructions'),
      rootPath: path.join(context.homeDir, '.claude'),
      files: ['CLAUDE.md'],
      recursive: false,
    },
    {
      id: 'claude-skills',
      agentId: 'claude-code',
      agentLabel: 'Claude Code',
      groupLabel: l10n.t('Skills'),
      rootPath: path.join(context.homeDir, '.claude', 'skills'),
      files: ['SKILL.md'],
      recursive: true,
    },
    {
      id: 'copilot-skills',
      agentId: 'github-copilot',
      agentLabel: 'GitHub Copilot',
      groupLabel: l10n.t('Skills'),
      rootPath: path.join(context.homeDir, '.copilot', 'skills'),
      files: ['SKILL.md'],
      recursive: true,
    },
  ];
  if (context.platform !== 'win32') {
    sources.splice(3, 0, {
      id: 'codex-admin-skills',
      agentId: 'codex',
      agentLabel: 'Codex',
      groupLabel: l10n.t('Admin Skills'),
      rootPath: '/etc/codex/skills',
      files: ['SKILL.md'],
      recursive: true,
    });
  }
  return sources;
}
