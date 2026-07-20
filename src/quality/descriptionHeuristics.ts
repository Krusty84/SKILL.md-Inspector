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

export function analyzeOverbroadTrigger(
  description: string,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): OverbroadTriggerAnalysis {
  const usageContext =
    /\b(?:use|using|invoke|activate|select|choose)\s+(?:this|the)\s+skill\b|\b(?:this\s+skill|it)\b[^.!?;]{0,80}\b(?:used|invoked|activated|selected|chosen|considered)\b|\b(?:should|must|can|will)\b[^.!?;]{0,40}\bbe\s+(?:used|invoked|activated|selected|chosen|considered)\b|\btrigger(?:s|ed)?\s+when\b/iu;
  const sentences = description.match(/[^.!?;\n]+(?:[.!?;]+|$)/g) ?? [];
  const matchedPhrases = dictionaries.overbroadTriggerPhrases.filter((phrase) =>
    sentences.some(
      (sentence) => usageContext.test(sentence) && overbroadPhraseRegex(phrase).test(sentence),
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
function matchDescriptionVerb(
  description: string,
  dictionaries: HeuristicDictionaries,
): PhraseMatch {
  const match = matchLeadingCapability(description, dictionaries);
  return match.found ? { found: true, matched: match.matched } : { found: false };
}

function matchLeadingCapability(
  description: string,
  dictionaries: HeuristicDictionaries,
): LeadingCapabilityMatch {
  const leading = description.split(/(?<=[.!?])\s+/)[0] ?? '';
  const tokens = tokenize(leading);
  const { forms, toBase } = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms);
  const candidate = (
    tokenIndex: number,
    position: LeadingCapabilityMatch['position'],
    allowGerund: boolean,
  ): LeadingCapabilityMatch | undefined => {
    const token = tokens[tokenIndex];
    const base = token ? toBase.get(token) : undefined;
    if (!token || !forms.has(token) || (!allowGerund && token !== base && token.endsWith('ing'))) {
      return undefined;
    }
    return { found: true, matched: token, tokenIndex, position };
  };
  // A leading gerund of a known action verb reads as a capability only when it
  // operates directly on a concrete artifact ("Converting CSV exports…"), not an
  // abstract object ("Formatting rules…"), which is a noun phrase. This lets a
  // gerund-led capability earn the same front-loaded credit as its imperative
  // twin without admitting noun phrases the strict check deliberately rejects.
  const gerundLeadOnArtifact = (): LeadingCapabilityMatch | undefined => {
    const token = tokens[0];
    if (!token || !forms.has(token) || !token.endsWith('ing') || token === toBase.get(token)) {
      return undefined;
    }
    const object = tokens.slice(1, 3).join(' ');
    return object && analyzeArtifactEvidence(object, dictionaries).found
      ? { found: true, matched: token, tokenIndex: 0, position: 'direct' }
      : undefined;
  };
  const startsWith = (prefix: readonly string[]): boolean =>
    prefix.every((token, index) => tokens[index] === token);
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
      ['asked', 'to'],
    ];
    for (const frame of frames) {
      if (frame.every((token, index) => tokens[start + index] === token)) {
        const match = candidate(start + frame.length, position, true);
        if (match) return match;
      }
    }
    return undefined;
  };

  return (
    candidate(0, 'direct', false) ??
    gerundLeadOnArtifact() ??
    (startsWith(['this', 'skill']) ? candidate(2, 'subject', false) : undefined) ??
    after(['use', 'this', 'skill', 'when'], 'use-when') ??
    after(['use', 'this', 'when'], 'use-when') ??
    after(['use', 'when'], 'use-when') ??
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
  const occurrences: Array<{ marker: string; index: number; end: number }> = [];
  for (const marker of markers)
    for (const match of description.matchAll(phraseRegex(marker, 'gi'))) {
      const index = match.index ?? 0;
      if (
        excluded.some((negative) =>
          phraseRegex(negative, 'i').test(
            description.slice(Math.max(0, index - negative.length - 2), index + match[0].length),
          ),
        )
      )
        continue;
      occurrences.push({ marker, index, end: index + match[0].length });
    }
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
      const clauseText = description.slice(occurrence.end, end).trim();
      // Single-token evidence needs the original casing: ambiguous acronyms (STEP, CI)
      // only count when written in uppercase, which tokenize() would erase.
      const stopwords = new Set(dictionaries.scopeStopwords);
      const scopeVagueTerms = new Set(dictionaries.scopeVagueTerms);
      const pairs = (clauseText.match(/[\p{L}\p{N}]+/gu) ?? [])
        .map((raw) => ({ raw, lower: raw.toLowerCase() }))
        // Drop single-character tokens: they are contraction/possessive remnants
        // (tokenizing "it's" yields a stray "s"), never meaningful scope content,
        // and must not upgrade a vague trigger to full credit.
        .filter((pair) => pair.lower.length > 1 && !stopwords.has(pair.lower));
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
