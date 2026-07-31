import * as vscode from 'vscode';
import { resolveProfile } from './profiles';
import type { SkillProfile, DescriptionLanguage, BodyStrictness } from './types/SkillProfile';
import type { AgentId } from './types/AgentCompatibility';
import type { TimestampFormat } from './types/TimestampFormat';
import type { CollisionWeights } from './types/Workspace';
import type { CollisionOptions } from './workspace/detectSkillCollisions';
import {
  DEFAULT_COLLISION_WEIGHTS,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_NGRAM_SIZE,
  DEFAULT_BOUNDARY_SEPARATION_WEIGHT,
  sanitizeCollisionOptions,
} from './workspace/detectSkillCollisions';
import { validateSeverityOverrides } from './validation/severityOverrides';
import { genericProfile } from './profiles/genericProfile';
import { DEFAULT_RESOURCE_EXCLUDES } from './parser/discoverResources';
import { globConfigurationWarnings } from './parser/globMatch';
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
import type { SecuritySettings } from './validation/security';

export interface AnalysisContext {
  profile: SkillProfile;
  dictionaries: HeuristicDictionaries;
  resourceDirectories: readonly string[];
  compatibilityAgents: readonly AgentId[];
  security: SecuritySettings;
  /** Largest bundled resource file that is read and token-counted, in bytes. */
  maxCountedFileSizeBytes: number;
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
  /** Resolved static security-scan settings. */
  security: SecuritySettings;
  /** Largest bundled resource file that is read and token-counted, in bytes. */
  maxCountedFileSizeBytes: number;
  /** Maximum number of collisions listed in the report and tree view. */
  maxReportedCollisions: number;
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
    | 'profile'
    | 'heuristicDictionaries'
    | 'resourceDirectories'
    | 'compatibilityAgents'
    | 'security'
    | 'maxCountedFileSizeBytes'
  >,
): AnalysisContext {
  return {
    profile: config.profile,
    dictionaries: config.heuristicDictionaries,
    resourceDirectories: config.resourceDirectories,
    compatibilityAgents: config.compatibilityAgents,
    security: config.security,
    maxCountedFileSizeBytes: config.maxCountedFileSizeBytes,
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
  const configurationWarnings: ConfigurationWarning[] = [];
  const lengths = readLengthSettings(cfg, configurationWarnings);
  const overrides = validateSeverityOverrides(cfg.get<unknown>('severityOverrides'));
  for (const { key, value } of overrides.invalidValues) {
    configurationWarnings.push({
      setting: 'skillMdInspector.severityOverrides',
      message:
        `Ignoring "${key}": ${JSON.stringify(value)} is not a severity. ` +
        `Use "error", "warning", "information", or "off".`,
    });
  }
  for (const key of overrides.unknownKeys) {
    configurationWarnings.push({
      setting: 'skillMdInspector.severityOverrides',
      message: `"${key}" does not match any diagnostic code, so this override has no effect.`,
    });
  }
  const collision = sanitizeCollisionOptions({
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
  });
  for (const warning of collision.warnings) {
    configurationWarnings.push({
      setting: `skillMdInspector.${warning.setting}`,
      message: warning.message,
    });
  }
  const resourceExclude = cfg.get<string[]>('resources.exclude', [...DEFAULT_RESOURCE_EXCLUDES]);
  const discoveryExclude = cfg.get<string[]>('discovery.exclude', [
    ...DEFAULT_SKILL_DISCOVERY_EXCLUDES,
  ]);
  // A glob the compiler refuses is silently ignored while matching; without this
  // the author would see resources they excluded still being scanned, with no
  // explanation. (Before the guard, it froze the extension host instead.)
  for (const [setting, globs] of [
    ['resources.exclude', resourceExclude],
    ['discovery.exclude', discoveryExclude],
  ] as const) {
    for (const warning of globConfigurationWarnings(globs ?? [])) {
      configurationWarnings.push({
        setting: `skillMdInspector.${setting}`,
        message: warning.message,
      });
    }
  }
  const overriddenDictionaryValues = readOverriddenDictionaryValues(cfg);
  // No overrides -> the packaged defaults BY OBJECT IDENTITY. Resolving would
  // produce content-equal copies (freezeDictionaries copies every array), and
  // the word-form caches key on identity, not content.
  const dictionaryResolution: DictionaryResolution = overriddenDictionaryValues
    ? resolveHeuristicDictionariesWithWarnings(overriddenDictionaryValues)
    : { dictionaries: DEFAULT_HEURISTIC_DICTIONARIES, warnings: [] };
  const securityResolution = buildSecuritySettings(cfg);
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
      nameMaxLength: lengths.nameMaxLength,
      descriptionMinLength: lengths.descriptionMinLength,
      descriptionMaxLength: lengths.descriptionMaxLength,
      descriptionLanguage: cfg.get<DescriptionLanguage>('description.language'),
      bodyStrictness: cfg.get<BodyStrictness>('body.strictness'),
      severityOverrides: overrides.overrides,
      allowSpecificationOverrides: cfg.get<boolean>('severity.allowSpecificationOverrides'),
    }),
    heuristicDictionaries: dictionaryResolution.dictionaries,
    configurationWarnings: [
      ...dictionaryResolution.warnings.map((warning) => ({
        setting: `skillMdInspector.${warning.path}`,
        message: warning.message,
      })),
      ...securityResolution.warnings,
      ...configurationWarnings,
    ],
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
    resourceExclude,
    discoveryExclude,
    nameSimilarityThreshold: cfg.get<number>('names.similarityThreshold', 0.8),
    collision: collision.options,
    security: securityResolution.settings,
    maxReportedCollisions: Math.min(
      100_000,
      Math.max(1, Math.trunc(cfg.get<number>('collision.maxReported', 500)) || 500),
    ),
    maxCountedFileSizeBytes:
      Math.min(
        65536,
        Math.max(1, Math.trunc(cfg.get<number>('tokens.maxCountedFileSizeKb', 1024)) || 1024),
      ) * 1024,
  };
}

function clampOnlineCheckConcurrency(value: number): number {
  return Math.min(10, Math.max(1, Math.trunc(value) || 4));
}

/**
 * Bounds for the profile length settings. Unlike the neighbouring settings these
 * three used to be forwarded verbatim, so `description.maxLength: 0` made every
 * skill in the workspace report `skill.description.tooLong` — a `specification`
 * error, which `severityOverrides` is protected from and cannot switch off.
 *
 * `min` is the smallest value that can be *meant*. A limit below it is treated
 * as unusable configuration and replaced by the packaged default rather than
 * clamped, matching how `clampOnlineCheckConcurrency` and the security file-size
 * setting already handle a 0: clamping 0 up to the floor would keep failing
 * every real description, which is the harm this exists to stop. Above `max` the
 * value is merely extreme, so it is clamped.
 */
const LENGTH_BOUNDS = {
  'name.maxLength': { min: 1, max: 512 },
  // 0 means "no minimum", which is a coherent choice, so the floor is 0.
  'description.minLength': { min: 0, max: 8192 },
  'description.maxLength': { min: 64, max: 8192 },
} as const;

function clampLengthSetting(
  cfg: vscode.WorkspaceConfiguration,
  key: keyof typeof LENGTH_BOUNDS,
  fallback: number,
  warnings: ConfigurationWarning[],
): number {
  const raw = cfg.get<number>(key);
  if (raw === undefined) {
    return fallback;
  }
  const { min, max } = LENGTH_BOUNDS[key];
  if (typeof raw !== 'number' || !Number.isFinite(raw) || Math.trunc(raw) < min) {
    warnings.push({
      setting: `skillMdInspector.${key}`,
      message: `${JSON.stringify(raw)} is not a usable limit (minimum ${min}); using ${fallback}.`,
    });
    return fallback;
  }
  const clamped = Math.min(max, Math.trunc(raw));
  if (clamped !== raw) {
    warnings.push({
      setting: `skillMdInspector.${key}`,
      message: `Value ${raw} is above the maximum ${max}; using ${clamped}.`,
    });
  }
  return clamped;
}

/** Reads the three profile length settings, clamped and de-inverted. */
function readLengthSettings(
  cfg: vscode.WorkspaceConfiguration,
  warnings: ConfigurationWarning[],
): { nameMaxLength: number; descriptionMinLength: number; descriptionMaxLength: number } {
  const nameMaxLength = clampLengthSetting(
    cfg,
    'name.maxLength',
    genericProfile.nameMaxLength,
    warnings,
  );
  let descriptionMinLength = clampLengthSetting(
    cfg,
    'description.minLength',
    genericProfile.description.minLength,
    warnings,
  );
  let descriptionMaxLength = clampLengthSetting(
    cfg,
    'description.maxLength',
    genericProfile.description.maxLength,
    warnings,
  );
  if (descriptionMinLength > descriptionMaxLength) {
    warnings.push({
      setting: 'skillMdInspector.description.minLength',
      message:
        `Minimum ${descriptionMinLength} exceeds maximum ${descriptionMaxLength}; ` +
        `swapping them so no description can be both too short and too long.`,
    });
    [descriptionMinLength, descriptionMaxLength] = [descriptionMaxLength, descriptionMinLength];
  }
  return { nameMaxLength, descriptionMinLength, descriptionMaxLength };
}

/** Lowercases, trims, and drops empty entries from a string-list setting. */
function normalizeLowerList(values: readonly string[] | undefined): string[] {
  return (values ?? [])
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

/**
 * Compiles user-supplied regex sources, skipping (and warning about) any that
 * are invalid so one bad pattern never breaks configuration. A domain suffix is
 * stored verbatim; a command pattern is compiled here so a broken regex is
 * caught at config time, not on every scan.
 */
function compileUserPatterns(
  sources: readonly string[] | undefined,
  settingKey: string,
): { patterns: RegExp[]; warnings: ConfigurationWarning[] } {
  const patterns: RegExp[] = [];
  const warnings: ConfigurationWarning[] = [];
  for (const source of sources ?? []) {
    if (typeof source !== 'string' || source.trim().length === 0) {
      continue;
    }
    try {
      patterns.push(new RegExp(source, 'gi'));
    } catch (error) {
      warnings.push({
        setting: `skillMdInspector.${settingKey}`,
        message: `Ignoring invalid regular expression "${source}": ${
          error instanceof Error ? error.message : String(error)
        }`,
      });
    }
  }
  return { patterns, warnings };
}

/** Resolves the static security-scan settings from `skillMdInspector.security.*`. */
function buildSecuritySettings(cfg: vscode.WorkspaceConfiguration): {
  settings: SecuritySettings;
  warnings: ConfigurationWarning[];
} {
  const risky = compileUserPatterns(
    cfg.get<string[]>('security.additionalRiskyCommands', []),
    'security.additionalRiskyCommands',
  );
  const dangerous = compileUserPatterns(
    cfg.get<string[]>('security.additionalDangerousCommands', []),
    'security.additionalDangerousCommands',
  );
  const maxKb = Math.min(
    4096,
    Math.max(1, Math.trunc(cfg.get<number>('security.maxScannedFileSizeKb', 256)) || 256),
  );
  const settings: SecuritySettings = {
    enabled: cfg.get<boolean>('security.enabled', true),
    scanResourceFiles: cfg.get<boolean>('security.scanResourceFiles', true),
    maxScannedFileSizeBytes: maxKb * 1024,
    allowedDomains: normalizeLowerList(cfg.get<string[]>('security.allowedDomains', [])),
    allowedCommands: normalizeLowerList(cfg.get<string[]>('security.allowedCommands', [])),
    additionalRiskyCommands: risky.patterns,
    additionalDangerousCommands: dangerous.patterns,
    additionalServiceDomains: normalizeLowerList(
      cfg.get<string[]>('security.additionalServiceDomains', []),
    ),
  };
  return { settings, warnings: [...risky.warnings, ...dangerous.warnings] };
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
