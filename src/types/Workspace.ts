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

/** The individual normalized metrics behind a composite collision score (each 0..1). */
export interface CollisionMetrics {
  /** TF-IDF cosine over the whole corpus (corpus-dependent). */
  cosine: number;
  /** Pairwise token Jaccard — independent of the rest of the corpus. */
  jaccard: number;
  /** Character n-gram cosine (spelling/morphological overlap). */
  charNgram: number;
  /** Normalized name edit-distance similarity. */
  nameSimilarity: number;
  /** Degree to which each skill's scope is excluded by the other's boundaries. */
  boundarySeparation: number;
}

/** Weights for blending the collision metrics into the composite score. */
export interface CollisionWeights {
  jaccard: number;
  cosine: number;
  charNgram: number;
  nameSimilarity: number;
}

export interface SkillCollision {
  a: string;
  b: string;
  /** Composite headline similarity (0..1), rounded to 2 dp for display. */
  similarity: number;
  /** Breakdown of the individual metrics behind `similarity`. */
  metrics: CollisionMetrics;
  sharedTerms: string[];
  risk: CollisionRisk;
  recommendation: string;
}

/** Two or more skills sharing the same `name` (compared case-insensitively). */
export interface NameConflict {
  /** The lower-cased name shared by every entry. */
  normalized: string;
  entries: { name: string; path: string }[];
}

/** Two skills whose names are confusingly similar but not identical. */
export interface SimilarNames {
  a: string;
  b: string;
  aPath: string;
  bPath: string;
  similarity: number;
}

export interface WorkspaceAnalysis {
  skills: WorkspaceSkill[];
  collisions: SkillCollision[];
  nameConflicts: NameConflict[];
  similarNames: SimilarNames[];
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
