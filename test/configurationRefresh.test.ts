import { describe, expect, it, vi } from 'vitest';
import {
  refreshAfterConfigurationChange,
  type NavigatorConfigSnapshot,
} from '../src/configurationRefresh';

const makeTargets = () => ({
  clearResourceCache: vi.fn(),
  revalidateVisible: vi.fn(),
  refreshSkills: vi.fn(),
  refreshInstalledAgents: vi.fn(),
  refreshOpenCodeSessions: vi.fn(),
});

const snapshot = (overrides: Partial<NavigatorConfigSnapshot> = {}): NavigatorConfigSnapshot => ({
  additionalRoots: '[]',
  openCode: '{}',
  ...overrides,
});

describe('refreshAfterConfigurationChange', () => {
  it('does nothing when the change does not touch skillMdInspector', () => {
    const targets = makeTargets();
    refreshAfterConfigurationChange(
      { affectsSkillMdInspector: false, previous: snapshot(), next: snapshot() },
      targets,
    );
    for (const target of Object.values(targets)) expect(target).not.toHaveBeenCalled();
  });

  it('refreshes analysis surfaces but leaves the sidebar views alone when no navigator setting changed', () => {
    // This models an unrelated skillMdInspector change (or a workspace-folder
    // change that re-fires the event) — INSTALLED AGENTS and OPENCODE must not
    // refresh because their own settings are unchanged.
    const targets = makeTargets();
    refreshAfterConfigurationChange(
      { affectsSkillMdInspector: true, previous: snapshot(), next: snapshot() },
      targets,
    );
    expect(targets.clearResourceCache).toHaveBeenCalledOnce();
    expect(targets.revalidateVisible).toHaveBeenCalledOnce();
    expect(targets.refreshSkills).toHaveBeenCalledOnce();
    expect(targets.refreshInstalledAgents).not.toHaveBeenCalled();
    expect(targets.refreshOpenCodeSessions).not.toHaveBeenCalled();
  });

  it('refreshes INSTALLED AGENTS only when navigator.additionalRoots changed', () => {
    const targets = makeTargets();
    refreshAfterConfigurationChange(
      {
        affectsSkillMdInspector: true,
        previous: snapshot({ additionalRoots: '[]' }),
        next: snapshot({ additionalRoots: '[{"id":"x","path":"~/x"}]' }),
      },
      targets,
    );
    expect(targets.refreshInstalledAgents).toHaveBeenCalledOnce();
    expect(targets.refreshOpenCodeSessions).not.toHaveBeenCalled();
  });

  it('refreshes OPENCODE SESSIONS only when its discovery settings changed', () => {
    const targets = makeTargets();
    refreshAfterConfigurationChange(
      {
        affectsSkillMdInspector: true,
        previous: snapshot({ openCode: '{"scanRecursively":true}' }),
        next: snapshot({ openCode: '{"scanRecursively":false}' }),
      },
      targets,
    );
    expect(targets.refreshOpenCodeSessions).toHaveBeenCalledOnce();
    expect(targets.refreshInstalledAgents).not.toHaveBeenCalled();
  });

  it('does not expose FAVORITES or WORKSPACE refreshers (they have no skillMdInspector config dependency)', () => {
    const targets = makeTargets();
    expect(targets).not.toHaveProperty('refreshFavorites');
    expect(targets).not.toHaveProperty('refreshWorkspace');
  });
});
