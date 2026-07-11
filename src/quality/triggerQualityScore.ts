import { analyzeDescription, hasActionVerb, type DescriptionAnalysis } from './descriptionHeuristics';
import { isProbablyNonEnglish } from './language';
import type {
  TriggerQualityResult,
  TriggerQualityFinding,
  TriggerQualityLabel,
} from '../types/TriggerQuality';
import type { DescriptionLanguage } from '../types/SkillProfile';

export interface TriggerQualityOptions {
  minLength?: number;
  maxLength?: number;
  language?: DescriptionLanguage;
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

  const frontLoaded = hasActionVerb(analysis.leadingText).found;
  const boundary = analysis.negativeBoundaryPhrase.found || analysis.exclusiveTriggerPhrase.found;
  const boundaryMatch =
    analysis.negativeBoundaryPhrase.matched ?? analysis.exclusiveTriggerPhrase.matched;
  const vaguePoints = Math.max(0, CRITERION_POINTS.lowVagueness - 5 * analysis.vagueTerms.length);
  const lengthPoints = scoreLength(analysis.length, minLength, maxLength);

  const findings: TriggerQualityFinding[] = [
    finding(
      'Action verb / capability',
      analysis.actionVerb.found ? CRITERION_POINTS.actionVerb : 0,
      CRITERION_POINTS.actionVerb,
      analysis.actionVerb.found
        ? `States the capability with "${analysis.actionVerb.matched}".`
        : 'No action verb — start with a capability such as "format" or "generate".',
      analysis.actionVerb.found ? undefined : 'Lead with a capability verb.',
    ),
    finding(
      'Usage trigger phrase',
      analysis.positiveTriggerPhrase.found ? CRITERION_POINTS.triggerPhrase : 0,
      CRITERION_POINTS.triggerPhrase,
      analysis.positiveTriggerPhrase.found
        ? `Explains when to use the skill ("${analysis.positiveTriggerPhrase.matched}").`
        : 'No usage trigger — add a clause like "Use when ...".',
      analysis.positiveTriggerPhrase.found ? undefined : 'Add "Use when <context>".',
    ),
    finding(
      'Concrete artifact / domain',
      analysis.concreteArtifact ? CRITERION_POINTS.concreteArtifact : 0,
      CRITERION_POINTS.concreteArtifact,
      analysis.concreteArtifact
        ? 'Names a concrete artifact or domain.'
        : 'No concrete artifact — say what the skill operates on.',
      analysis.concreteArtifact ? undefined : 'Name the artifact (e.g. "PDF reports").',
    ),
    finding(
      'Boundary phrase',
      boundary ? CRITERION_POINTS.boundary : 0,
      CRITERION_POINTS.boundary,
      boundary
        ? `Defines a boundary ("${boundaryMatch}").`
        : 'No boundary — add "Do not use when ...".',
      boundary ? undefined : 'Add "Do not use when <boundary>".',
    ),
    finding(
      'Front-loaded intent',
      frontLoaded ? CRITERION_POINTS.frontLoaded : 0,
      CRITERION_POINTS.frontLoaded,
      frontLoaded
        ? 'States the main capability in the first words.'
        : 'Main capability is not stated up front.',
      frontLoaded ? undefined : 'Put the capability in the first ~10 words.',
    ),
    finding(
      'Low vagueness',
      vaguePoints,
      CRITERION_POINTS.lowVagueness,
      analysis.vagueTerms.length === 0
        ? 'No vague wording.'
        : `Vague wording: ${analysis.vagueTerms.join(', ')}.`,
      analysis.vagueTerms.length === 0 ? undefined : 'Replace vague words with concrete detail.',
    ),
    finding(
      'Good length',
      lengthPoints,
      CRITERION_POINTS.goodLength,
      lengthPoints === CRITERION_POINTS.goodLength
        ? `Length is ${analysis.length} characters.`
        : `Length is ${analysis.length} characters (aim for ${minLength}–${GOOD_LENGTH_MAX}).`,
      lengthPoints === CRITERION_POINTS.goodLength
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

function scoreLength(length: number, minLength: number, maxLength: number): number {
  if (length >= minLength && length <= GOOD_LENGTH_MAX) {
    return CRITERION_POINTS.goodLength;
  }
  if (length >= Math.floor(minLength * 0.6) && length < minLength) {
    return 5;
  }
  if (length > GOOD_LENGTH_MAX && length <= maxLength) {
    return 5;
  }
  return 0;
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
