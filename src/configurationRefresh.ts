/** Side effects required whenever any skillMdInspector setting changes. */
export interface ConfigurationRefreshTargets {
  clearResourceCache(): void;
  revalidateVisible(): void;
  refreshSkills(): void;
  refreshFavorites(): void;
  refreshWorkspace(): void;
  refreshInstalledAgents(): void;
  refreshOpenCodeSessions(): void;
}

export function refreshAfterConfigurationChange(targets: ConfigurationRefreshTargets): void {
  targets.clearResourceCache();
  targets.revalidateVisible();
  targets.refreshSkills();
  targets.refreshFavorites();
  targets.refreshWorkspace();
  targets.refreshInstalledAgents();
  targets.refreshOpenCodeSessions();
}
