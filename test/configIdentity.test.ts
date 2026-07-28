/**
 * readConfig identity guarantees (reactivity work): the debounced while-typing
 * pipeline calls readConfig on every run, and the word-form caches in
 * quality/wordForms.ts key on dictionary OBJECT IDENTITY. These tests pin the
 * two mechanisms that keep those caches hot:
 *   1. untouched installs resolve to DEFAULT_HEURISTIC_DICTIONARIES by identity;
 *   2. the whole InspectorConfig is memoized per scope until
 *      invalidateConfigCache() (wired to onDidChangeConfiguration) drops it.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

interface FakeUri {
  scheme: string;
  fsPath: string;
  toString(): string;
}

const hoisted = vi.hoisted(() => ({
  // folderKey ('' = no folder) -> settingKey -> overridden value
  overrides: new Map<string, Map<string, unknown>>(),
  folders: [] as Array<{ uri: { toString(): string } }>,
  inspectAvailable: true,
}));

function folderKeyFor(scope: { toString(): string } | undefined): string {
  if (!scope) return '';
  const folder = hoisted.folders.find((entry) =>
    scope.toString().startsWith(entry.uri.toString()),
  );
  return folder?.uri.toString() ?? '';
}

vi.mock('vscode', () => ({
  workspace: {
    workspaceFolders: [],
    getWorkspaceFolder: (uri: { toString(): string }) =>
      hoisted.folders.find((entry) => uri.toString().startsWith(entry.uri.toString())),
    getConfiguration: (_section?: string, scope?: { toString(): string }) => {
      const overridesForScope = hoisted.overrides.get(folderKeyFor(scope));
      const cfg: {
        get: (key: string, fallback?: unknown) => unknown;
        inspect?: (key: string) => unknown;
      } = {
        get: (key: string, fallback?: unknown) =>
          overridesForScope?.has(key) ? overridesForScope.get(key) : fallback,
      };
      if (hoisted.inspectAvailable) {
        cfg.inspect = (key: string) =>
          overridesForScope?.has(key)
            ? { key, workspaceValue: overridesForScope.get(key) }
            : { key, defaultValue: undefined };
      }
      return cfg;
    },
  },
}));

import { invalidateConfigCache, readConfig } from '../src/config';
import { DEFAULT_HEURISTIC_DICTIONARIES } from '../src/quality/dictionaries';

function uri(path: string): FakeUri {
  return { scheme: 'file', fsPath: path, toString: () => `file://${path}` };
}

function setOverride(folderKey: string, settingKey: string, value: unknown): void {
  let forScope = hoisted.overrides.get(folderKey);
  if (!forScope) {
    forScope = new Map();
    hoisted.overrides.set(folderKey, forScope);
  }
  forScope.set(settingKey, value);
}

beforeEach(() => {
  hoisted.overrides.clear();
  hoisted.folders = [];
  hoisted.inspectAvailable = true;
  invalidateConfigCache();
});

describe('readConfig dictionary identity', () => {
  it('resolves untouched installs to the packaged dictionaries by identity', () => {
    expect(readConfig().heuristicDictionaries).toBe(DEFAULT_HEURISTIC_DICTIONARIES);
  });

  it('memoizes the whole configuration until invalidated', () => {
    const first = readConfig();
    expect(readConfig()).toBe(first);
    invalidateConfigCache();
    const second = readConfig();
    expect(second).not.toBe(first);
    // Fresh object, same dictionary identity: the word-form caches stay hot.
    expect(second.heuristicDictionaries).toBe(DEFAULT_HEURISTIC_DICTIONARIES);
  });

  it('normalizes overridden keys into copies that stay identity-stable', () => {
    setOverride('', 'heuristics.dictionaryValues.actionVerbs', [' Zip ', 'zip', 'unzip']);
    const config = readConfig();
    expect(config.heuristicDictionaries).not.toBe(DEFAULT_HEURISTIC_DICTIONARIES);
    expect(config.heuristicDictionaries.actionVerbs).toEqual(['zip', 'unzip']);
    // Non-overridden keys keep the packaged content...
    expect(config.heuristicDictionaries.vagueTerms).toEqual(
      DEFAULT_HEURISTIC_DICTIONARIES.vagueTerms,
    );
    // ...and repeated reads serve the very same objects.
    expect(readConfig()).toBe(config);
    expect(readConfig().heuristicDictionaries.actionVerbs).toBe(
      config.heuristicDictionaries.actionVerbs,
    );
  });

  it('serves changed values only after invalidation, matching the configuration event wiring', () => {
    setOverride('', 'heuristics.dictionaryValues.actionVerbs', ['zip']);
    const before = readConfig();
    setOverride('', 'heuristics.dictionaryValues.actionVerbs', ['frobnicate']);
    // Still the memoized snapshot: no onDidChangeConfiguration ran yet.
    expect(readConfig()).toBe(before);
    invalidateConfigCache();
    expect(readConfig().heuristicDictionaries.actionVerbs).toEqual(['frobnicate']);
  });

  it('keeps per-folder overrides on distinct, individually stable configurations', () => {
    const folderA = { uri: { toString: () => 'file:///workspace/a' } };
    const folderB = { uri: { toString: () => 'file:///workspace/b' } };
    hoisted.folders = [folderA, folderB];
    setOverride('file:///workspace/a', 'heuristics.dictionaryValues.actionVerbs', ['frobnicate']);

    const inA = readConfig(uri('/workspace/a/skills/x/SKILL.md') as never);
    const inB = readConfig(uri('/workspace/b/skills/y/SKILL.md') as never);
    expect(inA.heuristicDictionaries.actionVerbs).toEqual(['frobnicate']);
    expect(inB.heuristicDictionaries).toBe(DEFAULT_HEURISTIC_DICTIONARIES);
    expect(readConfig(uri('/workspace/a/skills/x/SKILL.md') as never)).toBe(inA);
    expect(readConfig(uri('/workspace/b/skills/z/SKILL.md') as never)).toBe(inB);
  });

  it('reads fresh values on every call when the harness offers no inspect()', () => {
    hoisted.inspectAvailable = false;
    const first = readConfig();
    // No memoization without inspect(): mocks that swap values between calls
    // (the pre-existing fixture pattern) must keep seeing live values.
    expect(readConfig()).not.toBe(first);
    // A fallback echoed back means "unset", so identity still holds...
    expect(first.heuristicDictionaries).toBe(DEFAULT_HEURISTIC_DICTIONARIES);
    // ...and a changed mock value is honored without any invalidation.
    setOverride('', 'heuristics.dictionaryValues.actionVerbs', ['frobnicate']);
    expect(readConfig().heuristicDictionaries.actionVerbs).toEqual(['frobnicate']);
  });
});
