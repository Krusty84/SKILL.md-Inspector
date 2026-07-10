import type { SkillProfileId } from './SkillProfile';
import type { TriggerQualityLabel } from './TriggerQuality';

export type PortabilityStatus = 'pass' | 'warning' | 'fail';

export interface PortabilityEntry {
  profile: SkillProfileId;
  status: PortabilityStatus;
  notes: string[];
}

export type ResourceNodeKind =
  | 'referenced' // a resource file linked from SKILL.md
  | 'unreferenced' // a resource file that is never linked
  | 'missing' // a relative link with no file on disk
  | 'remote' // a remote URL link
  | 'absolute'; // an absolute local path link

export type ResourceFlag = 'script' | 'binary' | 'large' | 'remote';

export interface ResourceNode {
  /** Relative path (for files) or the raw link target (for remote/absolute). */
  path: string;
  kind: ResourceNodeKind;
  category?: string;
  sizeBytes?: number;
  flags: ResourceFlag[];
}

export interface ResourceGraph {
  nodes: ResourceNode[];
}

export interface WorkspaceSkill {
  name: string;
  /** Path to SKILL.md relative to the workspace root (POSIX). */
  path: string;
  absolutePath: string;
  description: string;
  triggerQualityScore: number;
  triggerQualityLabel: TriggerQualityLabel;
  errors: number;
  warnings: number;
  information: number;
  profile: SkillProfileId;
  profileCompatibility: Record<SkillProfileId, PortabilityStatus>;
  portability: PortabilityEntry[];
  resourceGraph: ResourceGraph;
}

export type CollisionRisk = 'High' | 'Medium' | 'Low';

export interface SkillCollision {
  a: string;
  b: string;
  similarity: number;
  sharedTerms: string[];
  risk: CollisionRisk;
  recommendation: string;
}

export interface WorkspaceAnalysis {
  skills: WorkspaceSkill[];
  collisions: SkillCollision[];
}

export interface SkillsIndexEntry {
  name: string;
  path: string;
  description: string;
  triggerQualityScore: number;
  errors: number;
  warnings: number;
  profileCompatibility: Record<string, PortabilityStatus>;
}

export interface SkillsIndex {
  generatedAt: string;
  skills: SkillsIndexEntry[];
}
