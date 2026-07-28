import * as vscode from 'vscode';
import { resolveProfile } from './profiles';
import type { SkillProfile, DescriptionLanguage, BodyStrictness } from './types/SkillProfile';
import type { AgentId } from './types/AgentCompatibility';
import type { SkillDiagnosticSeverity } from './types/SkillDiagnostic';
import type { TimestampFormat } from './types/TimestampFormat';
import type { CollisionWeights } from './types/Workspace';
import type { CollisionOptions } from './workspace/detectSkillCollisions';
import {
  DEFAULT_COLLISION_WEIGHTS,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_NGRAM_SIZE,
  DEFAULT_BOUNDARY_SEPARATION_WEIGHT,
} from './workspace/detectSkillCollisions';
import { DEFAULT_RESOURCE_EXCLUDES } from './parser/discoverResources';
import { DEFAULT_SKILL_DISCOVERY_EXCLUDES } from './workspace/discoverSkills';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  HEURISTIC_LIST_DICTIONARY_KEYS,
  HEURISTIC_MAPPING_DICTIONARY_KEYS,
  resolveHeuristicDictionariesWithWarnings,
  type DictionaryResolution,
  type HeuristicDictionaries,
  type HeuristicDictionaryValues,
} from './quality/dictionaries';
import { normalizeResourceDirectory } from './validation/validateResources';

export interface AnalysisContext {
  profile: SkillProfile;
  dictionaries: HeuristicDictionaries;
  resourceDirectories: readonly string[];
  compatibilityAgents: readonly AgentId[];
}

export interface InspectorConfig {
  enabled: boolean;
  runOnSave: boolean;
  profile: SkillProfile;
  resourceExclude: string[];
  discoveryExclude: string[];
  nameSimilarityThreshold: number;
  collision: CollisionOptions;
  heuristicDictionaries: HeuristicDictionaries;
  configurationWarnings: readonly ConfigurationWarning[];
  resourceDirectories: string[];
  onlineCheckEnabled: boolean;
  onlineCheckMaxConcurrency: number;
  timeFormat: TimestampFormat;
  /** Agents the compatibility projection evaluates (all enabled by default). */
  compatibilityAgents: readonly AgentId[];
}

/**
 * One checkbox per agent so a future agent added here (and to the capability
 * table) defaults on for every user, including users who toggled the others.
 */
const COMPATIBILITY_AGENT_SETTINGS: readonly { setting: string; agent: AgentId }[] = [
  { setting: 'validation.compatibilityAgents.spec', agent: 'spec' },
  { setting: 'validation.compatibilityAgents.claudeCode', agent: 'claude-code' },
  { setting: 'validation.compatibilityAgents.codex', agent: 'codex' },
  { setting: 'validation.compatibilityAgents.openCode', agent: 'opencode' },
];

export interface ConfigurationWarning {
  setting: string;
  message: string;
}

/** Reads `skillMdInspector.*` settings and resolves the effective profile. */
export function analysisContextFromConfig(
  config: Pick<
    InspectorConfig,
    'profile' | 'heuristicDictionaries' | 'resourceDirectories' | 'compatibilityAgents'
  >,
): AnalysisContext {
  return {
    profile: config.profile,
    dictionaries: config.heuristicDictionaries,
    resourceDirectories: config.resourceDirectories,
    compatibilityAgents: config.compatibilityAgents,
  };
}

/**
 * Effective configurations memoized per workspace-folder scope. Every
 * validation (including the debounced while-typing runs) calls readConfig, so
 * rebuilding the config — and above all re-normalizing the heuristic
 * dictionaries into fresh objects — on each call would defeat every
 * identity-keyed cache downstream (see quality/wordForms.ts). Entries are
 * dropped by {@link invalidateConfigCache} when a `skillMdInspector.*` setting
 * changes.
 */
const configCache = new Map<string, InspectorConfig>();

/** Drops all memoized configurations; call on `onDidChangeConfiguration`. */
export function invalidateConfigCache(): void {
  configCache.clear();
}

export function readConfig(scope?: vscode.Uri): InspectorConfig {
  const cfg = vscode.workspace.getConfiguration('skillMdInspector', scope);
  // Memoization needs inspect() to tell overridden dictionary keys apart from
  // manifest defaults; a harness whose configuration mock lacks inspect() gets
  // the uncached behavior (fresh values on every call), so existing fixtures
  // that swap mocked values between calls keep working.
  const cacheKey = typeof cfg.inspect === 'function' ? scopeCacheKey(scope) : undefined;
  if (cacheKey !== undefined) {
    const cached = configCache.get(cacheKey);
    if (cached) return cached;
  }
  const config = buildConfig(cfg);
  if (cacheKey !== undefined) {
    configCache.set(cacheKey, config);
  }
  return config;
}

/**
 * Configuration values vary only by workspace folder: files sharing a folder
 * share every `skillMdInspector.*` value, and files outside any folder see
 * exactly the global/workspace values that an undefined scope sees.
 */
function scopeCacheKey(scope?: vscode.Uri): string {
  if (!scope) return '';
  const folder =
    typeof vscode.workspace.getWorkspaceFolder === 'function'
      ? vscode.workspace.getWorkspaceFolder(scope)
      : undefined;
  return folder?.uri.toString() ?? '';
}

function buildConfig(cfg: vscode.WorkspaceConfiguration): InspectorConfig {
  const overriddenDictionaryValues = readOverriddenDictionaryValues(cfg);
  // No overrides -> the packaged defaults BY OBJECT IDENTITY. Resolving would
  // produce content-equal copies (freezeDictionaries copies every array), and
  // the word-form caches key on identity, not content.
  const dictionaryResolution: DictionaryResolution = overriddenDictionaryValues
    ? resolveHeuristicDictionariesWithWarnings(overriddenDictionaryValues)
    : { dictionaries: DEFAULT_HEURISTIC_DICTIONARIES, warnings: [] };
  return {
    enabled: cfg.get<boolean>('validation.enabled', true),
    runOnSave: cfg.get<boolean>('validation.runOnSave', true),
    compatibilityAgents: COMPATIBILITY_AGENT_SETTINGS.filter(({ setting }) =>
      cfg.get<boolean>(setting, true),
    ).map(({ agent }) => agent),
    onlineCheckEnabled: cfg.get<boolean>('links.onlineCheck.enabled', false),
    onlineCheckMaxConcurrency: clampOnlineCheckConcurrency(
      cfg.get<number>('links.onlineCheck.maxConcurrency', 4),
    ),
    timeFormat: cfg.get<TimestampFormat>('general.timeFormat', 'european'),
    profile: resolveProfile({
      nameMaxLength: cfg.get<number>('name.maxLength'),
      descriptionMinLength: cfg.get<number>('description.minLength'),
      descriptionMaxLength: cfg.get<number>('description.maxLength'),
      descriptionLanguage: cfg.get<DescriptionLanguage>('description.language'),
      bodyStrictness: cfg.get<BodyStrictness>('body.strictness'),
      severityOverrides:
        cfg.get<Record<string, SkillDiagnosticSeverity | 'off'>>('severityOverrides'),
      allowSpecificationOverrides: cfg.get<boolean>('severity.allowSpecificationOverrides'),
    }),
    heuristicDictionaries: dictionaryResolution.dictionaries,
    configurationWarnings: dictionaryResolution.warnings.map((warning) => ({
      setting: `skillMdInspector.${warning.path}`,
      message: warning.message,
    })),
    resourceDirectories: (
      cfg.get<string[]>('resources.directories', [
        'references',
        'scripts',
        'assets',
        'templates',
      ]) ?? []
    )
      .map(normalizeResourceDirectory)
      .filter((entry): entry is string => Boolean(entry)),
    resourceExclude: cfg.get<string[]>('resources.exclude', [...DEFAULT_RESOURCE_EXCLUDES]),
    discoveryExclude: cfg.get<string[]>('discovery.exclude', [...DEFAULT_SKILL_DISCOVERY_EXCLUDES]),
    nameSimilarityThreshold: cfg.get<number>('names.similarityThreshold', 0.8),
    collision: {
      threshold: cfg.get<number>('collision.threshold', DEFAULT_COLLISION_THRESHOLD),
      ngramSize: cfg.get<number>('collision.ngramSize', DEFAULT_NGRAM_SIZE),
      boundarySeparationWeight: cfg.get<number>(
        'collision.boundarySeparationWeight',
        DEFAULT_BOUNDARY_SEPARATION_WEIGHT,
      ),
      // Merge with defaults so a partial user override never leaves a weight undefined.
      weights: {
        ...DEFAULT_COLLISION_WEIGHTS,
        ...cfg.get<Partial<CollisionWeights>>('collision.weights', {}),
      },
    },
  };
}

function clampOnlineCheckConcurrency(value: number): number {
  return Math.min(10, Math.max(1, Math.trunc(value) || 4));
}

const ALL_DICTIONARY_KEYS = [
  ...HEURISTIC_LIST_DICTIONARY_KEYS,
  ...HEURISTIC_MAPPING_DICTIONARY_KEYS,
] as const;

/**
 * Collects only the dictionary values the user actually overrode, returning
 * undefined when there are none. All 22 keys are declared in package.json, so
 * cfg.get() always answers with a freshly deserialized manifest default — only
 * inspect() can tell an override apart from an untouched key.
 */
function readOverriddenDictionaryValues(
  cfg: vscode.WorkspaceConfiguration,
): HeuristicDictionaryValues | undefined {
  const canInspect = typeof cfg.inspect === 'function';
  let values: HeuristicDictionaryValues | undefined;
  for (const key of ALL_DICTIONARY_KEYS) {
    const settingKey = `heuristics.dictionaryValues.${key}`;
    if (canInspect && !hasNonDefaultValue(cfg.inspect<unknown>(settingKey))) {
      continue;
    }
    const value = cfg.get<unknown>(settingKey, DEFAULT_HEURISTIC_DICTIONARIES[key]);
    // Without inspect(), a harness echoing the passed fallback back means the
    // key is unset; a genuine override is always a distinct object.
    if (!canInspect && value === DEFAULT_HEURISTIC_DICTIONARIES[key]) {
      continue;
    }
    (values ??= {})[key] = value;
  }
  return values;
}

function hasNonDefaultValue(
  info:
    | {
        globalValue?: unknown;
        workspaceValue?: unknown;
        workspaceFolderValue?: unknown;
        defaultLanguageValue?: unknown;
        globalLanguageValue?: unknown;
        workspaceLanguageValue?: unknown;
        workspaceFolderLanguageValue?: unknown;
      }
    | undefined,
): boolean {
  return (
    info !== undefined &&
    (info.globalValue !== undefined ||
      info.workspaceValue !== undefined ||
      info.workspaceFolderValue !== undefined ||
      info.defaultLanguageValue !== undefined ||
      info.globalLanguageValue !== undefined ||
      info.workspaceLanguageValue !== undefined ||
      info.workspaceFolderLanguageValue !== undefined)
  );
}
