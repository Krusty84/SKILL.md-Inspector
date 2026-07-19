import { parseSkillFile, withResources } from '../parser/parseSkillFile';
import { discoverResources } from '../parser/discoverResources';
import { runAllValidations } from '../validation';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillProfile } from '../types/SkillProfile';
import type { HeuristicDictionaries } from '../quality/dictionaries';

export interface SkillAnalysis {
  document: SkillDocument;
  diagnostics: SkillDiagnostic[];
}

export type AnalysisMode = 'text-only' | 'full';

export interface AnalyzeSkillOptions {
  /** 'text-only' performs no filesystem access; 'full' (default) discovers resources. */
  mode?: AnalysisMode;
  /** Resource-directory exclusion globs (full mode only). */
  exclude?: readonly string[];
  /** Resource discovery function (full mode only); defaults to filesystem discovery. */
  discover?: (dir: string, exclude?: readonly string[]) => SkillResource[];
  dictionaries?: HeuristicDictionaries;
  resourceDirectories?: readonly string[];
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
  options: AnalyzeSkillOptions = {},
): SkillAnalysis {
  const parsed = parseSkillFile(filePath, content);

  if (options.mode === 'text-only') {
    const diagnostics = runAllValidations(parsed, profile, {
      skipFilesystem: true,
      dictionaries: options.dictionaries,
      resourceDirectories: options.resourceDirectories,
    });
    return { document: parsed, diagnostics };
  }

  const discover = options.discover ?? discoverResources;
  const document = withResources(parsed, discover(parsed.directory, options.exclude));
  const diagnostics = runAllValidations(document, profile, {
    dictionaries: options.dictionaries,
    resourceDirectories: options.resourceDirectories,
  });
  return { document, diagnostics };
}
