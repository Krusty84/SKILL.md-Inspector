import * as vscode from 'vscode';
import { KIND_BY_CODE } from '../types/DiagnosticCode';
import {
  SEVERITY_CHOICES,
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
      kind === 'specification' && !allowSpec ? '  ·  (protected — needs allowSpecificationOverrides)' : '';
    return { label: code, description: `→ ${severity}  ·  ${kind}${protectedNote}`, action: 'edit', code };
  });

  items.push({ label: '', kind: vscode.QuickPickItemKind.Separator });
  items.push({ label: '$(add) Add override…', action: 'add' });
  items.push({ label: '$(discard) Clear all overrides', action: 'clear' });

  return vscode.window.showQuickPick(items, {
    title: 'Configure Severity Overrides',
    placeHolder: 'Select an override to edit, or add a new one',
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
      { label: '$(edit) Change severity…', value: 'change' as const },
      { label: '$(trash) Remove override', value: 'remove' as const },
    ],
    { title: `Override: ${code}`, placeHolder: 'Choose an action' },
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
      ? await pickScope(existingScopes, `Change ${code} in which settings?`)
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
        description: existing ? `${entry.kind} · currently: ${existing}` : entry.kind,
        detail: entry.constName,
        code: entry.code,
      });
    }
  }
  const selected = await vscode.window.showQuickPick(items, {
    title: 'Configure Severity Overrides — pick a diagnostic',
    placeHolder: 'Select the diagnostic code to override',
    matchOnDescription: true,
    matchOnDetail: true,
  });
  return selected?.code;
}

/** Presents the four predefined severity levels with descriptions. */
async function pickSeverity(code: string): Promise<SeverityOverrideValue | undefined> {
  const items: SeverityItem[] = SEVERITY_CHOICES.map((choice) => ({
    label: choice.value,
    description: choice.description,
    value: choice.value,
  }));
  const selected = await vscode.window.showQuickPick(items, {
    title: `Severity for ${code}`,
    placeHolder: 'Select a severity level',
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
    const decision = await vscode.window.showWarningMessage(
      `"${code}" is a specification-level error. Overrides that downgrade or disable specification errors are ignored unless "skillMdInspector.severity.allowSpecificationOverrides" is enabled.`,
      { modal: true },
      'Enable & apply',
      'Apply anyway',
    );
    if (!decision) {
      return;
    }
    enableSpec = decision === 'Enable & apply';
  }

  await writeMap(scope, applyOverride(readScopeMap(scope), code, severity));
  if (enableSpec) {
    await vscode.workspace
      .getConfiguration(CONFIG_SECTION)
      .update(ALLOW_SPEC_KEY, true, scope.target);
  }
  vscode.window.showInformationMessage(`SKILL.md Inspector: set ${code} → ${severity}.`);
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
      `SKILL.md Inspector: ${code} is not set in a writable scope.`,
    );
    return;
  }
  for (const scope of scopes) {
    await writeMap(scope, removeOverride(readScopeMap(scope), code));
  }
  vscode.window.showInformationMessage(
    `SKILL.md Inspector: removed override for ${code} (${scopes
      .map((scope) => scope.label)
      .join(' and ')}).`,
  );
}

/** Clear flow: drop the whole overrides map from a chosen scope after confirmation. */
async function clearAllOverrides(): Promise<void> {
  const scopes = scopesWithOverrides();
  if (scopes.length === 0) {
    return;
  }
  const scope = await pickScope(scopes, 'Clear all overrides from which settings?');
  if (!scope) {
    return;
  }
  const confirmation = await vscode.window.showWarningMessage(
    `Remove all severity overrides from ${scope.label} settings?`,
    { modal: true },
    'Clear overrides',
  );
  if (confirmation !== 'Clear overrides') {
    return;
  }
  await writeMap(scope, {});
  vscode.window.showInformationMessage('SKILL.md Inspector: severity overrides cleared.');
}

/** Offers the writable scopes for a new value: User always, Workspace when one is open. */
async function pickWriteScope(): Promise<ScopeItem | undefined> {
  const userScope: ScopeItem = {
    label: 'User',
    description: 'Applies to every workspace',
    target: vscode.ConfigurationTarget.Global,
  };
  if ((vscode.workspace.workspaceFolders ?? []).length === 0) {
    return userScope;
  }
  return pickScope(
    [
      userScope,
      {
        label: 'Workspace',
        description: 'Applies to this workspace only',
        target: vscode.ConfigurationTarget.Workspace,
      },
    ],
    'Where should this override be saved?',
  );
}

/** Shows a scope picker, short-circuiting when only one scope is available. */
async function pickScope(scopes: ScopeItem[], title: string): Promise<ScopeItem | undefined> {
  if (scopes.length === 1) {
    return scopes[0];
  }
  return vscode.window.showQuickPick(scopes, { title, placeHolder: 'Select settings scope' });
}

/** Scopes whose own value defines `code` (User and/or Workspace). */
function resolveScopesFor(code: string): ScopeItem[] {
  const inspected = vscode.workspace
    .getConfiguration(CONFIG_SECTION)
    .inspect<SeverityOverrideMap>(OVERRIDES_KEY);
  const scopes: ScopeItem[] = [];
  if (inspected?.globalValue && code in inspected.globalValue) {
    scopes.push({ label: 'User', target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue && code in inspected.workspaceValue) {
    scopes.push({ label: 'Workspace', target: vscode.ConfigurationTarget.Workspace });
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
    scopes.push({ label: 'User', target: vscode.ConfigurationTarget.Global });
  }
  if (inspected?.workspaceValue && Object.keys(inspected.workspaceValue).length > 0) {
    scopes.push({ label: 'Workspace', target: vscode.ConfigurationTarget.Workspace });
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
