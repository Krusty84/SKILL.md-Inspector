import { analyzeSkill } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { buildReportModel } from '../ui/reportModel';
import { SkillReportPanel } from '../ui/skillReportWebview';
import { resolveSkillTarget } from './resolveSkillTarget';

/** Command: build and show the read-only Skill Report for the active SKILL.md. */
export async function showSkillReport(uri?: Parameters<typeof resolveSkillTarget>[0]): Promise<void> {
  const target = await resolveSkillTarget(uri, { warningAction: 'show its report' });
  if (!target) {
    return;
  }

  const config = readConfig(target.document.uri);
  const { document, diagnostics } = analyzeSkill(
    target.document.uri.fsPath,
    target.document.getText(),
    config.profile,
    { exclude: config.resourceExclude },
  );
  const report = buildReportModel(document, diagnostics, config.profile, config.heuristicDictionaries);
  SkillReportPanel.show(report);
}
