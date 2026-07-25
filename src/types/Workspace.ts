import type { SkillProfileId } from './SkillProfile';
import type { SkillDiagnosticSeverity, SkillDiagnosticKind } from './SkillDiagnostic';
import type { StaticDescriptionQualityResult } from './StaticDescriptionQuality';
import type { SkillAuthoringQuality } from '../authoring/authoringQuality';
import type { SkillTokenUsage } from './SkillTokenUsage';

/** A compact diagnostic carried into the tree/report models and the exported index (Task 87). */
export interface IndexDiagnostic {
  code: string;
  severity: SkillDiagnosticSeverity;
  kind: SkillDiagnosticKind;
}

export type ValidationStatus = 'pass' | 'warning' | 'fail';

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
  validationStatus: ValidationStatus;
  staticDescriptionQuality: StaticDescriptionQualityResult;
  authoringQuality: SkillAuthoringQuality;
  errors: number;
  warnings: number;
  information: number;
  /** Every diagnostic (code, severity, kind), for the tree/report and index (Task 87). */
  diagnostics: IndexDiagnostic[];
  profile: SkillProfileId;
  resourceGraph: ResourceGraph;
  /** Full o200k_base token metrics (SKILL.md body plus reference and other bundled files). */
  tokenUsage: SkillTokenUsage;
}

export type CollisionRisk = 'High' | 'Medium' | 'Low';

/** How much textual evidence backs a collision result (Task 80). */
export type CollisionConfidence = 'high' | 'medium' | 'low';

/**
 * Whether the text metrics behind a collision had comparable content to work
 * with. Distinct from `CollisionConfidence`: confidence weighs how much the
 * whole result can be trusted, coverage says whether the *text* metrics ran on
 * anything at all.
 */
export type CollisionTextCoverage = 'full' | 'low';

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
  /** How much textual evidence backs the risk assessment — distinct from risk (Task 80). */
  confidence: CollisionConfidence;
  /**
   * `low` when the text metrics had almost nothing to compare (fewer than 3
   * normalized content tokens on either side, typically non-Latin script), so
   * `similarity` reflects the skill names more than the descriptions.
   */
  textCoverage: CollisionTextCoverage;
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
  /** True when the scan stopped early due to cancellation; `skills` is then partial. */
  cancelled: boolean;
}

export interface SkillsIndexEntry {
  name: string;
  path: string;
  description: string;
  validationStatus: ValidationStatus;
  staticDescriptionQuality: StaticDescriptionQualityResult;
  authoringQuality: SkillAuthoringQuality;
  errors: number;
  warnings: number;
  information: number;
  /** The machine-readable rule output: every diagnostic's code, severity, and kind (Task 87). */
  diagnostics: IndexDiagnostic[];
}

export interface SkillsIndex {
  /** Version 6 adds `textCoverage` to collision objects. */
  schemaVersion: 6;
  generatedAt: string;
  skills: SkillsIndexEntry[];
}
