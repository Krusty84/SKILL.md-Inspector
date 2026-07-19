import * as vscode from 'vscode';
import { resolveProfile } from './profiles';
import type { SkillProfile, DescriptionLanguage, BodyStrictness } from './types/SkillProfile';
import type { SkillDiagnosticSeverity } from './types/SkillDiagnostic';
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
  type HeuristicDictionaries,
  type HeuristicDictionaryValues,
} from './quality/dictionaries';
import { normalizeResourceDirectory } from './validation/validateResources';

export interface AnalysisContext {
  profile: SkillProfile;
  dictionaries: HeuristicDictionaries;
  resourceDirectories: readonly string[];
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
}

export interface ConfigurationWarning {
  setting: string;
  message: string;
}

/** Reads `skillMdInspector.*` settings and resolves the effective profile. */
export function analysisContextFromConfig(
  config: Pick<InspectorConfig, 'profile' | 'heuristicDictionaries' | 'resourceDirectories'>,
): AnalysisContext {
  return {
    profile: config.profile,
    dictionaries: config.heuristicDictionaries,
    resourceDirectories: config.resourceDirectories,
  };
}

export function readConfig(scope?: vscode.Uri): InspectorConfig {
  const cfg = vscode.workspace.getConfiguration('skillMdInspector', scope);
  const profileId = cfg.get<string>('profile', 'generic');
  const dictionaryResolution = resolveHeuristicDictionariesWithWarnings(
    readVisibleDictionaryValues(cfg),
  );
  return {
    enabled: cfg.get<boolean>('validation.enabled', true),
    runOnSave: cfg.get<boolean>('validation.runOnSave', true),
    profile: resolveProfile(profileId, {
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

function readVisibleDictionaryValues(
  cfg: vscode.WorkspaceConfiguration,
): HeuristicDictionaryValues {
  const values: HeuristicDictionaryValues = {};
  for (const key of HEURISTIC_LIST_DICTIONARY_KEYS) {
    values[key] = cfg.get<unknown>(
      `heuristics.dictionaryValues.${key}`,
      DEFAULT_HEURISTIC_DICTIONARIES[key],
    );
  }
  for (const key of HEURISTIC_MAPPING_DICTIONARY_KEYS) {
    values[key] = cfg.get<unknown>(
      `heuristics.dictionaryValues.${key}`,
      DEFAULT_HEURISTIC_DICTIONARIES[key],
    );
  }
  return values;
}
