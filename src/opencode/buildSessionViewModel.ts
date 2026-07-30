import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import * as path from 'node:path';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { discoverSkillPaths } from '../workspace/discoverSkills';
import type { NormalizedOpenCodeSession, SkillCandidate, SkillMatch } from './model';
import { normalizeName } from './util';

export async function attachSkillMatches(session: NormalizedOpenCodeSession): Promise<void> {
  const candidates = new Map<string, SkillCandidate[]>();
  const roots = (vscode.workspace.workspaceFolders ?? [])
    .filter((f) => f.uri.scheme === 'file')
    .map((f) => f.uri.fsPath);
  for (const root of roots) {
    for (const skillPath of discoverSkillPaths(root)) {
      try {
        const content = Buffer.from(
          await vscode.workspace.fs.readFile(vscode.Uri.file(skillPath)),
        ).toString('utf8');
        const cfg = readConfig(vscode.Uri.file(skillPath));
        const analysis = analyzeSkill(skillPath, content, cfg.profile, {
          mode: 'text-only',
          dictionaries: cfg.heuristicDictionaries,
          resourceDirectories: cfg.resourceDirectories,
          security: cfg.security,
        });
        const candidate: SkillCandidate = {
          uri: vscode.Uri.file(skillPath).toString(),
          path: skillPath,
          name: analysis.document.frontmatter?.name,
          validationStatus: analysis.diagnostics.some((d) => d.severity === 'error')
            ? 'errors'
            : analysis.diagnostics.length
              ? 'warnings'
              : 'valid',
          profile: cfg.profile.id,
        };
        const key = normalizeName(
          analysis.document.frontmatter?.name || path.basename(path.dirname(skillPath)),
        );
        candidates.set(key, [...(candidates.get(key) ?? []), candidate]);
      } catch {
        /* ignore unreadable skills */
      }
    }
  }
  for (const skill of session.skills) {
    const found = skill.skillName ? (candidates.get(normalizeName(skill.skillName)) ?? []) : [];
    const match: SkillMatch =
      found.length === 0
        ? { status: 'none', candidates: [] }
        : found.length === 1
          ? { status: 'single', candidates: found }
          : {
              status: 'multiple',
              candidates: found,
              warning: l10n.t('Multiple SKILL.md files match this skill name.'),
            };
    skill.matchingSkills = [match];
  }
}
