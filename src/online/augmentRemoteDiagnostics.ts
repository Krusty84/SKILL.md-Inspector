import type { SkillAnalysis } from '../analysis/analyzeSkill';
import type { SkillProfile } from '../types/SkillProfile';
import { mergeDiagnostics } from '../validation';
import type { RemoteLinkCheckSession } from './remoteLinkChecker';

/** Adds online results to an already-complete static analysis without changing the core pipeline. */
export async function augmentWithRemoteDiagnostics<T extends SkillAnalysis>(
  analysis: T,
  profile: SkillProfile,
  enabled: boolean,
  session: RemoteLinkCheckSession,
): Promise<T> {
  if (!enabled) {
    return analysis;
  }
  const onlineDiagnostics = await session.checkDocument(analysis.document);
  return {
    ...analysis,
    diagnostics: mergeDiagnostics(analysis.diagnostics, onlineDiagnostics, profile),
  };
}
