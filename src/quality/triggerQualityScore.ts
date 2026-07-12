import { analyzeDescription, isFrontLoaded, type DescriptionAnalysis } from './descriptionHeuristics';
import { isProbablyNonEnglish } from './language';
import type {
  TriggerQualityResult,
  TriggerQualityFinding,
  TriggerQualityLabel,
} from '../types/TriggerQuality';
import type { DescriptionLanguage, TriggerQualityWeights } from '../types/SkillProfile';

export interface TriggerQualityOptions {
  minLength?: number;
  maxLength?: number;
  language?: DescriptionLanguage;
  weights?: TriggerQualityWeights;
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

/** Computes the 0–100 Trigger Quality Score for a raw description. */
export function computeTriggerQuality(
  description: string,
  options: TriggerQualityOptions = {},
): TriggerQualityResult {
  return scoreAnalysis(analyzeDescription(description), options);
}

/** Scores an already-computed analysis (avoids re-analyzing the description). */
export function scoreAnalysis(
  analysis: DescriptionAnalysis,
  options: TriggerQualityOptions = {},
): TriggerQualityResult {
  const minLength = options.minLength ?? 40;
  const maxLength = options.maxLength ?? 1024;
  const language = options.language ?? 'auto';
  const languageLimited = language !== 'en' && isProbablyNonEnglish(analysis.trimmed);
  const weights = normalizeWeights(options.weights ?? CRITERION_POINTS);

  const frontLoaded = isFrontLoaded(analysis.leadingText);
  const boundary = analysis.negativeBoundaryPhrase.found || analysis.exclusiveTriggerPhrase.found;
  const boundaryMatch =
    analysis.negativeBoundaryPhrase.matched ?? analysis.exclusiveTriggerPhrase.matched;
  const vaguePoints = Math.max(0, weights.lowVagueness - 5 * analysis.vagueTerms.length);
  const lengthPoints = scoreLength(analysis.length, minLength, maxLength, weights.goodLength);

  const findings: TriggerQualityFinding[] = [
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
      analysis.positiveTriggerPhrase.found ? weights.triggerPhrase : 0,
      weights.triggerPhrase,
      analysis.positiveTriggerPhrase.found
        ? `Explains when to use the skill ("${analysis.positiveTriggerPhrase.matched}").`
        : 'No usage trigger — add a clause like "Use when ...".',
      analysis.positiveTriggerPhrase.found ? undefined : 'Add "Use when <context>".',
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
      boundary ? weights.boundary : 0,
      weights.boundary,
      boundary
        ? `Defines a boundary ("${boundaryMatch}").`
        : 'No boundary — add "Do not use when ...".',
      boundary ? undefined : 'Add "Do not use when <boundary>".',
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

  const score = findings.reduce((sum, f) => sum + f.pointsEarned, 0);
  return { score, label: labelFor(score), findings, ...(languageLimited ? { partial: true } : {}) };
}

/** Maps a score to its label band (brief §10.1). */
export function labelFor(score: number): TriggerQualityLabel {
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
function normalizeWeights(weights: TriggerQualityWeights): TriggerQualityWeights {
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
): TriggerQualityFinding {
  return { criterion, pointsEarned, pointsPossible, message, ...(suggestion ? { suggestion } : {}) };
}
