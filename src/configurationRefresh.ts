/**
 * Snapshot of the settings the navigator sidebar views actually read. Comparing
 * snapshots lets a configuration change refresh a view only when the value it
 * depends on truly changed. This matters because VS Code re-fires
 * `onDidChangeConfiguration` when workspace folders are added or removed — those
 * events must not disturb views whose settings did not actually change.
 */
export interface NavigatorConfigSnapshot {
  /** Serialized `skillMdInspector.navigator.additionalRoots` (INSTALLED AGENTS). */
  additionalRoots: string;
  /** Serialized `skillMdInspector.openCode.*` discovery settings (OPENCODE SESSIONS). */
  openCode: string;
}

/**
 * Side effects available when a `skillMdInspector` setting changes.
 *
 * FAVORITES and the WORKSPACE file tree are intentionally absent: FAVORITES is
 * backed by global state and the WORKSPACE tree only honors the built-in
 * `files.exclude`, so neither reads any `skillMdInspector` setting and a
 * configuration change can never affect them.
 */
export interface ConfigurationRefreshTargets {
  clearResourceCache(): void;
  revalidateVisible(): void;
  refreshSkills(): void;
  refreshInstalledAgents(): void;
  refreshOpenCodeSessions(): void;
}

export interface ConfigurationChange {
  /** Whether the change touched the `skillMdInspector` configuration at all. */
  affectsSkillMdInspector: boolean;
  previous: NavigatorConfigSnapshot;
  next: NavigatorConfigSnapshot;
}

/**
 * Route a `skillMdInspector` configuration change to only the surfaces it
 * affects, keeping the sidebar views independent:
 *
 * - Analysis surfaces (open-editor diagnostics + the Skills panel) depend on a
 *   broad set of settings, so they refresh whenever any `skillMdInspector`
 *   setting changed.
 * - INSTALLED AGENTS and OPENCODE SESSIONS each read one specific setting group;
 *   they refresh only when that group's value actually changed.
 * - FAVORITES and the WORKSPACE file tree read no `skillMdInspector` setting and
 *   are never refreshed here.
 */
export function refreshAfterConfigurationChange(
  change: ConfigurationChange,
  targets: ConfigurationRefreshTargets,
): void {
  if (!change.affectsSkillMdInspector) return;
  targets.clearResourceCache();
  targets.revalidateVisible();
  targets.refreshSkills();
  if (change.next.additionalRoots !== change.previous.additionalRoots)
    targets.refreshInstalledAgents();
  if (change.next.openCode !== change.previous.openCode) targets.refreshOpenCodeSessions();
}
