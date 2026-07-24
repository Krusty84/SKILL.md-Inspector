import { DEFAULT_HEURISTIC_DICTIONARIES, type HeuristicDictionaries } from './dictionaries';
import { escapeRegex, phraseRegex } from './textMatch';
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
  length: number;
  wordCount: number;
  leadingText: string;
  actionVerb: PhraseMatch;
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

export function analyzeDescription(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): DescriptionAnalysis {
  const raw = description ?? '';
  const trimmed = raw.trim();
  const tokens = tokenize(trimmed);
  const triggerClause = assessScopeClause(trimmed, 'trigger', dictionaries);
  const boundaryClause = assessScopeClause(trimmed, 'boundary', dictionaries);
  const artifactEvidence = analyzeArtifactEvidence(trimmed, dictionaries);
  return {
    raw,
    trimmed,
    length: trimmed.length,
    wordCount: trimmed.split(/\s+/).filter(Boolean).length,
    leadingText: trimmed.split(/\s+/).slice(0, 12).join(' ').toLowerCase(),
    actionVerb: matchDescriptionVerb(trimmed, dictionaries),
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
 */
const USAGE_CONTEXT_PATTERN =
  /\b(?:use|using|invoke|activate|select|choose)\s+(?:this|the)\s+skill\b|\b(?:this\s+skill|it)\b[^.!?;]{0,80}\b(?:used|invoked|activated|selected|chosen|considered)\b|\b(?:should|must|can|will)\b[^.!?;]{0,40}\bbe\s+(?:used|invoked|activated|selected|chosen|considered)\b|\btrigger(?:s|ed)?\s+when\b/iu;

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
  return prefix && capability && concrete
    ? { found: true, pattern: prefix, matchedCapability: capability, matchedObject: object }
    : { found: false };
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
export function findVagueTerms(
  text: string,
  tokens: string[] = tokenize(text),
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): string[] {
  const forms = tokenForms(tokens, dictionaries);
  return [...dictionaries.vagueTerms]
    .filter((term) =>
      /^[\p{L}\p{N}]+$/u.test(term) ? forms.has(term) : phraseRegex(term).test(text),
    )
    .sort();
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
  dictionaries: HeuristicDictionaries,
): PhraseMatch {
  const match = matchLeadingCapability(description, dictionaries);
  if (match.found) {
    return { found: true, matched: match.matched };
  }
  const firstTwoSentences = description.split(/(?<=[.!?])\s+/).slice(0, 2).join(' ');
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
const USAGE_VERB = String.raw`(?:use[ds]?|using|invoke[ds]?|invoking|appl(?:y|ies|ied|ying)|trigger(?:s|ed)?|runs?|ran)`;
const SAME_SENTENCE_GAP = String.raw`[^.!?;\n]{0,60}?`;
const NEGATION = String.raw`(?:do\s+not|don['’]t|never|should\s+not|shouldn['’]t|must\s+not|mustn['’]t|cannot|can['’]t|won['’]t|not(?:\s+to)?\s+be)`;
/** `<usage verb> … <scope conjunction>` within one sentence. */
const POSITIVE_USAGE_GRAMMAR = new RegExp(
  String.raw`\b${USAGE_VERB}\b${SAME_SENTENCE_GAP}\b(?:whenever|when|for|if)\b`,
  'giu',
);
/** `designed/intended/ideal/best/suitable/appropriate for`. */
const QUALIFIED_FOR_GRAMMAR = /\b(?:designed|intended|ideal|best|suitable|appropriate)\s+for\b/giu;
const TRIGGERS_INCLUDE_GRAMMAR = /\btriggers?\s+include\b/giu;
/** Bare agent-condition markers; usage-context guarded (plan 2 Part C). */
const AGENT_WHEN_GRAMMAR = /\bwhen(?:ever)?\s+(?:the\s+user|claude|you|asked)\b/giu;
/** `<negation> … use(d) … <scope conjunction>` within one sentence. */
const NEGATIVE_USAGE_GRAMMAR = new RegExp(
  String.raw`\b${NEGATION}\b${SAME_SENTENCE_GAP}\buse[ds]?\b${SAME_SENTENCE_GAP}\b(?:whenever|when|for|if|on)\b`,
  'giu',
);
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
  const sentence = sentences.find((span) => index >= span.start && index < span.end);
  if (!sentence) {
    return true;
  }
  if (description.slice(sentence.start, index).trim() === '') {
    return true;
  }
  return USAGE_CONTEXT_PATTERN.test(description.slice(sentence.start, sentence.end));
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
        : [
            ...dictionaries.negativeBoundaryPhrases,
            ...dictionaries.restrictiveBoundaryPhrases,
            ...dictionaries.exclusiveTriggerPhrases,
          ],
    ),
  ].sort();
  const excluded =
    kind === 'trigger'
      ? [...dictionaries.negativeBoundaryPhrases, ...dictionaries.restrictiveBoundaryPhrases]
      : [];
  // Negated-usage spans exclude any positive marker they cover, so "should not
  // be used when X" never earns positive-trigger credit through the grammar.
  const negatedSpans =
    kind === 'trigger' ? [...description.matchAll(NEGATIVE_USAGE_GRAMMAR)] : [];
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
      add(match[0].toLowerCase().replace(/\s+/g, ' '), index, index + match[0].length);
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
        a.marker.localeCompare(b.marker),
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
  // A file extension needs at least one letter — "3.14" / "1.20" are numbers, not files.
  if (/\.(?!\d+\b)[a-z0-9]{2,4}\b/i.test(text)) matchedTerms.push('file extension');
  const unique = [...new Set(matchedTerms)].sort();
  if (unique.length)
    return { found: true, strength: 'high-signal', matchedTerms: unique, supportingTerms: [] };
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
  return lows.length && supports.length
    ? {
        found: true,
        strength: 'supported-low-signal',
        matchedTerms: lows.sort(),
        supportingTerms: [...new Set(supports)].sort(),
      }
    : { found: false, strength: 'none', matchedTerms: [], supportingTerms: [] };
}
function acronymMatches(
  text: string,
  term: string,
  uppercaseOnlyAcronyms: readonly string[],
): boolean {
  const uppercaseOnly = new Set(uppercaseOnlyAcronyms);
  const re = new RegExp(`\\b${escapeRegex(term)}\\b`, 'gi');
  const matches = [...text.matchAll(re)];
  return matches.some(
    (match) => !uppercaseOnly.has(term.toLowerCase()) || match[0] === match[0].toUpperCase(),
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
export function tokenize(text: string): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
}
function tokenForms(tokens: string[], dictionaries: HeuristicDictionaries): Set<string> {
  const forms = new Set<string>();
  for (const token of tokens) {
    forms.add(token);
    forms.add(singularize(token, dictionaries.irregularSingularForms));
  }
  return forms;
}
