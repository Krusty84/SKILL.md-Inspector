import type { SkillProfileId } from './SkillProfile';
import type { SkillDiagnosticSeverity, SkillDiagnosticKind } from './SkillDiagnostic';
import type { StaticDescriptionQualityResult } from './StaticDescriptionQuality';
import type { SkillAuthoringQuality } from '../authoring/authoringQuality';
import type { SkillTokenUsage } from './SkillTokenUsage';
import type {
  AgentId,
  CompatibilityFinding,
  CompatibilityReport,
  CompatibilityVerdict,
} from './AgentCompatibility';

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
  /** Per-agent compatibility projection from the verified capability table. */
  compatibility: CompatibilityReport;
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
  /**
   * Scope agreement: the geometric mean of artifact and capability-group overlap
   * (plan 10). The only metric that models the actual question — do these two
   * skills do the same kind of thing to the same kind of object — rather than
   * lexical surface overlap.
   */
  scopeOverlap: number;
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

/**
 * Weights for blending the collision metrics into the composite score.
 *
 * `scopeOverlap` is optional for backward compatibility: a user's stored
 * `skillMdInspector.collision.weights` object predates it, and a missing key must
 * read as the default rather than as 0 — otherwise everyone who ever customized
 * their weights silently keeps the pre-plan-10 surface-overlap metric. See
 * `normalizeWeights`.
 */
export interface CollisionWeights {
  scopeOverlap?: number;
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

/** An exported agent projection: the report projection minus the display label. */
export interface SkillsIndexAgentProjection {
  agent: AgentId;
  verdict: CompatibilityVerdict;
  findings: CompatibilityFinding[];
  notEvaluatedReason?: string;
}

export interface SkillsIndexCompatibility {
  projections: SkillsIndexAgentProjection[];
  verifiedOn: string;
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
  /** Per-agent compatibility projections without the display labels. */
  compatibility: SkillsIndexCompatibility;
}

export interface SkillsIndex {
  /** Version 7 adds per-agent `compatibility` projections to each skill. */
  schemaVersion: 7;
  generatedAt: string;
  skills: SkillsIndexEntry[];
}
