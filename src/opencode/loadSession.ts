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
    throw new Error(`OpenCode session is too large (${stat.size} bytes).`);
  const text = Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8');
  const json = JSON.parse(text) as unknown;
  const parsed = parseSessionExport(json);
  if (parsed.fatal || !parsed.session)
    throw new Error(parsed.diagnostics[0]?.message ?? 'Invalid OpenCode session export.');
  const normalized = normalizeSession(parsed.session, parsed.diagnostics, options);
  await attachSkillMatches(normalized);
  return normalized;
}
