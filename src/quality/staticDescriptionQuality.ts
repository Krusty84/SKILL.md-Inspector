import { analyzeDescription, type DescriptionAnalysis } from './descriptionHeuristics';
import type { HeuristicDictionaries } from './dictionaries';
import { isProbablyNonEnglish } from './language';
import type {
  StaticDescriptionQualityResult,
  StaticDescriptionQualityFinding,
  StaticDescriptionQualityGradeLimitation,
  StaticDescriptionQualityLabel,
  HeuristicCoverage,
} from '../types/StaticDescriptionQuality';
import type { DescriptionLanguage, StaticDescriptionQualityWeights } from '../types/SkillProfile';
import type { SkillDocument } from '../types/SkillDocument';
import { DiagnosticCode } from '../types/DiagnosticCode';

export interface StaticDescriptionQualityOptions {
  minLength?: number;
  maxLength?: number;
  language?: DescriptionLanguage;
  weights?: StaticDescriptionQualityWeights;
  dictionaries?: HeuristicDictionaries;
}

/** Points allotted to each criterion (brief §10.1). Sum = 100. */
export const CRITERION_POINTS = {
  actionVerb: 20,
  triggerPhrase: 20,
  concreteArtifact: 15,
  boundary: 15,
  frontLoaded: 10,
  lowVagueness: 10,
  goodLength: 10,
} as const;

/** Upper bound of the "good length" band; below `minLength` is penalized. */
const GOOD_LENGTH_MAX = 500;

/** Computes the 0–100 Static Description Quality Score for a raw description. */
export function computeStaticDescriptionQuality(
  description: unknown,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  if (description === undefined) return notScoredResult('description is missing');
  if (description === null) return notScoredResult('description is null');
  if (typeof description !== 'string') return notScoredResult('description is not a string');
  if (description.trim() === '') return notScoredResult('description is empty');
  return scoreAnalysis(analyzeDescription(description, options.dictionaries), options);
}

/** Scores a document while preserving fatal frontmatter parsing context. */
export function assessDocumentDescriptionQuality(
  doc: SkillDocument,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  if (
    doc.frontmatter === null &&
    !doc.parseErrors.some((error) => error.code === DiagnosticCode.FrontmatterMissing)
  ) {
    return notScoredResult('frontmatter could not be parsed');
  }
  return computeStaticDescriptionQuality(doc.frontmatter?.description, options);
}

/** Scores an already-computed analysis (avoids re-analyzing the description). */
export function scoreAnalysis(
  analysis: DescriptionAnalysis,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  const minLength = options.minLength ?? 40;
  const maxLength = options.maxLength ?? 1024;
  // A profile may recommend a minimum above the default band ceiling; the band
  // must never invert ("aim for 600–500").
  const goodLengthMax = Math.min(maxLength, Math.max(GOOD_LENGTH_MAX, minLength));
  const goodLengthMin = Math.min(minLength, goodLengthMax);
  const language = options.language ?? 'auto';
  const languageLimited = language !== 'en' && isProbablyNonEnglish(analysis.trimmed);
  const weights = normalizeWeights(options.weights ?? CRITERION_POINTS);

  const frontLoaded = analysis.frontLoadedIntent.found;
  const boundary = analysis.boundaryClause.contentFound;
  const triggerPoints = clausePoints(analysis.triggerClause, weights.triggerPhrase);
  const boundaryPoints = clausePoints(analysis.boundaryClause, weights.boundary);
  // Each vague term costs half the criterion's weight, so the penalty scales
  // with custom profile weights instead of a hardcoded 5 points.
  const vaguePoints = Math.max(
    0,
    Math.round(weights.lowVagueness - (weights.lowVagueness / 2) * analysis.vagueTerms.length),
  );
  const lengthPoints = scoreLength(
    analysis.length,
    minLength,
    maxLength,
    weights.goodLength,
    goodLengthMax,
  );

  const findings: StaticDescriptionQualityFinding[] = [
    finding(
      'Action verb / capability',
      analysis.actionVerb.found ? weights.actionVerb : 0,
      weights.actionVerb,
      analysis.actionVerb.found
        ? `States the capability with "${analysis.actionVerb.matched}".`
        : 'No action verb — start with a capability such as "format" or "generate".',
      analysis.actionVerb.found ? undefined : 'Lead with a capability verb.',
    ),
    finding(
      'Usage trigger phrase',
      triggerPoints,
      weights.triggerPhrase,
      analysis.triggerClause.contentFound
        ? `Explains when to use the skill ("${analysis.triggerClause.matchedPhrase}").`
        : analysis.triggerClause.markerFound
          ? 'Usage trigger is present, but its scope content is too vague.'
          : 'No usage trigger — add a clause like "Use when ...".',
      analysis.triggerClause.contentFound ? undefined : 'Add "Use when <context>".',
    ),
    finding(
      'Concrete artifact / domain',
      analysis.concreteArtifact ? weights.concreteArtifact : 0,
      weights.concreteArtifact,
      analysis.concreteArtifact
        ? 'Names a concrete artifact or domain.'
        : 'No concrete artifact — say what the skill operates on.',
      analysis.concreteArtifact ? undefined : 'Name the artifact (e.g. "PDF reports").',
    ),
    finding(
      'Boundary phrase',
      boundaryPoints,
      weights.boundary,
      boundary
        ? `Defines a boundary ("${analysis.boundaryClause.matchedPhrase}").`
        : analysis.boundaryClause.markerFound
          ? 'Boundary marker is present, but its scope content is too vague.'
          : 'No boundary — add "Do not use when ...".',
      boundary ? undefined : 'Add a concrete excluded context after the boundary marker.',
    ),
    finding(
      'Front-loaded intent',
      frontLoaded ? weights.frontLoaded : 0,
      weights.frontLoaded,
      frontLoaded
        ? 'States the main capability in the first words.'
        : 'Main capability is not stated up front.',
      frontLoaded ? undefined : 'Put the capability in the first ~10 words.',
    ),
    finding(
      'Low vagueness',
      vaguePoints,
      weights.lowVagueness,
      analysis.vagueTerms.length === 0
        ? 'No vague wording.'
        : `Vague wording: ${analysis.vagueTerms.join(', ')}.`,
      analysis.vagueTerms.length === 0 ? undefined : 'Replace vague words with concrete detail.',
    ),
    finding(
      'Good length',
      lengthPoints,
      weights.goodLength,
      lengthPoints === weights.goodLength
        ? `Length is ${analysis.length} characters.`
        : `Length is ${analysis.length} characters (aim for ${goodLengthMin}–${goodLengthMax}).`,
      lengthPoints === weights.goodLength
        ? undefined
        : `Aim for roughly ${goodLengthMin}–${goodLengthMax} characters.`,
    ),
  ];

  if (languageLimited) {
    findings.push(
      finding(
        'Language support',
        0,
        0,
        'Description does not appear to be English; deterministic semantic analysis (verbs, triggers, vagueness) may be incomplete.',
      ),
    );
  }

  // Normalized weights can be fractional; keep the raw additive score an
  // integer in [0, 100]. Findings remain the transparent source of this total.
  const rawScore = Math.max(
    0,
    Math.min(100, Math.round(findings.reduce((sum, f) => sum + f.pointsEarned, 0))),
  );
  const gradeLimitations = assessGradeLimitations(analysis);
  const adjustedScore = gradeLimitations.reduce(
    (score, limitation) => Math.min(score, limitation.ceiling),
    rawScore,
  );
  const { coverage, limitations } = assessCoverage(analysis, minLength, languageLimited);
  return {
    state: 'scored',
    score: adjustedScore,
    rawScore,
    adjustedScore,
    label: labelFor(adjustedScore),
    findings,
    gradeLimitations,
    coverage,
    limitations,
    ...(languageLimited ? { partial: true } : {}),
  };
}

function notScoredResult(reason: string): StaticDescriptionQualityResult {
  return {
    state: 'not-scored',
    score: null,
    rawScore: null,
    adjustedScore: null,
    label: null,
    notScoredReason: reason,
    findings: [],
    gradeLimitations: [],
    coverage: 'low',
    limitations: [reason],
  };
}

/**
 * Essential completeness is evaluated separately from additive evidence. Each
 * returned limitation is a visible policy ceiling, never a hidden deduction.
 */
function assessGradeLimitations(
  analysis: DescriptionAnalysis,
): StaticDescriptionQualityGradeLimitation[] {
  const limitations: StaticDescriptionQualityGradeLimitation[] = [];

  if (!analysis.actionVerb.found) {
    limitations.push({
      code: 'missing-action-capability',
      ceiling: 59,
      reason: 'No action capability is present, so the adjusted score cannot exceed 59.',
    });
  }
  if (!analysis.concreteArtifact) {
    limitations.push({
      code: 'missing-concrete-artifact',
      ceiling: 59,
      reason: 'No concrete artifact or domain is present, so the adjusted score cannot exceed 59.',
    });
  }
  if (analysis.overbroadTrigger.found) {
    limitations.push({
      code: 'overbroad-usage-scope',
      ceiling: 69,
      reason:
        'The description claims an overbroad usage scope, so the adjusted score cannot exceed 69.',
    });
  }
  if (analysis.instructionHeavy.found) {
    limitations.push({
      code: 'instruction-heavy-description',
      ceiling: 74,
      reason:
        'The frontmatter description embeds detailed procedure that belongs in the Markdown body, so the adjusted score cannot exceed 74.',
    });
  }
  if (analysis.triggerClause.contentFound) {
    return limitations;
  }
  if (analysis.triggerClause.markerFound) {
    limitations.push({
      code: 'vague-usage-trigger',
      ceiling: 74,
      reason:
        'The usage-trigger marker has only vague content, so the adjusted score cannot exceed 74.',
    });
  } else {
    limitations.push({
      code: 'missing-usage-trigger',
      ceiling: 69,
      reason:
        'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
    });
  }

  return limitations;
}

/**
 * Applicability of deterministic checks, not a probability or accuracy estimate.
 */
function assessCoverage(
  analysis: DescriptionAnalysis,
  minLength: number,
  languageLimited: boolean,
): { coverage: HeuristicCoverage; limitations: string[] } {
  const limitations: string[] = [];
  let coverage: HeuristicCoverage = 'high';

  if (analysis.trimmed.length === 0) {
    limitations.push(
      'The description is empty, so the score reflects only missing-field penalties.',
    );
    return { coverage: 'low', limitations };
  }
  if (languageLimited) {
    coverage = 'low';
    limitations.push(
      'The description does not appear to be English, so the semantic checks (action verb, trigger, vagueness) may be unreliable.',
    );
  }
  if (analysis.length < minLength) {
    limitations.push(
      `The description is shorter than the recommended minimum (${minLength} characters), so some signals are weak.`,
    );
    if (coverage === 'high') {
      coverage = 'medium';
    }
  }
  return { coverage, limitations };
}

function clausePoints(clause: DescriptionAnalysis['triggerClause'], maxPoints: number): number {
  if (clause.contentFound) return maxPoints;
  return clause.markerFound ? Math.round(maxPoints * 0.25) : 0;
}

/** Maps a score to its label band (brief §10.1). */
export function labelFor(score: number): StaticDescriptionQualityLabel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 40) return 'weak';
  return 'poor';
}

function scoreLength(
  length: number,
  minLength: number,
  maxLength: number,
  maxPoints: number,
  goodLengthMax: number,
): number {
  if (length > maxLength) {
    return 0;
  }
  if (length >= minLength && length <= goodLengthMax) {
    return maxPoints; // recommended range
  }
  if (length >= Math.floor(minLength * 0.6) && length < minLength) {
    return Math.round(maxPoints * 0.5); // slightly short
  }
  if (length > goodLengthMax) {
    // Graduated: a moderately long description beats a very long one.
    const mid = goodLengthMax + Math.floor((maxLength - goodLengthMax) / 2);
    return length <= mid ? Math.round(maxPoints * 0.6) : Math.round(maxPoints * 0.3);
  }
  return 0; // far too short, or over the profile maximum
}

const WEIGHT_KEYS = [
  'actionVerb',
  'triggerPhrase',
  'concreteArtifact',
  'boundary',
  'frontLoaded',
  'lowVagueness',
  'goodLength',
] as const;

/**
 * Scales criterion weights to integers summing to exactly 100 (largest-remainder
 * rounding; ties broken by criterion order). Integer weights keep every
 * per-criterion point value an integer, which preserves the contract that the
 * findings' `pointsEarned` sum to the score. Integer weight sets already summing
 * to 100 map to themselves.
 */
function normalizeWeights(
  weights: StaticDescriptionQualityWeights,
): StaticDescriptionQualityWeights {
  const total = WEIGHT_KEYS.reduce((sum, key) => sum + weights[key], 0);
  if (total <= 0) {
    return weights; // degenerate profile: every criterion scores 0
  }
  const scaled = WEIGHT_KEYS.map((key) => (weights[key] * 100) / total);
  const floored = scaled.map(Math.floor);
  let remaining = 100 - floored.reduce((sum, value) => sum + value, 0);
  const byRemainder = scaled
    .map((value, index) => ({ index, remainder: value - floored[index] }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const { index } of byRemainder) {
    if (remaining <= 0) {
      break;
    }
    floored[index] += 1;
    remaining -= 1;
  }
  const normalized = {} as Record<(typeof WEIGHT_KEYS)[number], number>;
  WEIGHT_KEYS.forEach((key, index) => {
    normalized[key] = floored[index];
  });
  return normalized;
}

function finding(
  criterion: string,
  pointsEarned: number,
  pointsPossible: number,
  message: string,
  suggestion?: string,
): StaticDescriptionQualityFinding {
  return {
    criterion,
    pointsEarned,
    pointsPossible,
    message,
    ...(suggestion ? { suggestion } : {}),
  };
}
