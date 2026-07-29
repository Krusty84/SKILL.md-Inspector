import { analyzeSkill } from '../analysis/analyzeSkill';
import { analysisContextFromConfig, readConfig } from '../config';
import { buildReportModel } from '../ui/reportModel';
import { SkillReportPanel } from '../ui/skillReportWebview';
import { resolveSkillTarget } from './resolveSkillTarget';
import { RemoteLinkCheckSession, type RemoteLinkDependencies } from '../online/remoteLinkChecker';
import { nodeRemoteLinkDependencies } from '../online/nodeRemoteLinkDependencies';
import { augmentWithRemoteDiagnostics } from '../online/augmentRemoteDiagnostics';

/** Command: build and show the read-only Skill Report for the active SKILL.md. */
export async function showSkillReport(
  uri?: Parameters<typeof resolveSkillTarget>[0],
  remoteDependencies: RemoteLinkDependencies = nodeRemoteLinkDependencies,
): Promise<void> {
  const target = await resolveSkillTarget(uri, { warningAction: 'show its report' });
  if (!target) {
    return;
  }

  const config = readConfig(target.document.uri);
  const analysisContext = analysisContextFromConfig(config);
  let analysis = analyzeSkill(
    target.document.uri.fsPath,
    target.document.getText(),
    analysisContext.profile,
    {
      exclude: config.resourceExclude,
      dictionaries: analysisContext.dictionaries,
      resourceDirectories: analysisContext.resourceDirectories,
      security: analysisContext.security,
    },
  );
  if (config.onlineCheckEnabled) {
    const session = new RemoteLinkCheckSession(remoteDependencies, {
      maxConcurrency: config.onlineCheckMaxConcurrency,
    });
    try {
      analysis = await augmentWithRemoteDiagnostics(
        analysis,
        analysisContext.profile,
        true,
        session,
      );
    } finally {
      session.dispose();
    }
  }
  const { document, diagnostics, tokenUsage } = analysis;
  const report = buildReportModel(
    document,
    diagnostics,
    analysisContext.profile,
    tokenUsage,
    analysisContext.dictionaries,
    analysisContext.compatibilityAgents,
  );
  SkillReportPanel.show(report);
}
