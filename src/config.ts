import * as vscode from 'vscode';
import { resolveProfile } from './profiles';
import type { SkillProfile, DescriptionLanguage } from './types/SkillProfile';
import { DEFAULT_RESOURCE_EXCLUDES } from './parser/discoverResources';
import type { SkillProfile } from './types/SkillProfile';

export interface InspectorConfig {
  enabled: boolean;
  runOnSave: boolean;
  profile: SkillProfile;
  resourceExclude: string[];
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
    }),
    resourceExclude: cfg.get<string[]>('resources.exclude', [...DEFAULT_RESOURCE_EXCLUDES]),
  };
}
