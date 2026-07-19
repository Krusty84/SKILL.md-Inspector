export interface TokenCountEntry {
  /** POSIX-style path relative to the skill directory. */
  relativePath: string;
  tokens: number;
}

export interface TokenUsageGroup {
  files: TokenCountEntry[];
  totalTokens: number;
}

export interface SkillBodyTokenUsage {
  encoding: 'o200k_base';
  body: {
    tokens: number;
    lines: number;
  };
}

/** Complete token metrics produced only by full, filesystem-backed analysis. */
export interface SkillTokenUsage extends SkillBodyTokenUsage {
  references: TokenUsageGroup;
  otherFiles: TokenUsageGroup;
}

/** Text-only analysis intentionally has no resource groups or inferred zero totals. */
export type AnalyzedSkillTokenUsage = SkillBodyTokenUsage | SkillTokenUsage;

export function hasResourceTokenUsage(usage: AnalyzedSkillTokenUsage): usage is SkillTokenUsage {
  return 'references' in usage && 'otherFiles' in usage;
}
