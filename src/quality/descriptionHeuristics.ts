import { DEFAULT_HEURISTIC_DICTIONARIES, type HeuristicDictionaries } from './dictionaries';
import { compareInvariant, escapeRegex, phraseRegex, stripMarkerClauses } from './textMatch';
import { buildVerbForms, singularize } from './wordForms';

export interface PhraseMatch {
  found: boolean;
  matched?: string;
}
export interface ScopeClauseAnalysis extends PhraseMatch {
  markerFound: boolean;
  contentFound: boolean;
  contentTokens: string[];
  vagueTokens: string[];
  matchedPhrase?: string;
  matchedOffset?: number;
  clauseText?: string;
}
export interface ArtifactEvidence {
  found: boolean;
  strength: 'none' | 'supported-low-signal' | 'high-signal';
  matchedTerms: string[];
  supportingTerms: string[];
  /**
   * A token *shaped* like a domain term regardless of dictionary membership
   * (plan 9 Part B2): `CamelCase`, a short all-caps code, a filename, a
   * hyphenated compound, or a mid-sentence proper noun. Independent of `found`,
   * which stays dictionary-driven — this is what keeps a dictionary miss from
   * being treated as proof that no artifact was named.
   */
  structural: boolean;
  /** The token that produced `structural`, for the diagnostic that names it. */
  structuralTerm?: string;
}
/**
 * Capability evidence, split by where it came from (plan 9 Part B1).
 *
 * The two are reported separately because they carry different confidence:
 * `dictionary` means a configured capability verb was matched, `structural`
 * means the opening clause is *shaped* like a capability statement using a word
 * the registry does not know. Only the absence of both licenses the
 * `missing-action-capability` ceiling.
 */
export interface CapabilityEvidence {
  dictionary: boolean;
  structural: boolean;
  /** The unrecognized candidate, so a finding can name it and offer to register it. */
  structuralTerm?: string;
}
export interface FrontLoadedIntentResult {
  found: boolean;
  pattern?: 'capability-first' | 'use-when-first' | 'when-asked-first';
  matchedCapability?: string;
  matchedObject?: string;
}
export interface OverbroadTriggerAnalysis extends PhraseMatch {
  matchedPhrases: string[];
}
export interface InstructionHeavyAnalysis {
  found: boolean;
  stepMarkerCount: number;
  numberedClauseCount: number;
  imperativeSentenceCount: number;
  workflowMarkerCount: number;
}
interface LeadingCapabilityMatch extends PhraseMatch {
  tokenIndex?: number;
  position?: 'direct' | 'subject' | 'use-when' | 'when-asked' | 'trigger';
}
export interface DescriptionAnalysis {
  raw: string;
  trimmed: string;
  /**
   * Length in Unicode code points, not UTF-16 code units. An emoji or any other
   * astral character is one character to the author and to every message that
   * quotes this number; counting code units reported 520 of them as "1040
   * characters; the maximum is 1024" — a message wrong in its own terms, on a
   * `specification` error the author cannot switch off.
   */
  length: number;
  wordCount: number;
  leadingText: string;
  actionVerb: PhraseMatch;
  capabilityEvidence: CapabilityEvidence;
  exclusiveTriggerPhrase: PhraseMatch;
  concreteArtifact: boolean;
  artifactEvidence: ArtifactEvidence;
  vagueTerms: string[];
  triggerClause: ScopeClauseAnalysis;
  boundaryClause: ScopeClauseAnalysis;
  frontLoadedIntent: FrontLoadedIntentResult;
  overbroadTrigger: OverbroadTriggerAnalysis;
  instructionHeavy: InstructionHeavyAnalysis;
}

/**
 * The description with its exclusion clauses removed — what the skill says it
 * *does*, as opposed to what it says it does not.
 *
 * Uses the same marker lists the collision layer strips (`boundaryFeatures`), so
 * the two layers agree on where a skill's scope ends.
 */
export function scopeTextOf(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string {
  return stripMarkerClauses(description, [
    ...dictionaries.negativeBoundaryPhrases,
    ...dictionaries.restrictiveBoundaryPhrases,
  ]);
}

/**
 * The description with both its exclusion clauses and its trigger clauses
 * removed — what is left is the capability statement.
 *
 * The capability criterion used to be satisfied by any registered verb in the
 * first two sentences, so the *trigger* clause paid for it: every one of
 * `Extract | Yank | Salvage | Frobnicate | Purple line items from PDF invoices.
 * Use when the user asks to pull structured data out of a scanned invoice.`
 * scored 100/excellent on the strength of `scanned`, a past participle used
 * adjectivally inside the trigger. Narrowing to the first sentence instead was
 * measured and rejected: real shipped skills routinely state the capability
 * across two sentences ("Help submit an expense … Detects the right tool, finds
 * receipts, checks for duplicates"), and it cost the calibration corpus its
 * median. Removing the clause that belongs to another criterion is the precise
 * fix.
 */
export function capabilityTextOf(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string {
  return stripMarkerClauses(scopeTextOf(description, dictionaries), [
    ...dictionaries.positiveTriggerPhrases,
    ...dictionaries.exclusiveTriggerPhrases,
    ...dictionaries.scopeRestrictionPhrases,
  ]);
}

export function analyzeDescription(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): DescriptionAnalysis {
  const raw = description ?? '';
  const trimmed = raw.trim();
  const tokens = tokenize(trimmed);
  const triggerClause = assessScopeClause(trimmed, 'trigger', dictionaries);
  const boundaryClause = assessScopeClause(trimmed, 'boundary', dictionaries);
  // Capability and artifact evidence comes from what the skill says it DOES.
  // The collision layer has stripped exclusion clauses since plan 10; the
  // quality layer never got the same fix, so "Do not use for generating
  // reports." credited the capability `generate` and the artifact `report` — the
  // exact pair the sentence disclaims — and moved a description from 59/weak to
  // 90/excellent. The boundary clause still scores the *boundary* criterion,
  // which reads the full text.
  const scopeText = scopeTextOf(trimmed, dictionaries);
  const capabilityText = capabilityTextOf(trimmed, dictionaries);
  const artifactEvidence = analyzeArtifactEvidence(scopeText, dictionaries);
  const actionVerb = matchDescriptionVerb(trimmed, capabilityText, dictionaries);
  return {
    raw,
    trimmed,
    length: [...trimmed].length,
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
    leadingText: trimmed.split(/\s+/).slice(0, 12).join(' ').toLowerCase(),
    actionVerb,
    capabilityEvidence: analyzeCapabilityEvidence(trimmed, actionVerb, dictionaries),
    exclusiveTriggerPhrase: matchPhrase(trimmed, dictionaries.exclusiveTriggerPhrases),
    concreteArtifact: artifactEvidence.found,
    artifactEvidence,
    vagueTerms: findVagueTerms(trimmed, tokens, dictionaries),
    triggerClause,
    boundaryClause,
    frontLoadedIntent: analyzeFrontLoadedIntent(trimmed, dictionaries),
    overbroadTrigger: analyzeOverbroadTrigger(trimmed, dictionaries),
    instructionHeavy: analyzeInstructionHeavy(trimmed, dictionaries),
  };
}

/**
 * True when a sentence is about *using the skill* (rather than incidentally
 * containing "when the user …"): an explicit "use this skill", a passive
 * "should/must/can/will be used", or a "trigger(s) when" statement.
 *
 * The lead-in verb family covers the phrasings production skills actually use —
 * "Reach for this skill when…", "Consult this skill when…" — because plan 5's
 * precision guard silently cost that recall: any lead-in outside the list made
 * `agentWhenAllowed` reject an unmistakable "when the user" marker (plan 7
 * Part D). Widening it also widens `analyzeOverbroadTrigger`, which is
 * intentional: an overbroad claim is overbroad however it is introduced.
 */
const USAGE_CONTEXT_PATTERN =
  /\b(?:use|using|invoke|activate|select|choose|reach\s+for|consult|refer\s+to|load|read)\s+(?:this|the)\s+skill\b|\b(?:this\s+skill|it)\b[^.!?;]{0,80}\b(?:used|invoked|activated|selected|chosen|considered)\b|\b(?:should|must|can|will)\b[^.!?;]{0,40}\bbe\s+(?:used|invoked|activated|selected|chosen|considered)\b|\btrigger(?:s|ed)?\s+when\b/iu;

export function analyzeOverbroadTrigger(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): OverbroadTriggerAnalysis {
  const sentences = description.match(/[^.!?;\n]+(?:[.!?;]+|$)/g) ?? [];
  const matchedPhrases = dictionaries.overbroadTriggerPhrases.filter((phrase) =>
    sentences.some(
      (sentence) =>
        USAGE_CONTEXT_PATTERN.test(sentence) && overbroadPhraseRegex(phrase).test(sentence),
    ),
  );
  return matchedPhrases.length > 0
    ? { found: true, matched: matchedPhrases[0], matchedPhrases }
    : { found: false, matchedPhrases: [] };
}

export function analyzeInstructionHeavy(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): InstructionHeavyAnalysis {
  const stepMarkerCount = description.match(/\bstep\s+\d+\b/giu)?.length ?? 0;
  const numberedClauseCount = [
    ...description.matchAll(/(?:^|[\n;:]|[,.!?]\s+)\s*\d{1,2}[.)]\s+(?=\p{L})/gu),
  ].length;
  const actionVerbs = new Set(dictionaries.actionVerbs);
  const imperativeSentenceCount = description
    .split(/(?<=[.!?;])\s+|\n+/)
    .map((sentence) =>
      sentence
        .trim()
        .replace(/^step\s+\d+\s*[,.:)-]?\s*/iu, '')
        .replace(/^\d{1,2}[.)]\s*/u, ''),
    )
    .filter((sentence) => {
      const firstToken = sentence.match(/^([\p{L}\p{N}]+)/u)?.[1].toLowerCase();
      return firstToken !== undefined && actionVerbs.has(firstToken);
    }).length;
  // A numbered imperative can satisfy more than one detector; use the largest
  // count so one clause is not counted twice toward the combined threshold.
  const workflowMarkerCount = Math.max(
    stepMarkerCount,
    numberedClauseCount,
    imperativeSentenceCount,
  );
  return {
    found:
      stepMarkerCount >= 4 ||
      numberedClauseCount >= 4 ||
      imperativeSentenceCount >= 6 ||
      (description.trim().length > 500 && workflowMarkerCount >= 3),
    stepMarkerCount,
    numberedClauseCount,
    imperativeSentenceCount,
    workflowMarkerCount,
  };
}

function overbroadPhraseRegex(phrase: string): RegExp {
  const source = phrase
    .split('.*')
    .map((part) =>
      part
        .trim()
        .split(/\s+/)
        .filter(Boolean)
        .map((word) => escapeRegex(word).replace(/'/g, "['’]"))
        .join('\\s+'),
    )
    .join('[^\\n.!?;]{1,160}?');
  return new RegExp(`\\b${source}\\b`, 'iu');
}
export function hasActionVerb(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): PhraseMatch {
  return matchVerb(tokenize(description), dictionaries);
}

/**
 * Word shapes an English predicate plausibly takes. Deliberately permissive on
 * the suffix and strict on everything around it (see `structuralCapability`):
 * the shape alone is weak evidence, and the position is what makes it evidence
 * at all.
 */
const VERBISH_SHAPE = /(?:e|es|s|ify|ise|ize|ate|ing|[bcdfgklmnprtwx])$/i;

/**
 * Ordinary English words that satisfy {@link VERBISH_SHAPE} but are never the
 * verb of a capability statement — colours and common adjectives, which end in
 * the same weak `-e` / consonant the shape test accepts.
 *
 * Without this, "Purple line items from PDF invoices…" read as a stated (if
 * unrecognized) capability, so the whole Extract | Frobnicate | Purple ladder
 * scored alike. This is not a part-of-speech tagger; it is the closed set of
 * words that make the shape test obviously wrong, in the same spirit as
 * `COMMON_UPPERCASE_WORDS` on the artifact side.
 */
const NEVER_CAPABILITY_ADJECTIVES = new Set([
  'purple',
  'orange',
  'yellow',
  'green',
  'blue',
  'violet',
  'white',
  'black',
  'silver',
  'golden',
  'able',
  'ample',
  'brief',
  'calm',
  'clever',
  'eager',
  'fancy',
  'gentle',
  'humble',
  'little',
  'lonely',
  'lovely',
  'mere',
  'nimble',
  'noble',
  'quiet',
  'ripe',
  'sad',
  'simple',
  'subtle',
  'tidy',
  'vast',
  'wise',
]);

/** Bare pronoun/auxiliary openings that are never a capability, whatever follows. */
const NEVER_CAPABILITY = new Set([
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'has',
  'have',
  'had',
  'do',
  'does',
  'did',
  'can',
  'will',
  'would',
  'should',
  'could',
  'may',
  'might',
  'must',
  'it',
  'we',
  'i',
]);

/**
 * Plan 9 Part B1. True when the first sentence opens like a capability statement
 * even though its verb is unknown to the registry: an out-of-dictionary word in
 * the predicate slot, followed closely by something to act on.
 *
 * Four conditions, all required. The first token must not be a function word
 * (that is what rejects "This skill helps with various tasks" and "A helpful
 * skill"), must not be an all-caps acronym, must have a plausible verb shape,
 * and must be followed within three tokens by a non-function word. Together
 * these accept "Pull tables from PDF invoices" and "Frobnicate the widgets for
 * shipment" without accepting a bare noun phrase.
 *
 * This is not a part-of-speech tagger and does not pretend to be one. It is the
 * narrowest signal that distinguishes "the author stated a capability I do not
 * recognize" from "the author stated no capability", which is the only
 * distinction the ceiling needs.
 */
function structuralCapability(
  description: string,
  dictionaries: HeuristicDictionaries,
): string | undefined {
  const leading = description.split(/(?<=[.!?])\s+/)[0] ?? '';
  const rawTokens = leading.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu) ?? [];
  if (rawTokens.length < 2) {
    return undefined;
  }
  const [first = '', ...rest] = rawTokens;
  const candidate = first.toLowerCase();
  const functionWords = new Set([
    ...dictionaries.frontLoadedFillerTerms,
    ...dictionaries.scopeStopwords,
  ]);
  // Vague words are never a capability statement, however verb-shaped they are:
  // "Helps with documents" and "Makes everything better" are the brief's own
  // examples of saying nothing. Compared against the singular/base form too, so
  // "Helps" is caught by the "help" entry that both lists already carry.
  const vagueWords = new Set([...dictionaries.vagueTerms, ...dictionaries.scopeVagueTerms]);
  const isEmpty = (token: string): boolean => {
    const base = singularize(token, dictionaries.irregularSingularForms);
    return (
      functionWords.has(token) ||
      functionWords.has(base) ||
      vagueWords.has(token) ||
      vagueWords.has(base)
    );
  };
  if (
    isEmpty(candidate) ||
    NEVER_CAPABILITY.has(candidate) ||
    NEVER_CAPABILITY_ADJECTIVES.has(candidate)
  ) {
    return undefined;
  }
  // An all-caps opening is a name or an acronym ("PDF reports…"), not a verb.
  // A sentence-capitalized word is the normal imperative shape, so only reject
  // tokens that are *entirely* uppercase.
  if (first.length > 1 && first === first.toUpperCase()) {
    return undefined;
  }
  if (!VERBISH_SHAPE.test(candidate)) {
    return undefined;
  }
  // Something to act on, and it must be substantive: "Makes everything better"
  // has a verb-shaped opening but names nothing, which is the difference between
  // an unrecognized capability and no capability.
  const object = rest
    .slice(0, 3)
    .find((token) => !isEmpty(token.toLowerCase()) && token.length > 1);
  return object ? candidate : undefined;
}

/** Dictionary and structural capability evidence, reported separately. */
export function analyzeCapabilityEvidence(
  description: string,
  actionVerb: PhraseMatch = matchDescriptionVerb(
    description,
    capabilityTextOf(description),
    DEFAULT_HEURISTIC_DICTIONARIES,
  ),
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): CapabilityEvidence {
  if (actionVerb.found) {
    return { dictionary: true, structural: false };
  }
  const structuralTerm = structuralCapability(description, dictionaries);
  return structuralTerm
    ? { dictionary: false, structural: true, structuralTerm }
    : { dictionary: false, structural: false };
}
export function isFrontLoaded(
  leadingText: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): boolean {
  return analyzeFrontLoadedIntent(leadingText, dictionaries).found;
}
export function analyzeFrontLoadedIntent(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): FrontLoadedIntentResult {
  const leading = description.split(/(?<=[.!?])\s+/)[0] ?? '';
  const tokens = tokenize(leading);
  const leadingCapability = matchLeadingCapability(leading, dictionaries);
  const forms = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms).forms;
  const filler = new Set(dictionaries.frontLoadedFillerTerms);
  const capability = leadingCapability.matched;
  const object = tokens
    .slice((leadingCapability.tokenIndex ?? tokens.length) + 1)
    .find(
      (token) =>
        !forms.has(token) &&
        token.length > 2 &&
        !filler.has(token) &&
        !dictionaries.vagueTerms.includes(token),
    );
  const concrete =
    analyzeArtifactEvidence(leading, dictionaries).found || Boolean(object && tokens.length >= 4);
  const prefix =
    leadingCapability.position === 'use-when'
      ? 'use-when-first'
      : leadingCapability.position === 'when-asked'
        ? 'when-asked-first'
        : leadingCapability.position === 'direct' || leadingCapability.position === 'subject'
          ? 'capability-first'
          : undefined;
  if (prefix && capability && concrete) {
    return { found: true, pattern: prefix, matchedCapability: capability, matchedObject: object };
  }
  // Same defect as the ceilings, in a second place (plan 9 Part B): this criterion
  // asks whether the capability is stated *up front*, which is exactly what
  // structural evidence measures, so a word the registry does not know must not
  // read as "no capability in the first words". Without this, "Pull tables from
  // PDF invoices…" loses the front-loaded criterion too and lands at 80 rather
  // than the 90 the plan requires — the synonym penalty, just smaller.
  const structuralTerm = structuralCapability(description, dictionaries);
  if (structuralTerm && !leadingCapability.found) {
    const structuralObject = tokenize(leading)
      .slice(1)
      .find(
        (token) =>
          token.length > 2 && !filler.has(token) && !dictionaries.vagueTerms.includes(token),
      );
    if (structuralObject) {
      return {
        found: true,
        pattern: 'capability-first',
        matchedCapability: structuralTerm,
        matchedObject: structuralObject,
      };
    }
  }
  return { found: false };
}
export function hasPositiveTriggerPhrase(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): PhraseMatch {
  return assessScopeClause(description, 'trigger', dictionaries);
}
export function hasNegativeBoundaryPhrase(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): PhraseMatch {
  return matchPhrase(description, dictionaries.negativeBoundaryPhrases);
}
export function hasExclusiveTriggerPhrase(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): PhraseMatch {
  return matchPhrase(description, dictionaries.exclusiveTriggerPhrases);
}
/**
 * The vague dictionary terms present in `text`, de-duplicated by span.
 *
 * `general` and `general-purpose` are both in the dictionary and both match "a
 * general-purpose formatter", so one adjective was counted twice — enough to
 * zero the whole criterion, with a message naming two problems that are one.
 * When two matched terms occupy the same span, only the longer survives: it is
 * the more specific description of what the author wrote.
 */
export function findVagueTerms(
  text: string,
  tokens: string[] = tokenize(text),
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  const forms = tokenForms(tokens, dictionaries);
  const matched = [...dictionaries.vagueTerms].filter((term) =>
    /^[\p{L}\p{N}]+$/u.test(term) ? forms.has(term) : phraseRegex(term).test(text),
  );
  // Longest first, so a compound claims its span before its own substring can.
  const byLength = [...matched].sort((a, b) => b.length - a.length || (a < b ? -1 : 1));
  const claimed: Array<{ start: number; end: number }> = [];
  const kept: string[] = [];
  for (const term of byLength) {
    const spans = spansOf(text, term);
    // A term with no locatable span matched through morphology (`forms`), not
    // literally; keep it — there is nothing to overlap against.
    if (spans.length === 0) {
      kept.push(term);
      continue;
    }
    const fresh = spans.filter(
      (span) => !claimed.some((taken) => span.start >= taken.start && span.end <= taken.end),
    );
    if (fresh.length === 0) {
      continue;
    }
    claimed.push(...fresh);
    kept.push(term);
  }
  return kept.sort();
}

/** Every whole-word span of `term` in `text`. */
function spansOf(text: string, term: string): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = [];
  for (const match of text.matchAll(phraseRegex(term, 'gi'))) {
    const start = match.index ?? 0;
    spans.push({ start, end: start + match[0].length });
  }
  return spans;
}
function matchVerb(tokens: string[], dictionaries: HeuristicDictionaries): PhraseMatch {
  const forms = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms).forms;
  const token = tokens.find((entry) => forms.has(entry));
  return token ? { found: true, matched: token } : { found: false };
}
/**
 * Capability presence for the action-verb criterion: a positional match in the
 * leading sentence wins; otherwise any capability verb form (gerunds included)
 * within the *first two* sentences counts. A verb buried past the second
 * sentence still reads as "capability not stated up front".
 */
function matchDescriptionVerb(
  description: string,
  capabilityText: string,
  dictionaries: HeuristicDictionaries,
): PhraseMatch {
  // The positional match reads the whole description: a capability stated
  // *inside* a leading trigger ("Use this skill when generating PDF reports")
  // is a stated capability, and `matchLeadingCapability` already distinguishes
  // that position from an incidental mention.
  const match = matchLeadingCapability(description, dictionaries);
  if (match.found) {
    return { found: true, matched: match.matched };
  }
  // The unpositioned fallback reads `capabilityText`, which has the trigger and
  // boundary clauses removed. It used to read the raw first two sentences and so
  // paid the full 20/20 criterion for a verb inside the trigger — every one of
  // `Extract | Yank | Salvage | Frobnicate | Purple line items from PDF
  // invoices. Use when the user asks to pull structured data out of a scanned
  // invoice.` scored 100/excellent on the strength of `scanned`.
  const firstTwoSentences = capabilityText
    .split(/(?<=[.!?])\s+/)
    .slice(0, 2)
    .join(' ');
  return matchVerb(tokenize(firstTwoSentences), dictionaries);
}

function matchLeadingCapability(
  description: string,
  dictionaries: HeuristicDictionaries,
): LeadingCapabilityMatch {
  const leading = description.split(/(?<=[.!?])\s+/)[0] ?? '';
  const tokens = tokenize(leading);
  const { forms } = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms);
  // Gerund-led openings ("Formatting PDF invoices…") count as a stated
  // capability. A gerund noun phrase ("Formatting rules for authors") is
  // lexically indistinguishable and is accepted as capability evidence too.
  const candidate = (
    tokenIndex: number,
    position: LeadingCapabilityMatch['position'],
  ): LeadingCapabilityMatch | undefined => {
    const token = tokens[tokenIndex];
    if (!token || !forms.has(token)) {
      return undefined;
    }
    return { found: true, matched: token, tokenIndex, position };
  };
  const startsWith = (prefix: readonly string[]): boolean =>
    prefix.every((token, index) => tokens[index] === token);
  const subjectFrame = (): LeadingCapabilityMatch | undefined => {
    // a/an/this (skill|tool|toolkit) [that|which] <verb>
    if (!['a', 'an', 'this'].includes(tokens[0] ?? '')) return undefined;
    if (!['skill', 'tool', 'toolkit'].includes(tokens[1] ?? '')) return undefined;
    const verbIndex = tokens[2] === 'that' || tokens[2] === 'which' ? 3 : 2;
    return candidate(verbIndex, 'subject');
  };
  const after = (
    prefix: readonly string[],
    position: LeadingCapabilityMatch['position'],
  ): LeadingCapabilityMatch | undefined => {
    if (!startsWith(prefix)) return undefined;
    const start = prefix.length;
    const frames = [
      [] as string[],
      ['the', 'user', 'needs', 'to'],
      ['the', 'user', 'asks', 'to'],
      ['the', 'user', 'wants', 'to'],
      ['asked', 'to'],
    ];
    for (const frame of frames) {
      if (frame.every((token, index) => tokens[start + index] === token)) {
        const match = candidate(start + frame.length, position);
        if (match) return match;
      }
    }
    return undefined;
  };

  return (
    candidate(0, 'direct') ??
    subjectFrame() ??
    after(['use', 'this', 'skill', 'when'], 'use-when') ??
    after(['use', 'this', 'skill', 'whenever'], 'use-when') ??
    after(['use', 'this', 'when'], 'use-when') ??
    after(['use', 'this', 'whenever'], 'use-when') ??
    after(['use', 'when'], 'use-when') ??
    after(['use', 'whenever'], 'use-when') ??
    after(['when', 'asked', 'to'], 'when-asked') ??
    after(['only', 'use', 'when'], 'trigger') ??
    after(['trigger', 'when'], 'trigger') ?? { found: false }
  );
}
function matchPhrase(text: string, phrases: readonly string[]): PhraseMatch {
  const matched = [...phrases].sort().find((phrase) => phraseRegex(phrase).test(text));
  return matched ? { found: true, matched } : { found: false };
}
interface Candidate extends ScopeClauseAnalysis {
  marker: string;
  absoluteOffset: number;
}

/**
 * Built-in scope-marker grammar (plan 2 Part B). The dictionary phrase lists
 * remain fully honored as *additive* configuration; these patterns recognize the
 * marker shapes an exact-phrase list cannot enumerate ("use this skill
 * whenever…", "should be used when…", "designed for…", "triggers include…").
 */
/** Shared usage-verb family; positive and negated grammars stay symmetric (plan 5 Part A). */
const USAGE_VERB_CORE = String.raw`use[ds]?|using|invoke[ds]?|invoking|appl(?:y|ies|ied|ying)|trigger(?:s|ed)?|runs?|ran`;
const USAGE_VERB = String.raw`(?:${USAGE_VERB_CORE})`;
/** The negated grammar also covers the remaining gerunds ("avoid running when…"). */
const NEGATED_USAGE_VERB = String.raw`(?:${USAGE_VERB_CORE}|running|triggering)`;
const SAME_SENTENCE_GAP = String.raw`[^.!?;\n]{0,60}?`;
const NEGATION = String.raw`(?:do\s+not|don['’]t|never|should\s+not|shouldn['’]t|must\s+not|mustn['’]t|cannot|can['’]t|won['’]t|avoid(?:s|ed|ing)?|not(?:\s+to)?\s+be)`;
/**
 * Scope conjunctions a usage clause can hang off. Longer forms precede their
 * prefixes so the alternation never truncates a match ("whenever" before
 * "when"). `any time`, `in cases where`, `wherever`, and `on any` are the
 * phrasings real skills use that an exact-phrase list never enumerated (plan 7
 * Part D).
 *
 * Bare `on` is deliberately absent even though the negated grammar accepts it:
 * "Operates on large files" describes behavior, not usage scope, so only the
 * narrower `on any` is recognized. "Trigger on spreadsheet requests" therefore
 * stays unrecognized — a known gap, not an oversight.
 */
const SCOPE_CONJUNCTION = String.raw`(?:whenever|when|wherever|for|if|any\s?time|in\s+cases?\s+where|on\s+any)`;
/** `<usage verb> … <scope conjunction>` within one sentence. */
const POSITIVE_USAGE_GRAMMAR = new RegExp(
  String.raw`\b${USAGE_VERB}\b${SAME_SENTENCE_GAP}\b${SCOPE_CONJUNCTION}\b`,
  'giu',
);
/** `designed/intended/ideal/best/suitable/appropriate for`. */
const QUALIFIED_FOR_GRAMMAR = /\b(?:designed|intended|ideal|best|suitable|appropriate)\s+for\b/giu;
const TRIGGERS_INCLUDE_GRAMMAR = /\btriggers?\s+include\b/giu;
/** Bare agent-condition markers; usage-context guarded (plan 2 Part C). */
const AGENT_WHEN_GRAMMAR = /\bwhen(?:ever)?\s+(?:the\s+user|claude|you|asked)\b/giu;
/**
 * `<negation> … <usage verb> … <scope conjunction>` within one sentence. Does
 * double duty: negated-span *exclusion* for trigger detection and *boundary*
 * grammar source, so "Never invoke for merge commits" both loses trigger credit
 * and gains a boundary through this one pattern.
 */
const NEGATIVE_USAGE_GRAMMAR = new RegExp(
  String.raw`\b${NEGATION}\b${SAME_SENTENCE_GAP}\b${NEGATED_USAGE_VERB}\b${SAME_SENTENCE_GAP}\b(?:whenever|when|for|if|on)\b`,
  'giu',
);
/**
 * A `for`-conjunction followed by a quantity/duration/size expression describes
 * behavior ("Runs for 10 minutes"), not usage scope (plan 5 Part B).
 */
const DURATION_AFTER_FOR =
  /^\s*(?:up\s+to\s+|about\s+|around\s+)?\d+(?:\.\d+)?\s*(?:seconds?|secs?|minutes?|mins?|hours?|hrs?|days?|weeks?|ms|kb|mb|gb|tb|files?|rows?|pages?|items?)\b/i;
/**
 * Bare third-person usage verbs describe what the tool does ("Applies fixes
 * if…"), so they only count as triggers in sentences with explicit usage
 * context. Imperative/base forms and passives stay unguarded (plan 5 Part B).
 */
const THIRD_PERSON_USAGE = new Set(['uses', 'runs', 'applies', 'invokes', 'triggers']);
/** Unfilled template placeholders never count as scope content. */
const PLACEHOLDER_SPAN = /<[^<>\n]{1,60}>/g;

interface SentenceSpan {
  start: number;
  end: number;
}

/** Sentence extents using the clause-terminator convention (`.` only before whitespace/end). */
function sentenceSpans(text: string): SentenceSpan[] {
  const spans: SentenceSpan[] = [];
  let start = 0;
  for (const match of text.matchAll(/[!?;\n]|\.(?=\s|$)/g)) {
    const end = (match.index ?? 0) + match[0].length;
    spans.push({ start, end });
    start = end;
  }
  if (start < text.length) {
    spans.push({ start, end: text.length });
  }
  return spans;
}

function sentenceContaining(
  index: number,
  sentences: readonly SentenceSpan[],
): SentenceSpan | undefined {
  return sentences.find((span) => index >= span.start && index < span.end);
}

function hasUsageContextAt(
  description: string,
  index: number,
  sentences: readonly SentenceSpan[],
): boolean {
  const sentence = sentenceContaining(index, sentences);
  if (!sentence) {
    return false;
  }
  return USAGE_CONTEXT_PATTERN.test(description.slice(sentence.start, sentence.end));
}

/**
 * A bare `when the user` / `when claude`-style marker only counts as a usage
 * trigger when its sentence is about using the skill: either the marker opens
 * the sentence ("When asked to…", "When Claude needs…") or the sentence carries
 * explicit usage context. "The tool crashes when the user provides malformed
 * frames" earns nothing.
 */
function agentWhenAllowed(
  description: string,
  index: number,
  sentences: readonly SentenceSpan[],
): boolean {
  const sentence = sentenceContaining(index, sentences);
  if (!sentence) {
    return true;
  }
  if (description.slice(sentence.start, index).trim() === '') {
    return true;
  }
  return USAGE_CONTEXT_PATTERN.test(description.slice(sentence.start, sentence.end));
}

/**
 * Every phrase that bounds the described scope, for the boundary criterion.
 *
 * This deliberately includes `scopeRestrictionPhrases` ("only for X", "limited
 * to X") while the collision layer's exclusion set deliberately excludes them
 * (plan 7 Part A). Both are correct for their own question: "Only for PDF files"
 * *does* bound what the skill covers, so it earns the boundary criterion here,
 * but it does not say PDF is *excluded*, so it must not separate two colliding
 * PDF skills over in `workspace/collisionFeatures.ts`. Do not unify the two.
 */
function boundaryMarkers(dictionaries: HeuristicDictionaries): string[] {
  return [
    ...dictionaries.negativeBoundaryPhrases,
    ...dictionaries.restrictiveBoundaryPhrases,
    ...dictionaries.scopeRestrictionPhrases,
  ];
}

export function assessScopeClause(
  description: string,
  kind: 'trigger' | 'boundary',
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): ScopeClauseAnalysis {
  const markers = [
    ...new Set(
      kind === 'trigger'
        ? [...dictionaries.positiveTriggerPhrases, ...dictionaries.exclusiveTriggerPhrases]
        : [...boundaryMarkers(dictionaries), ...dictionaries.exclusiveTriggerPhrases],
    ),
  ].sort();
  const excluded = kind === 'trigger' ? boundaryMarkers(dictionaries) : [];
  // Negated-usage spans exclude any positive marker they cover, so "should not
  // be used when X" never earns positive-trigger credit through the grammar.
  const negatedSpans = kind === 'trigger' ? [...description.matchAll(NEGATIVE_USAGE_GRAMMAR)] : [];
  const sentences = sentenceSpans(description);
  const allowed = (marker: string, index: number, end: number): boolean => {
    if (
      excluded.some((negative) =>
        phraseRegex(negative, 'i').test(
          description.slice(Math.max(0, index - negative.length - 2), end),
        ),
      )
    ) {
      return false;
    }
    if (
      negatedSpans.some((span) => {
        const spanStart = span.index ?? 0;
        return index < spanStart + span[0].length && spanStart < end;
      })
    ) {
      return false;
    }
    if (kind === 'trigger' && /^when\b/i.test(marker)) {
      return agentWhenAllowed(description, index, sentences);
    }
    return true;
  };
  const bySpan = new Map<string, { marker: string; index: number; end: number }>();
  const add = (marker: string, index: number, end: number): void => {
    if (!allowed(marker, index, end)) {
      return;
    }
    const key = `${index}:${end}`;
    if (!bySpan.has(key)) {
      bySpan.set(key, { marker, index, end });
    }
  };
  for (const marker of markers)
    for (const match of description.matchAll(phraseRegex(marker, 'gi'))) {
      const index = match.index ?? 0;
      add(marker, index, index + match[0].length);
    }
  const grammarSources =
    kind === 'trigger'
      ? [
          POSITIVE_USAGE_GRAMMAR,
          QUALIFIED_FOR_GRAMMAR,
          TRIGGERS_INCLUDE_GRAMMAR,
          AGENT_WHEN_GRAMMAR,
        ]
      : [NEGATIVE_USAGE_GRAMMAR];
  for (const source of grammarSources)
    for (const match of description.matchAll(source)) {
      const index = match.index ?? 0;
      const end = index + match[0].length;
      // Behavior-statement guards (plan 5 Part B): "Runs for 10 minutes" and
      // "Applies fixes if…" describe what the tool does, not when to use it.
      if (
        (source === POSITIVE_USAGE_GRAMMAR || source === QUALIFIED_FOR_GRAMMAR) &&
        /\bfor$/i.test(match[0]) &&
        DURATION_AFTER_FOR.test(description.slice(end))
      ) {
        continue;
      }
      if (source === POSITIVE_USAGE_GRAMMAR) {
        const verb = match[0].match(/^\p{L}+/u)?.[0].toLowerCase() ?? '';
        if (THIRD_PERSON_USAGE.has(verb) && !hasUsageContextAt(description, index, sentences)) {
          continue;
        }
      }
      add(match[0].toLowerCase().replace(/\s+/g, ' '), index, end);
    }
  const occurrences = [...bySpan.values()];
  const candidates = occurrences
    .map((occurrence): Candidate => {
      const nextMarker =
        occurrences
          .filter((other) => other.index > occurrence.index)
          .map((other) => other.index)
          .sort((a, b) => a - b)[0] ?? Infinity;
      const terminator = /(?:[!?;\n]|\.(?=\s|$))/.exec(description.slice(occurrence.end));
      const end = Math.min(
        nextMarker,
        terminator ? occurrence.end + terminator.index : Infinity,
        description.length,
      );
      // Strip English contraction/possessive suffixes before tokenizing, so
      // "it's" no longer leaves a stray "s" token that would upgrade a vague
      // trigger. This is surgical: unlike dropping every single-character token,
      // it keeps legitimate one-character content such as digits ("Python 2" vs
      // "Python 3") and single-letter languages ("R", "C").
      const clauseText = description
        .slice(occurrence.end, end)
        .trim()
        .replace(/['’](?:s|t|re|ve|ll|d|m)\b/gi, '');
      // Single-token evidence needs the original casing: ambiguous acronyms (STEP, CI)
      // only count when written in uppercase, which tokenize() would erase.
      // Unfilled template placeholders ("<trigger context>") are stripped first:
      // the marker may be found, but a placeholder is never scope content.
      const stopwords = new Set(dictionaries.scopeStopwords);
      const scopeVagueTerms = new Set(dictionaries.scopeVagueTerms);
      const pairs = (clauseText.replace(PLACEHOLDER_SPAN, ' ').match(/[\p{L}\p{N}]+/gu) ?? [])
        .map((raw) => ({ raw, lower: raw.toLowerCase() }))
        .filter((pair) => !stopwords.has(pair.lower));
      const contentTokens = pairs.map((pair) => pair.lower);
      const vagueTokens = contentTokens.filter(
        (token) => scopeVagueTerms.has(token) || dictionaries.vagueTerms.includes(token),
      );
      const meaningful = pairs.filter((pair) => !vagueTokens.includes(pair.lower));
      const single = meaningful[0];
      const contentFound =
        meaningful.length >= 2 ||
        (meaningful.length === 1 &&
          (!dictionaries.uppercaseOnlyAcronyms.includes(single.lower) ||
            analyzeArtifactEvidence(single.raw, dictionaries).found));
      return {
        found: true,
        markerFound: true,
        contentFound,
        contentTokens,
        vagueTokens,
        matched: occurrence.marker,
        matchedPhrase: occurrence.marker,
        matchedOffset: occurrence.index,
        clauseText,
        marker: occurrence.marker,
        absoluteOffset: occurrence.index,
      };
    })
    .sort(
      (a, b) =>
        Number(b.contentFound) - Number(a.contentFound) ||
        a.absoluteOffset - b.absoluteOffset ||
        compareInvariant(a.marker, b.marker),
    );
  const selected = candidates[0];
  return (
    selected ?? {
      found: false,
      markerFound: false,
      contentFound: false,
      contentTokens: [],
      vagueTokens: [],
    }
  );
}
export function analyzeArtifactEvidence(
  text: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): ArtifactEvidence {
  const tokens = tokenize(text);
  const forms = tokenForms(tokens, dictionaries);
  const normalized = normalizeSeparators(text);
  const low = new Set(dictionaries.lowSignalArtifactTerms);
  const uppercaseOnly = new Set(dictionaries.uppercaseOnlyAcronyms);
  const highTerms = dictionaries.artifactHints.filter(
    (term) =>
      !low.has(term) &&
      (!uppercaseOnly.has(term) || acronymMatches(text, term, dictionaries.uppercaseOnlyAcronyms)),
  );
  const matchedTerms = highTerms.filter(
    (term) => phraseMatchesNormalized(normalized, term) || forms.has(term),
  );
  const phraseTerms = dictionaries.multiWordArtifacts.filter((term) =>
    phraseMatchesNormalized(normalized, term),
  );
  const acronymTerms = dictionaries.acronyms.filter((term) =>
    acronymMatches(text, term, dictionaries.uppercaseOnlyAcronyms),
  );
  matchedTerms.push(...phraseTerms, ...acronymTerms);
  if (matchesFilename(text)) matchedTerms.push('file extension');
  const structuralTerm = structuralArtifact(text, dictionaries);
  const unique = [...new Set(matchedTerms)].sort();
  if (unique.length)
    return {
      found: true,
      strength: 'high-signal',
      matchedTerms: unique,
      supportingTerms: [],
      structural: structuralTerm !== undefined,
      ...(structuralTerm ? { structuralTerm } : {}),
    };
  const lows = [...low].filter((term) => forms.has(term));
  const supports = tokens.filter(
    (token) =>
      token.length > 2 &&
      !low.has(token) &&
      (dictionaries.acronyms.some(
        (term) => term === token && acronymMatches(text, term, dictionaries.uppercaseOnlyAcronyms),
      ) ||
        dictionaries.artifactSupportTerms.includes(token)),
  );
  const structural = structuralTerm !== undefined;
  return lows.length && supports.length
    ? {
        found: true,
        strength: 'supported-low-signal',
        matchedTerms: lows.sort(),
        supportingTerms: [...new Set(supports)].sort(),
        structural,
        ...(structuralTerm ? { structuralTerm } : {}),
      }
    : {
        found: false,
        strength: 'none',
        matchedTerms: [],
        supportingTerms: [],
        structural,
        ...(structuralTerm ? { structuralTerm } : {}),
      };
}

/**
 * Extensions common enough that `word.ext` is a filename rather than a sentence
 * that happens to contain a dot. Kept deliberately short: the point is to stop
 * treating any dotted pair as evidence, not to enumerate every format.
 */
const KNOWN_EXTENSIONS = new Set([
  'md',
  'markdown',
  'txt',
  'json',
  'jsonc',
  'yaml',
  'yml',
  'toml',
  'ini',
  'env',
  'csv',
  'tsv',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'js',
  'jsx',
  'ts',
  'tsx',
  'py',
  'rb',
  'go',
  'rs',
  'java',
  'kt',
  'swift',
  'c',
  'h',
  'cpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'sql',
  'graphql',
  'proto',
  'pdf',
  'docx',
  'doc',
  'dotx',
  'xlsx',
  'xls',
  'xlsm',
  'xltx',
  'pptx',
  'ppt',
  'potx',
  'png',
  'jpg',
  'jpeg',
  'gif',
  'svg',
  'webp',
  'tiff',
  'ico',
  'mp3',
  'mp4',
  'wav',
  'zip',
  'tar',
  'gz',
  'log',
  'lock',
  'cfg',
  'conf',
  'ipynb',
  'parquet',
  'sqlite',
  'db',
  'step',
  'stl',
  'dxf',
  'dwg',
  'iges',
  'igs',
  'obj',
  'stp',
]);

/**
 * Plan 9 Part B2. The old `/\.(?!\d+\b)[a-z0-9]{2,4}\b/i` counted *any* dotted
 * pair as artifact evidence, so "Process foo.bar items" cleared the
 * concrete-artifact ceiling — an escape hatch wide enough for vacuous prose.
 *
 * Now a dot only counts as a filename when it is either a standalone extension
 * (`.pdf`, with no word character before the dot) or a `word.ext` pair whose
 * extension is a known one. `keybindings.json` and `CLAUDE.md` still match;
 * `foo.bar` and version numbers like `3.14` do not.
 *
 * The stem is capped at 64 characters so the scan stays linear: an unbounded
 * stem backtracks quadratically on long unbroken letter runs, which freezes
 * analysis on pasted-blob descriptions. A longer stem still matches on its
 * trailing 64 characters, so classification is unchanged for real filenames.
 */
function matchesFilename(text: string): boolean {
  for (const match of text.matchAll(/(\p{L}[\p{L}\p{N}_-]{0,63})?\.([a-z0-9]{1,8})\b/giu)) {
    const extension = match[2].toLowerCase();
    if (/^\d+$/.test(extension)) {
      continue;
    }
    // A standalone extension (" .pdf") is a format reference on its own; a
    // preceding word makes it a filename only if the extension is recognized.
    if (match[1] === undefined ? extension.length >= 2 : KNOWN_EXTENSIONS.has(extension)) {
      return true;
    }
  }
  return false;
}

/** True for a multi-letter token written entirely in capitals. */
function isAllCaps(token: string | undefined): boolean {
  return token !== undefined && token.length > 1 && /^\p{Lu}+$/u.test(token);
}

/** Short all-caps codes that are ordinary English words, not domain terms. */
const COMMON_UPPERCASE_WORDS = new Set([
  'a',
  'i',
  'an',
  'as',
  'at',
  'be',
  'by',
  'do',
  'go',
  'if',
  'in',
  'is',
  'it',
  'no',
  'of',
  'on',
  'or',
  'so',
  'to',
  'up',
  'us',
  'we',
  'all',
  'and',
  'any',
  'but',
  'can',
  'for',
  'not',
  'the',
  'use',
  'you',
  'from',
  'that',
  'this',
  'when',
  'with',
  'note',
  'todo',
]);

/**
 * Plan 9 Part B2. A token *shaped* like a domain term, whatever the dictionary
 * knows: `PascalCase`/`CamelCase` (OpenAPI, Dockerfile, PowerPoint), a short
 * all-caps code that is not an ordinary word (DBC, ECU), a filename, a
 * hyphenated compound (load-case), or a proper noun capitalized mid-sentence
 * (Slack, Terraform, Kubernetes).
 *
 * The mid-sentence rule is what keeps this from firing on every sentence-initial
 * capital, which would make the check vacuous.
 */
/**
 * Proper nouns that name the agent or its vendor rather than anything the skill
 * operates on. A description mentions them because of the tool, so they are
 * evidence of nothing about the skill's domain.
 */
const AGENT_PROPER_NOUNS = new Set([
  'claude',
  'anthropic',
  'openai',
  'chatgpt',
  'copilot',
  'cursor',
  'gemini',
  'codex',
  'opencode',
  'assistant',
  'agent',
  'skill',
  'user',
]);

function structuralArtifact(text: string, dictionaries: HeuristicDictionaries): string | undefined {
  if (matchesFilename(text)) {
    const filename = text.match(/\p{L}[\p{L}\p{N}_-]{0,63}\.[a-z0-9]{1,8}\b/iu)?.[0];
    if (filename) return filename;
  }
  const vague = new Set(dictionaries.vagueTerms);
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const tokens = [...sentence.matchAll(/[\p{L}\p{N}][\p{L}\p{N}_-]*/gu)];
    for (const [index, match] of tokens.entries()) {
      const token = match[0];
      const lower = token.toLowerCase();
      if (vague.has(lower) || dictionaries.scopeStopwords.includes(lower)) {
        continue;
      }
      // CamelCase / PascalCase: an internal capital after a lowercase letter.
      if (/^\p{Lu}?[\p{Ll}\p{N}]+\p{Lu}/u.test(token)) {
        return token;
      }
      // A short all-caps code (DBC, ECU), but *only* when it stands alone among
      // lowercase words. Task 72 established that "any run of uppercase letters"
      // is not an artifact, and shouting is what that run usually is: "Format
      // IMPORTANT THINGS" and "Generate GOOD RESULTS" are emphasis, not domain
      // codes. Isolation is what separates the two, and the 5-character bound
      // keeps ordinary words (THINGS, RESULTS) out on length alone.
      if (
        token.length >= 2 &&
        token.length <= 5 &&
        token === token.toUpperCase() &&
        /^\p{Lu}+$/u.test(token) &&
        !COMMON_UPPERCASE_WORDS.has(lower) &&
        !isAllCaps(tokens[index - 1]?.[0]) &&
        !isAllCaps(tokens[index + 1]?.[0])
      ) {
        return token;
      }
      // A hyphenated compound noun, but not a hyphenated adjective phrase
      // ("well-formed"): require both halves to be at least three characters.
      if (/^\p{L}{3,}(?:-\p{L}{3,})+$/u.test(token)) {
        return token;
      }
      // A proper noun capitalized mid-sentence — but not one of the names that
      // appear in a description because of the *tool*, not the domain. "Helps
      // the user with tasks. Use this skill when Claude needs assistance."
      // names no artifact at all, and `Claude` was suppressing the
      // `missing-concrete-artifact` ceiling and paying half the criterion.
      if (
        index > 0 &&
        /^\p{Lu}[\p{Ll}]{2,}$/u.test(token) &&
        !AGENT_PROPER_NOUNS.has(lower)
      ) {
        return token;
      }
    }
  }
  return undefined;
}
/**
 * Whether `term` (an acronym) appears in `text`.
 *
 * Acronyms were the only artifact vocabulary never singularized: `artifactHints`
 * go through `tokenize` + `singularize`, while these were matched by a
 * `\b`-anchored regex on the bare term. So `Validate JWT payloads.` matched and
 * `Validate JWTs.` did not — costing the plural the whole 15-point artifact
 * criterion and tripping the 59-point `missing-concrete-artifact` ceiling.
 * An optional plural suffix is accepted, and the uppercase-only guard still
 * looks at the acronym itself rather than the suffix (`JWTs` is uppercase, `jwts`
 * is not).
 */
function acronymMatches(
  text: string,
  term: string,
  uppercaseOnlyAcronyms: readonly string[],
): boolean {
  const uppercaseOnly = new Set(uppercaseOnlyAcronyms);
  const re = new RegExp(`\\b(${escapeRegex(term)})(?:'?s)?\\b`, 'gi');
  const matches = [...text.matchAll(re)];
  return matches.some(
    (match) => !uppercaseOnly.has(term.toLowerCase()) || match[1] === match[1].toUpperCase(),
  );
}
function normalizeSeparators(text: string): string {
  return ` ${text
    .toLowerCase()
    .replace(/[ _-]+/g, ' ')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')} `;
}
function phraseMatchesNormalized(text: string, phrase: string): boolean {
  return text.includes(` ${phrase.toLowerCase().replace(/[ _-]+/g, ' ')} `);
}
/**
 * Lower-cased word tokens.
 *
 * NFC first: `tokenize('naïve')` returned `['naïve']` for the composed spelling
 * and `['nai', 've']` for the decomposed one, so the same visible word matched a
 * dictionary or did not depending on how the author's editor encoded it — and
 * the German markers in "Konvertiert PDF-Dateien für Berichte…" were found in
 * NFC and lost in NFD, flipping language detection with them.
 */
export function tokenize(text: string): string[] {
  return text.normalize('NFC').toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function tokenForms(tokens: string[], dictionaries: HeuristicDictionaries): Set<string> {
  const forms = new Set<string>();
  for (const token of tokens) {
    forms.add(token);
    forms.add(singularize(token, dictionaries.irregularSingularForms));
  }
  return forms;
}
