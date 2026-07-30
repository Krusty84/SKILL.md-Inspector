import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { parseSessionExport } from './parseSessionExport';
import { normalizeSession } from './buildTrajectory';
import { attachSkillMatches } from './buildSessionViewModel';
import type { NormalizedOpenCodeSession, NormalizeSessionOptions } from './model';

export async function loadOpenCodeSession(
  uri: vscode.Uri,
  maxFileSizeBytes: number,
  options?: NormalizeSessionOptions,
): Promise<NormalizedOpenCodeSession> {
  const stat = await vscode.workspace.fs.stat(uri);
  if (stat.size > maxFileSizeBytes)
    throw new Error(l10n.t('OpenCode session is too large ({0} bytes).', stat.size));
  const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  const json = JSON.parse(text) as unknown;
  const parsed = parseSessionExport(json);
  if (parsed.fatal || !parsed.session)
    throw new Error(parsed.diagnostics[0]?.message ?? l10n.t('Invalid OpenCode session export.'));
  const normalized = normalizeSession(parsed.session, parsed.diagnostics, options);
  await attachSkillMatches(normalized);
  return normalized;
}
