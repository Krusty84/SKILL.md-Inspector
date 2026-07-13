import * as vscode from 'vscode';
import { resolveProfile } from './profiles';
import type { SkillProfile, DescriptionLanguage, BodyStrictness } from './types/SkillProfile';
import type { CollisionWeights } from './types/Workspace';
import type { CollisionOptions } from './workspace/detectSkillCollisions';
import {
  DEFAULT_COLLISION_WEIGHTS,
  DEFAULT_COLLISION_THRESHOLD,
  DEFAULT_NGRAM_SIZE,
  DEFAULT_BOUNDARY_SEPARATION_WEIGHT,
} from './workspace/detectSkillCollisions';
import { DEFAULT_RESOURCE_EXCLUDES } from './parser/discoverResources';

export interface InspectorConfig {
  enabled: boolean;
  runOnSave: boolean;
  profile: SkillProfile;
  resourceExclude: string[];
  nameSimilarityThreshold: number;
  collision: CollisionOptions;
}

/** Reads `skillMdInspector.*` settings and resolves the effective profile. */
export function readConfig(scope?: vscode.Uri): InspectorConfig {
  const cfg = vscode.workspace.getConfiguration('skillMdInspector', scope);
  const profileId = cfg.get<string>('profile', 'generic');
  return {
    enabled: cfg.get<boolean>('validation.enabled', true),
    runOnSave: cfg.get<boolean>('validation.runOnSave', true),
    profile: resolveProfile(profileId, {
      nameMaxLength: cfg.get<number>('name.maxLength'),
      descriptionMinLength: cfg.get<number>('description.minLength'),
      descriptionMaxLength: cfg.get<number>('description.maxLength'),
      descriptionLanguage: cfg.get<DescriptionLanguage>('description.language'),
      bodyStrictness: cfg.get<BodyStrictness>('body.strictness'),
    }),
    resourceExclude: cfg.get<string[]>('resources.exclude', [...DEFAULT_RESOURCE_EXCLUDES]),
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
