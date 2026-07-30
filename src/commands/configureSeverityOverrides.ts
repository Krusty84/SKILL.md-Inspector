import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { KIND_BY_CODE } from '../types/DiagnosticCode';
import {
  severityChoices,
  applyOverride,
  groupCodesByKind,
  isProtectedDowngrade,
  removeOverride,
  type SeverityOverrideMap,
  type SeverityOverrideValue,
} from './severityOverridesModel';

const CONFIG_SECTION = 'skillMdInspector';
const OVERRIDES_KEY = 'severityOverrides';
const ALLOW_SPEC_KEY = 'severity.allowSpecificationOverrides';

/** `severityOverrides` has no `scope` in the manifest, so it is window-scoped: only User and Workspace are writable. */
interface ScopeItem extends vscode.QuickPickItem {
  target: vscode.ConfigurationTarget;
}

interface ManageItem extends vscode.QuickPickItem {
  action?: 'add' | 'clear' | 'edit';
  code?: string;
}

interface CodeItem extends vscode.QuickPickItem {
  code?: string;
}

interface SeverityItem extends vscode.QuickPickItem {
  value: SeverityOverrideValue;
}

/**
 * Command: guide the user through editing `skillMdInspector.severityOverrides`
 * by picking a diagnostic code and a severity from lists, instead of hand-typing
 * both into the raw object setting. Writing the setting triggers the existing
 * configuration-change listener, which re-validates automatically.
 */
export async function configureSeverityOverrides(): Promise<void> {
  const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
  const current = cfg.get<SeverityOverrideMap>(OVERRIDES_KEY, {});

  // Fresh start: skip the manage panel and go straight to adding an override.
  if (Object.keys(current).length === 0) {
    await addOverride(current);
    return;
  }

  const allowSpec = cfg.get<boolean>(ALLOW_SPEC_KEY, false);
  const choice = await showManagePanel(current, allowSpec);
  if (!choice) {
    return;
  }
  switch (choice.action) {
    case 'add':
      await addOverride(current);
      return;
    case 'clear':
      await clearAllOverrides();
      return;
    case 'edit':
      if (choice.code) {
        await editOverride(choice.code);
      }
      return;
  }
}

/** Lists existing overrides plus the add/clear actions. */
async function showManagePanel(
  current: SeverityOverrideMap,
  allowSpec: boolean,
): Promise<ManageItem | undefined> {
  const codes = Object.keys(current).sort();
  const items: ManageItem[] = codes.map((code) => {
    const severity = current[code];
    const kind = KIND_BY_CODE[code] ?? 'quality';
    const protectedNote =
      kind === 'specification' && !allowSpec
        ? `  ·  ${l10n.t('(protected — needs allowSpecificationOverrides)')}`
        : '';
    return { label: code, description: `→ ${severity}  ·  ${kind}${protectedNote}`, action: 'edit', code };
  });

  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: `$(add) ${l10n.t('Add override…')}`, action: 'add' });
  items.push({ label: `$(discard) ${l10n.t('Clear all overrides')}`, action: 'clear' });

  return vscode.window.showQuickPick(items, {
    title: l10n.t('Configure Severity Overrides'),
    placeHolder: l10n.t('Select an override to edit, or add a new one'),
  });
}

/** Add flow: pick a code, pick a severity, pick a scope, then write. */
async function addOverride(current: SeverityOverrideMap): Promise<void> {
  const code = await pickCode(current);
  if (!code) {
    return;
  }
  const severity = await pickSeverity(code);
  if (!severity) {
    return;
  }
  const scope = await pickWriteScope();
  if (!scope) {
    return;
  }
  await commitOverride(code, severity, scope);
}

/** Edit flow: change the severity of an existing override, or remove it. */
async function editOverride(code: string): Promise<void> {
  const action = await vscode.window.showQuickPick(
    [
      { label: `$(edit) ${l10n.t('Change severity…')}`, value: 'change' as const },
      { label: `$(trash) ${l10n.t('Remove override')}`, value: 'remove' as const },
    ],
    { title: l10n.t('Override: {0}', code), placeHolder: l10n.t('Choose an action') },
  );
  if (!action) {
    return;
  }
  if (action.value === 'remove') {
    await removeOverrideEverywhere(code);
    return;
  }
  const severity = await pickSeverity(code);
  if (!severity) {
    return;
  }
  const existingScopes = resolveScopesFor(code);
  const scope =
    existingScopes.length > 0
      ? await pickScope(existingScopes, l10n.t('Change {0} in which settings?', code))
      : await pickWriteScope();
  if (!scope) {
    return;
  }
  await commitOverride(code, severity, scope);
}

/** Presents the grouped diagnostic-code picker built from the code catalog. */
async function pickCode(current: SeverityOverrideMap): Promise<string | undefined> {
  const items: CodeItem[] = [];
  for (const group of groupCodesByKind()) {
    items.push({ label: group.label, kind: vscode.QuickPickItemKind.Separator });
    for (const entry of group.entries) {
      const existing = current[entry.code];
      const lock = entry.kind === 'specification' ? '$(lock) ' : '';
      items.push({
        label: `${lock}${entry.code}`,
        description: existing ? `${entry.kind} · ${l10n.t('currently: {0}', existing)}` : entry.kind,
        detail: entry.constName,
        code: entry.code,
      });
    }
  }
  const selected = await vscode.window.showQuickPick(items, {
    title: l10n.t('Configure Severity Overrides — pick a diagnostic'),
    placeHolder: l10n.t('Select the diagnostic code to override'),
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.code;
}

/** Presents the four predefined severity levels with descriptions. */
async function pickSeverity(code: string): Promise<SeverityOverrideValue | undefined> {
  const items: SeverityItem[] = severityChoices().map((choice) => ({
    label: choice.value,
    description: choice.description,
    value: choice.value,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: l10n.t('Severity for {0}', code),
    placeHolder: l10n.t('Select a severity level'),
  });
  return selected?.value;
}

/** Writes an override, guarding against silently-ignored specification downgrades. */
async function commitOverride(
  code: string,
  severity: SeverityOverrideValue,
  scope: ScopeItem,
): Promise<void> {
  const allowSpec = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .get<boolean>(ALLOW_SPEC_KEY, false);

  let enableSpec = false;
  if (isProtectedDowngrade(code, severity, allowSpec)) {
    const enableAndApply = l10n.t('Enable & apply');
    const applyAnyway = l10n.t('Apply anyway');
    const decision = await vscode.window.showWarningMessage(
      l10n.t(
        '"{0}" is a specification-level error. Overrides that downgrade or disable specification errors are ignored unless "skillMdInspector.severity.allowSpecificationOverrides" is enabled.',
        code,
      ),
      { modal: true },
      enableAndApply,
      applyAnyway,
    );
    if (!decision) {
      return;
    }
    enableSpec = decision === enableAndApply;
  }

  await writeMap(scope, applyOverride(readScopeMap(scope), code, severity));
  if (enableSpec) {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(ALLOW_SPEC_KEY, true, scope.target);
  }
  vscode.window.showInformationMessage(l10n.t('SKILL.md Inspector: set {0} → {1}.', code, severity));
}

/**
 * Remove flow: delete an override from EVERY scope that defines it. `severityOverrides` is
 * window-scoped, so the same code can live in both User and Workspace settings; removing it from only one
 * leaves the other in VS Code's merged value, so a "deleted" override would still apply. Clearing all
 * defining scopes guarantees the merged value truly loses the key.
 */
async function removeOverrideEverywhere(code: string): Promise<void> {
  const scopes = resolveScopesFor(code);
  if (scopes.length === 0) {
    vscode.window.showInformationMessage(
      l10n.t('SKILL.md Inspector: {0} is not set in a writable scope.', code),
    );
    return;
  }
  for (const scope of scopes) {
    await writeMap(scope, removeOverride(readScopeMap(scope), code));
  }
  // At most two scopes exist (User and Workspace), so both list shapes are
  // whole sentences instead of an English " and " join.
  vscode.window.showInformationMessage(
    scopes.length === 1
      ? l10n.t('SKILL.md Inspector: removed override for {0} ({1}).', code, scopes[0].label)
      : l10n.t(
          'SKILL.md Inspector: removed override for {0} ({1} and {2}).',
          code,
          scopes[0].label,
          scopes[1].label,
        ),
  );
}

/** Clear flow: drop the whole overrides map from a chosen scope after confirmation. */
async function clearAllOverrides(): Promise<void> {
  const scopes = scopesWithOverrides();
  if (scopes.length === 0) {
    return;
  }
  const scope = await pickScope(scopes, l10n.t('Clear all overrides from which settings?'));
  if (!scope) {
    return;
  }
  const clearLabel = l10n.t('Clear overrides');
  const confirmation = await vscode.window.showWarningMessage(
    l10n.t('Remove all severity overrides from {0} settings?', scope.label),
    { modal: true },
    clearLabel,
  );
  if (confirmation !== clearLabel) {
    return;
  }
  await writeMap(scope, {});
  vscode.window.showInformationMessage(l10n.t('SKILL.md Inspector: severity overrides cleared.'));
}

/** Offers the writable scopes for a new value: User always, Workspace when one is open. */
async function pickWriteScope(): Promise<ScopeItem | undefined> {
  const userScope: ScopeItem = {
    label: l10n.t('User'),
    description: l10n.t('Applies to every workspace'),
    target: vscode.ConfigurationTarget.Global,
  };
  if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
    return userScope;
  }
  return pickScope(
    [
      userScope,
      {
        label: l10n.t('Workspace'),
        description: l10n.t('Applies to this workspace only'),
        target: vscode.ConfigurationTarget.Workspace,
      },
    ],
    l10n.t('Where should this override be saved?'),
  );
}

/** Shows a scope picker, short-circuiting when only one scope is available. */
async function pickScope(scopes: ScopeItem[], title: string): Promise<ScopeItem | undefined> {
  if (scopes.length === 1) {
    return scopes[0];
  }
  return vscode.window.showQuickPick(scopes, { title, placeHolder: l10n.t('Select settings scope') });
}

/** Scopes whose own value defines `code` (User and/or Workspace). */
function resolveScopesFor(code: string): ScopeItem[] {
  const inspected = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .inspect<SeverityOverrideMap>(OVERRIDES_KEY);
  const scopes: ScopeItem[] = [];
  if (inspected?.globalValue && code in inspected.globalValue) {
    scopes.push({ label: l10n.t('User'), target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue && code in inspected.workspaceValue) {
    scopes.push({ label: l10n.t('Workspace'), target: vscode.ConfigurationTarget.Workspace });
  }
  return scopes;
}

/** Scopes whose own value defines at least one override. */
function scopesWithOverrides(): ScopeItem[] {
  const inspected = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .inspect<SeverityOverrideMap>(OVERRIDES_KEY);
  const scopes: ScopeItem[] = [];
  if (inspected?.globalValue && Object.keys(inspected.globalValue).length > 0) {
    scopes.push({ label: l10n.t('User'), target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue && Object.keys(inspected.workspaceValue).length > 0) {
    scopes.push({ label: l10n.t('Workspace'), target: vscode.ConfigurationTarget.Workspace });
  }
  return scopes;
}

/** Reads the overrides map defined at a specific scope (not the merged value). */
function readScopeMap(scope: ScopeItem): SeverityOverrideMap {
  const inspected = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .inspect<SeverityOverrideMap>(OVERRIDES_KEY);
  if (scope.target === vscode.ConfigurationTarget.Global) {
    return inspected?.globalValue ?? {};
  }
  if (scope.target === vscode.ConfigurationTarget.Workspace) {
    return inspected?.workspaceValue ?? {};
  }
  return {};
}

/** Writes the overrides map to a scope, clearing the key entirely when it is empty. */
async function writeMap(scope: ScopeItem, map: SeverityOverrideMap): Promise<void> {
  const value = Object.keys(map).length === 0 ? undefined : map;
  await vscode.workspace.getConfiguration(CONFIG_SECTION).update(OVERRIDES_KEY, value, scope.target);
}
