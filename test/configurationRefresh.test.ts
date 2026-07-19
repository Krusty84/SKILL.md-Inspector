import { describe, expect, it, vi } from 'vitest';
import { refreshAfterConfigurationChange } from '../src/configurationRefresh';

describe('refreshAfterConfigurationChange', () => {
  it('revalidates diagnostics and invalidates every workspace analysis view immediately', () => {
    const targets = {
      clearResourceCache: vi.fn(),
      revalidateVisible: vi.fn(),
      refreshSkills: vi.fn(),
      refreshFavorites: vi.fn(),
      refreshWorkspace: vi.fn(),
      refreshInstalledAgents: vi.fn(),
      refreshOpenCodeSessions: vi.fn(),
    };
    refreshAfterConfigurationChange(targets);
    for (const target of Object.values(targets)) expect(target).toHaveBeenCalledOnce();
  });
});
