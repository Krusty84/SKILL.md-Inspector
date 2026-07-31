/**
 * Deterministic 0–100 description score: seven weighted criteria plus visible
 * policy ceilings (`gradeLimitations`), never hidden deductions.
 *
 * Known limitation — keyword stuffing. A description that lists capability verbs
 * and artifact nouns without saying anything can still score highly:
 *
 *     Analyze validate generate format convert review data reports files.
 *     Use when analyzing reports for users. Do not use for spreadsheets.
 *
 * Every criterion is satisfied on the surface, and `echoed-scope-content` does
 * not fire because the trigger and boundary name different things. Plan 9 Part B
 * deliberately does not address this: the ceilings it gates are the ones driven
 * by dictionary *misses*, and this description has genuine dictionary evidence.
 * Closing it needs an evidence model that can tell a stated capability from a
 * listed one, which is a separate problem. Recorded here and in docs/rules.md so
 * it is not mistaken for something this module handles.
 */
import * as l10n from '@vscode/l10n';
import { analyzeDescription, type DescriptionAnalysis } from './descriptionHeuristics';
import { DEFAULT_HEURISTIC_DICTIONARIES, type HeuristicDictionaries } from './dictionaries';
import { normalizeContentToken } from './wordForms';
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

/**
 * Names the word the registry does not know and the setting that fixes it, so a
 * vocabulary gap reads as a gap in the tool's configuration rather than as a
 * defect in the user's description (plan 9 Part B3). The quick fix in
 * `src/codeActions/skillCodeActions.ts` performs the same edit in one click.
 */
function unrecognizedVocabularyMessage(
  word: string,
  setting: 'actionVerbs' | 'artifactHints',
): string {
  return setting === 'actionVerbs'
    ? l10n.t(
        'No recognized capability verb; "{0}" reads like one but is not in the configured vocabulary. Add it to skillMdInspector.heuristics.dictionaryValues.actionVerbs to score it fully.',
        word,
      )
    : l10n.t(
        'No recognized concrete artifact; "{0}" reads like one but is not in the configured vocabulary. Add it to skillMdInspector.heuristics.dictionaryValues.artifactHints to score it fully.',
        word,
      );
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

/**
 * The recommended length band for a profile, in code points.
 *
 * A profile may recommend a minimum above the default band ceiling, so the band
 * must never invert ("aim for 600–500"). Exported because
 * `validateDescription`'s `tooVerbose` rule used to carry its own literal `500`,
 * which meant `description.minLength: 600` produced `tooShort` ("aim for at
 * least 600") and `tooVerbose` ("aim for at most 500") on the same range.
 */
export function goodLengthBand(
  minLength: number,
  maxLength: number,
): { min: number; max: number } {
  const max = Math.min(maxLength, Math.max(GOOD_LENGTH_MAX, minLength));
  return { min: Math.min(minLength, max), max };
}

/** Computes the 0–100 Static Description Quality Score for a raw description. */
export function computeStaticDescriptionQuality(
  description: unknown,
  options: StaticDescriptionQualityOptions = {},
): StaticDescriptionQualityResult {
  if (description === undefined) return notScoredResult(l10n.t('description is missing'));
  if (description === null) return notScoredResult(l10n.t('description is null'));
  if (typeof description !== 'string')
    return notScoredResult(l10n.t('description is not a string'));
  if (description.trim() === '') return notScoredResult(l10n.t('description is empty'));
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
    return notScoredResult(l10n.t('frontmatter could not be parsed'));
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
  const { min: goodLengthMin, max: goodLengthMax } = goodLengthBand(minLength, maxLength);
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

  // Structural-only evidence earns half the criterion (plan 9 Part B3): the tool
  // genuinely is less sure than when it matched a configured verb, so the score
  // says so — but it no longer claims the capability is *absent*.
  const capability = analysis.capabilityEvidence;
  const structuralArtifactOnly = !analysis.concreteArtifact && analysis.artifactEvidence.structural;
  const findings: StaticDescriptionQualityFinding[] = [
    finding(
      'Action verb / capability',
      capability.dictionary
        ? weights.actionVerb
        : capability.structural
          ? Math.round(weights.actionVerb / 2)
          : 0,
      weights.actionVerb,
      capability.dictionary
        ? l10n.t('States the capability with "{0}".', String(analysis.actionVerb.matched))
        : capability.structural
          ? unrecognizedVocabularyMessage(capability.structuralTerm ?? '', 'actionVerbs')
          : l10n.t('No action verb — start with a capability such as "format" or "generate".'),
      capability.dictionary
        ? undefined
        : capability.structural
          ? l10n.t(
              'Add "{0}" to skillMdInspector.heuristics.dictionaryValues.actionVerbs.',
              String(capability.structuralTerm),
            )
          : l10n.t('Lead with a capability verb.'),
    ),
    finding(
      'Usage trigger phrase',
      triggerPoints,
      weights.triggerPhrase,
      analysis.triggerClause.contentFound
        ? l10n.t(
            'Explains when to use the skill ("{0}").',
            String(analysis.triggerClause.matchedPhrase),
          )
        : analysis.triggerClause.markerFound
          ? l10n.t('Usage trigger is present, but its scope content is too vague.')
          : l10n.t('No usage trigger — add a clause like "Use when ...".'),
      analysis.triggerClause.contentFound ? undefined : l10n.t('Add "Use when <context>".'),
    ),
    finding(
      'Concrete artifact / domain',
      analysis.concreteArtifact
        ? weights.concreteArtifact
        : structuralArtifactOnly
          ? Math.round(weights.concreteArtifact / 2)
          : 0,
      weights.concreteArtifact,
      analysis.concreteArtifact
        ? l10n.t('Names a concrete artifact or domain.')
        : structuralArtifactOnly
          ? unrecognizedVocabularyMessage(
              analysis.artifactEvidence.structuralTerm ?? '',
              'artifactHints',
            )
          : l10n.t('No concrete artifact — say what the skill operates on.'),
      analysis.concreteArtifact
        ? undefined
        : structuralArtifactOnly
          ? l10n.t(
              'Add "{0}" to skillMdInspector.heuristics.dictionaryValues.artifactHints.',
              String(analysis.artifactEvidence.structuralTerm),
            )
          : l10n.t('Name the artifact (e.g. "PDF reports").'),
    ),
    finding(
      'Boundary phrase',
      boundaryPoints,
      weights.boundary,
      boundary
        ? l10n.t('Defines a boundary ("{0}").', String(analysis.boundaryClause.matchedPhrase))
        : analysis.boundaryClause.markerFound
          ? l10n.t('Boundary marker is present, but its scope content is too vague.')
          : l10n.t('No boundary — add "Do not use when ...".'),
      boundary ? undefined : l10n.t('Add a concrete excluded context after the boundary marker.'),
    ),
    finding(
      'Front-loaded intent',
      frontLoaded ? weights.frontLoaded : 0,
      weights.frontLoaded,
      frontLoaded
        ? l10n.t('States the main capability in the first words.')
        : l10n.t('Main capability is not stated up front.'),
      frontLoaded ? undefined : l10n.t('Put the capability in the first ~10 words.'),
    ),
    finding(
      'Low vagueness',
      vaguePoints,
      weights.lowVagueness,
      analysis.vagueTerms.length === 0
        ? l10n.t('No vague wording.')
        : l10n.t('Vague wording: {0}.', analysis.vagueTerms.join(', ')),
      analysis.vagueTerms.length === 0
        ? undefined
        : l10n.t('Replace vague words with concrete detail.'),
    ),
    finding(
      'Good length',
      lengthPoints,
      weights.goodLength,
      lengthPoints === weights.goodLength
        ? l10n.t('Length is {0} characters.', analysis.length)
        : l10n.t(
            'Length is {0} characters (aim for {1}–{2}).',
            analysis.length,
            goodLengthMin,
            goodLengthMax,
          ),
      lengthPoints === weights.goodLength
        ? undefined
        : l10n.t('Aim for roughly {0}–{1} characters.', goodLengthMin, goodLengthMax),
    ),
  ];

  if (languageLimited) {
    findings.push(
      finding(
        'Language support',
        0,
        0,
        l10n.t(
          'Description does not appear to be English; deterministic semantic analysis (verbs, triggers, vagueness) may be incomplete.',
        ),
      ),
    );
  }

  // Normalized weights can be fractional; keep the raw additive score an
  // integer in [0, 100]. Findings remain the transparent source of this total.
  const rawScore = Math.max(
    0,
    Math.min(100, Math.round(findings.reduce((sum, f) => sum + f.pointsEarned, 0))),
  );
  const gradeLimitations = assessGradeLimitations(
    analysis,
    options.dictionaries ?? DEFAULT_HEURISTIC_DICTIONARIES,
    maxLength,
  );
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
  dictionaries: HeuristicDictionaries,
  maxLength: number,
): StaticDescriptionQualityGradeLimitation[] {
  const limitations: StaticDescriptionQualityGradeLimitation[] = [];

  // A description the specification rejects is not an acceptable description.
  // `scoreLength` already zeroes the length criterion, but that costs only its
  // own weight, which left a hard `skill.description.tooLong` error scoring 90
  // and labelled "excellent" (plan 7 Part B).
  if (analysis.length > maxLength) {
    limitations.push({
      code: 'over-maximum-length',
      ceiling: 59,
      reason: l10n.t(
        'The description exceeds the configured maximum length, which is a specification error, so the adjusted score cannot exceed 59.',
      ),
    });
  }

  // Keyword stuffing defense: when the usage trigger and boundary echo the same
  // scope (e.g. "Use when PDF. Do not use when PDF."), neither clause adds real
  // guidance, so the description must not read as fully specified. A well-formed
  // description always scopes its trigger and boundary to *different* contexts.
  if (scopeContentEchoed(analysis, dictionaries)) {
    limitations.push({
      code: 'echoed-scope-content',
      ceiling: 69,
      reason: l10n.t(
        'The usage trigger and boundary describe the same scope, so neither adds distinguishing guidance; the adjusted score cannot exceed 69.',
      ),
    });
  }

  // An unfinished template must not read as a specified description: a scope
  // clause whose only "content" is an angle-bracket placeholder (the shape the
  // built-in improver emits) marks the description as not yet filled in.
  if (hasUnfilledPlaceholderClause(analysis)) {
    limitations.push({
      code: 'unfilled-placeholder',
      ceiling: 59,
      reason: l10n.t(
        'A scope clause still contains an unfilled template placeholder such as "<trigger context>", so the adjusted score cannot exceed 59.',
      ),
    });
  }

  // Plan 9 Part B3. These two ceilings used to follow from dictionary membership
  // alone, which made "not in my list" proof that the thing is *absent* — an
  // invalid inference no amount of dictionary growth fixes, and the reason a
  // synonym cost two label bands. They now require the absence of *both*
  // dictionary and structural evidence. The criterion still only pays half for
  // structural-only evidence, so the score stays honest about being less sure.
  if (!analysis.capabilityEvidence.dictionary && !analysis.capabilityEvidence.structural) {
    limitations.push({
      code: 'missing-action-capability',
      ceiling: 59,
      reason: l10n.t('No action capability is present, so the adjusted score cannot exceed 59.'),
    });
  }
  if (!analysis.concreteArtifact && !analysis.artifactEvidence.structural) {
    limitations.push({
      code: 'missing-concrete-artifact',
      ceiling: 59,
      reason: l10n.t(
        'No concrete artifact or domain is present, so the adjusted score cannot exceed 59.',
      ),
    });
  }
  if (analysis.overbroadTrigger.found) {
    limitations.push({
      code: 'overbroad-usage-scope',
      ceiling: 69,
      reason: l10n.t(
        'The description claims an overbroad usage scope, so the adjusted score cannot exceed 69.',
      ),
    });
  }
  if (analysis.instructionHeavy.found) {
    limitations.push({
      code: 'instruction-heavy-description',
      ceiling: 74,
      reason: l10n.t(
        'The frontmatter description embeds detailed procedure that belongs in the Markdown body, so the adjusted score cannot exceed 74.',
      ),
    });
  }
  if (analysis.triggerClause.contentFound) {
    return limitations;
  }
  if (analysis.triggerClause.markerFound) {
    limitations.push({
      code: 'vague-usage-trigger',
      ceiling: 74,
      reason: l10n.t(
        'The usage-trigger marker has only vague content, so the adjusted score cannot exceed 74.',
      ),
    });
  } else {
    limitations.push({
      code: 'missing-usage-trigger',
      ceiling: 69,
      reason: l10n.t(
        'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
      ),
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
      l10n.t('The description is empty, so the score reflects only missing-field penalties.'),
    );
    return { coverage: 'low', limitations };
  }
  if (languageLimited) {
    coverage = 'low';
    limitations.push(
      l10n.t(
        'The description does not appear to be English, so the semantic checks (action verb, trigger, vagueness) may be unreliable.',
      ),
    );
  }
  if (analysis.length < minLength) {
    limitations.push(
      l10n.t(
        'The description is shorter than the recommended minimum ({0} characters), so some signals are weak.',
        minLength,
      ),
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

const UNFILLED_PLACEHOLDER = /<[^<>\n]{1,60}>/;

/**
 * True when a scope clause has its marker but its content is nothing except an
 * angle-bracket template placeholder ("Use when <trigger context>"). Real
 * content beside a placeholder does not count as unfilled.
 */
function hasUnfilledPlaceholderClause(analysis: DescriptionAnalysis): boolean {
  return [analysis.triggerClause, analysis.boundaryClause].some(
    (clause) =>
      clause.markerFound &&
      !clause.contentFound &&
      UNFILLED_PLACEHOLDER.test(clause.clauseText ?? ''),
  );
}

/**
 * Meaningful scope tokens, normalized (plural/verb folding) so "PDF" and "PDFs"
 * — or "report" and "reports" — compare equal.
 */
function normalizedScopeTokens(
  clause: DescriptionAnalysis['triggerClause'],
  dictionaries: HeuristicDictionaries,
): Set<string> {
  const vague = new Set(clause.vagueTokens);
  return new Set(
    clause.contentTokens
      .filter((token) => !vague.has(token))
      .map((token) => normalizeContentToken(token, dictionaries)),
  );
}

/** True when every token of `a` is present in `b` (a ⊆ b). */
function isSubsetOf(a: Set<string>, b: Set<string>): boolean {
  for (const token of a) {
    if (!b.has(token)) {
      return false;
    }
  }
  return true;
}

/**
 * True when the trigger and boundary clauses describe the *same* scope, i.e. one
 * clause's normalized meaningful tokens are entirely contained in the other's, so
 * neither adds a distinguishing context ("Use when PDF. Do not use when PDF." and
 * its superset/plural variants). A well-formed description scopes its trigger and
 * boundary to different things, so each keeps at least one token the other lacks
 * ("Python 2" vs "Python 3"). This is the signature of artifact keyword-stuffing.
 */
function scopeContentEchoed(
  analysis: DescriptionAnalysis,
  dictionaries: HeuristicDictionaries,
): boolean {
  const triggerClause = analysis.triggerClause;
  const boundaryClause = analysis.boundaryClause;
  if (!triggerClause.contentFound || !boundaryClause.contentFound) {
    return false;
  }
  // An exclusive trigger ("only use when X") legitimately fills both the trigger
  // and boundary roles from one clause — its boundary marker is the exclusive
  // phrase itself — so it is never an echo.
  if (
    boundaryClause.matchedPhrase !== undefined &&
    dictionaries.exclusiveTriggerPhrases.includes(boundaryClause.matchedPhrase)
  ) {
    return false;
  }
  const trigger = normalizedScopeTokens(triggerClause, dictionaries);
  const boundary = normalizedScopeTokens(boundaryClause, dictionaries);
  if (trigger.size === 0 || boundary.size === 0) {
    return false;
  }
  return isSubsetOf(trigger, boundary) || isSubsetOf(boundary, trigger);
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
