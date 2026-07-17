import {
  analyzeDescription,
  type DescriptionAnalysis,
} from './descriptionHeuristics';
import { isProbablyNonEnglish } from './language';
import type {
  StaticDescriptionQualityResult,
  StaticDescriptionQualityFinding,
  StaticDescriptionQualityLabel,
  HeuristicCoverage,
} from '../types/StaticDescriptionQuality';
import type { DescriptionLanguage, StaticDescriptionQualityWeights } from '../types/SkillProfile';

export interface StaticDescriptionQualityOptions {
  minLength?: number;
  maxLength?: number;
  language?: DescriptionLanguage;
  weights?: StaticDescriptionQualityWeights;
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
  description: string,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  return scoreAnalysis(analyzeDescription(description), options);
}

/** Scores an already-computed analysis (avoids re-analyzing the description). */
export function scoreAnalysis(
  analysis: DescriptionAnalysis,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  const minLength = options.minLength ?? 40;
  const maxLength = options.maxLength ?? 1024;
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
  const lengthPoints = scoreLength(analysis.length, minLength, maxLength, weights.goodLength);

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
        : `Length is ${analysis.length} characters (aim for ${minLength}–${GOOD_LENGTH_MAX}).`,
      lengthPoints === weights.goodLength
        ? undefined
        : `Aim for roughly ${minLength}–${GOOD_LENGTH_MAX} characters.`,
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

  // Normalized weights can be fractional; keep the public score an integer in [0, 100].
  const score = Math.max(
    0,
    Math.min(100, Math.round(findings.reduce((sum, f) => sum + f.pointsEarned, 0))),
  );
  const { coverage, limitations } = assessCoverage(analysis, minLength, languageLimited);
  return {
    score,
    label: labelFor(score),
    findings,
    coverage,
    limitations,
    ...(languageLimited ? { partial: true } : {}),
  };
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

function clausePoints(
  clause: DescriptionAnalysis['triggerClause'],
  maxPoints: number,
): number {
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
): number {
  if (length >= minLength && length <= GOOD_LENGTH_MAX) {
    return maxPoints; // recommended range
  }
  if (length >= Math.floor(minLength * 0.6) && length < minLength) {
    return Math.round(maxPoints * 0.5); // slightly short
  }
  if (length > GOOD_LENGTH_MAX && length <= maxLength) {
    // Graduated: a moderately long description beats a very long one.
    const mid = GOOD_LENGTH_MAX + Math.floor((maxLength - GOOD_LENGTH_MAX) / 2);
    return length <= mid ? Math.round(maxPoints * 0.6) : Math.round(maxPoints * 0.3);
  }
  return 0; // far too short, or over the profile maximum
}

/** Scales criterion weights to sum to 100 (a no-op when they already do). */
function normalizeWeights(weights: StaticDescriptionQualityWeights): StaticDescriptionQualityWeights {
  const total =
    weights.actionVerb +
    weights.triggerPhrase +
    weights.concreteArtifact +
    weights.boundary +
    weights.frontLoaded +
    weights.lowVagueness +
    weights.goodLength;
  if (total === 100 || total === 0) {
    return weights;
  }
  const factor = 100 / total;
  return {
    actionVerb: weights.actionVerb * factor,
    triggerPhrase: weights.triggerPhrase * factor,
    concreteArtifact: weights.concreteArtifact * factor,
    boundary: weights.boundary * factor,
    frontLoaded: weights.frontLoaded * factor,
    lowVagueness: weights.lowVagueness * factor,
    goodLength: weights.goodLength * factor,
  };
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
