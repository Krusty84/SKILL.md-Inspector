import type { AgentFileName, NormalizedAgentRoot } from './types';

const SUPPORTED_FILES = new Set<AgentFileName>(['SKILL.md', 'AGENTS.md']);

export interface NormalizedRootsResult {
  roots: NormalizedAgentRoot[];
  ignoredCount: number;
}

export function normalizeAdditionalRoots(value: unknown): NormalizedRootsResult {
  if (!Array.isArray(value)) {
    return { roots: [], ignoredCount: value === undefined ? 0 : 1 };
  }
  const roots: NormalizedAgentRoot[] = [];
  let ignoredCount = 0;
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') {
      ignoredCount += 1;
      continue;
    }
    const candidate = entry as Record<string, unknown>;
    if (!nonEmpty(candidate.id) || !nonEmpty(candidate.label) || !nonEmpty(candidate.path)) {
      ignoredCount += 1;
      continue;
    }
    const files = normalizeFiles(candidate.files);
    if (!files) {
      ignoredCount += 1;
      continue;
    }
    roots.push({
      id: candidate.id.trim(),
      label: candidate.label.trim(),
      path: candidate.path.trim(),
      files,
      recursive: typeof candidate.recursive === 'boolean' ? candidate.recursive : true,
    });
  }
  return { roots, ignoredCount };
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeFiles(value: unknown): AgentFileName[] | undefined {
  if (value === undefined) {
    return ['SKILL.md', 'AGENTS.md'];
  }
  if (!Array.isArray(value) || value.length === 0) {
    return undefined;
  }
  const files: AgentFileName[] = [];
  for (const file of value) {
    if (file !== 'SKILL.md' && file !== 'AGENTS.md') {
      return undefined;
    }
    if (!files.includes(file)) {
      files.push(file);
    }
  }
  return files.filter((file) => SUPPORTED_FILES.has(file));
}
