import { analyzeSkill } from '../analysis/analyzeSkill';
import { analysisContextFromConfig, readConfig } from '../config';
import { buildReportModel } from '../ui/reportModel';
import { SkillReportPanel } from '../ui/skillReportWebview';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: build and show the read-only Skill Report for the active SKILL.md. */
export async function showSkillReport(
  uri?: Parameters<typeof resolveSkillTarget>[0],
): Promise<void> {
  const target = await resolveSkillTarget(uri, { warningAction: 'show its report' });
  if (!target) {
    return;
  }

  const config = readConfig(target.document.uri);
  const analysisContext = analysisContextFromConfig(config);
  const { document, diagnostics, tokenUsage } = analyzeSkill(
    target.document.uri.fsPath,
    target.document.getText(),
    analysisContext.profile,
    {
      exclude: config.resourceExclude,
      dictionaries: analysisContext.dictionaries,
      resourceDirectories: analysisContext.resourceDirectories,
    },
  );
  const report = buildReportModel(
    document,
    diagnostics,
    analysisContext.profile,
    tokenUsage,
    analysisContext.dictionaries,
  );
  SkillReportPanel.show(report);
}
