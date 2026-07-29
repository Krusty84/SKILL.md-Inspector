import { parseSkillFile, withResources } from '../parser/parseSkillFile';
import { discoverResources } from '../parser/discoverResources';
import { runAllValidations } from '../validation';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillProfile } from '../types/SkillProfile';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import type { SecuritySettings } from './security';
import type {
  AnalyzedSkillTokenUsage,
  SkillBodyTokenUsage,
  SkillTokenUsage,
} from '../types/SkillTokenUsage';
import {
  measureBodyTokenUsage,
  measureSkillTokenUsage,
  type ResourceTokenSource,
} from './tokenUsage';

export interface SkillAnalysis {
  document: SkillDocument;
  diagnostics: SkillDiagnostic[];
  tokenUsage: AnalyzedSkillTokenUsage;
}

export interface TextOnlySkillAnalysis extends SkillAnalysis {
  tokenUsage: SkillBodyTokenUsage;
}

export interface FullSkillAnalysis extends SkillAnalysis {
  tokenUsage: SkillTokenUsage;
}

export type AnalysisMode = 'text-only' | 'full';

export interface AnalyzeSkillOptions {
  /** 'text-only' performs no filesystem access; 'full' (default) discovers resources. */
  mode?: AnalysisMode;
  /** Resource-directory exclusion globs (full mode only). */
  exclude?: readonly string[];
  /** Resource discovery function (full mode only); defaults to filesystem discovery. */
  discover?: (dir: string, exclude?: readonly string[]) => SkillResource[];
  /**
   * Per-resource token counts (full mode only); defaults to reading and
   * encoding each file. Long-lived callers pass a cache-backed source.
   */
  fileTokens?: ResourceTokenSource;
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
  /** Security-scan settings; defaults to DEFAULT_SECURITY_SETTINGS when omitted. */
  security?: SecuritySettings;
}

/**
 * Full deterministic analysis for one SKILL.md: parse -> attach resources ->
 * run every rule. In `text-only` mode it performs NO filesystem access (no
 * resource discovery, no linked-file existence checks) so it is safe to run on
 * every keystroke; `full` mode (default, used on save/commands) runs the whole
 * pipeline. No `vscode` dependency.
 */
export function analyzeSkill(
  filePath: string,
  content: string,
  profile: SkillProfile,
  options: AnalyzeSkillOptions & { mode: 'text-only' },
): TextOnlySkillAnalysis;
export function analyzeSkill(
  filePath: string,
  content: string,
  profile: SkillProfile,
  options?: AnalyzeSkillOptions & { mode?: 'full' },
): FullSkillAnalysis;
export function analyzeSkill(
  filePath: string,
  content: string,
  profile: SkillProfile,
  options?: AnalyzeSkillOptions,
): SkillAnalysis;
export function analyzeSkill(
  filePath: string,
  content: string,
  profile: SkillProfile,
  options: AnalyzeSkillOptions = {},
): SkillAnalysis {
  const parsed = parseSkillFile(filePath, content);

  if (options.mode === 'text-only') {
    const tokenUsage = measureBodyTokenUsage(parsed.body);
    const diagnostics = runAllValidations(parsed, profile, {
      skipFilesystem: true,
      dictionaries: options.dictionaries,
      resourceDirectories: options.resourceDirectories,
      tokenUsage,
      security: options.security,
    });
    return { document: parsed, diagnostics, tokenUsage };
  }

  const discover = options.discover ?? discoverResources;
  const document = withResources(parsed, discover(parsed.directory, options.exclude));
  const tokenUsage = measureSkillTokenUsage(document, undefined, options.fileTokens);
  const diagnostics = runAllValidations(document, profile, {
    dictionaries: options.dictionaries,
    resourceDirectories: options.resourceDirectories,
    tokenUsage,
    security: options.security,
  });
  return { document, diagnostics, tokenUsage };
}
