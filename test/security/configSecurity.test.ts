/**
 * Resolution of the `skillMdInspector.security.*` settings in readConfig:
 * defaults, allowlist normalization, size-cap clamping, and safe handling of an
 * invalid user regex (skipped with a configuration warning, not a crash).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  overrides: new Map<string, unknown>(),
}));

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: () => undefined,
    getConfiguration: () => ({
      get: (key: string, fallback?: unknown) =>
        hoisted.overrides.has(key) ? hoisted.overrides.get(key) : fallback,
      inspect: (key: string) =>
        hoisted.overrides.has(key)
          ? { key, workspaceValue: hoisted.overrides.get(key) }
          : { key, defaultValue: undefined },
    }),
  },
}));

import { invalidateConfigCache, readConfig } from '../../src/config';

beforeEach(() => {
  hoisted.overrides.clear();
  invalidateConfigCache();
});

describe('security settings resolution', () => {
  it('enables the scan with sensible defaults', () => {
    const { security } = readConfig();
    expect(security.enabled).toBe(true);
    expect(security.scanResourceFiles).toBe(true);
    expect(security.maxScannedFileSizeBytes).toBe(256 * 1024);
    expect(security.allowedDomains).toEqual([]);
    expect(security.additionalDangerousCommands).toEqual([]);
  });

  it('normalizes allowlists to lowercase, trimmed, non-empty entries', () => {
    hoisted.overrides.set('security.allowedDomains', [' Example.COM ', '', 'internal.test']);
    expect(readConfig().security.allowedDomains).toEqual(['example.com', 'internal.test']);
  });

  it('clamps the file-size cap into range', () => {
    hoisted.overrides.set('security.maxScannedFileSizeKb', 100000);
    expect(readConfig().security.maxScannedFileSizeBytes).toBe(4096 * 1024);
  });

  it('compiles valid user command patterns', () => {
    hoisted.overrides.set('security.additionalDangerousCommands', ['deploy .*--force']);
    const { security } = readConfig();
    expect(security.additionalDangerousCommands).toHaveLength(1);
    expect(security.additionalDangerousCommands[0]).toBeInstanceOf(RegExp);
  });

  it('skips an invalid user regex and records a configuration warning', () => {
    hoisted.overrides.set('security.additionalRiskyCommands', ['(unclosed']);
    const config = readConfig();
    expect(config.security.additionalRiskyCommands).toHaveLength(0);
    expect(
      config.configurationWarnings.some((w) =>
        w.setting.includes('security.additionalRiskyCommands'),
      ),
    ).toBe(true);
  });

  it('honors the master disable switch', () => {
    hoisted.overrides.set('security.enabled', false);
    expect(readConfig().security.enabled).toBe(false);
  });
});
