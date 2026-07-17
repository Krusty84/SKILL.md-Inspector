import { DiagnosticCode } from '../types/DiagnosticCode';
import { phraseRegex } from '../quality/textMatch';
import type { BodySectionSpec } from '../types/SkillProfile';
import type { SkillHeading } from '../parser/parseMarkdownHeadings';

/**
 * Recommended body-section registry. Each spec matches a heading by whole token
 * or by an alias phrase — never by bare substring — so `Examples` and
 * `Example usage` match while `Counterexamples` or `Formatting output…` do not.
 * Profiles compose their section lists from these (brief §7.4).
 */
export const EXAMPLES_SECTION: BodySectionSpec = {
  id: 'examples',
  code: DiagnosticCode.BodyNoExamples,
  message: 'No examples section found. Add examples showing how the skill is used.',
  tokens: ['example', 'examples', 'sample', 'samples'],
  phrases: ['example usage', 'sample usage'],
};

export const WHEN_TO_USE_SECTION: BodySectionSpec = {
  id: 'whenToUse',
  code: DiagnosticCode.BodyNoWhenToUse,
  message: 'No "When to use" section found. Describe the situations the skill applies to.',
  tokens: ['usage'],
  phrases: ['when to use', 'use when', 'when the user', 'when the agent'],
};

export const BOUNDARY_SECTION: BodySectionSpec = {
  id: 'boundary',
  code: DiagnosticCode.BodySuggestBoundary,
  message:
    'Consider adding "Do not use when..." boundaries so the agent knows when to skip the skill.',
  tokens: ['constraint', 'constraints', 'limitation', 'limitations', 'boundary', 'boundaries'],
  phrases: ['do not use', 'when not to use'],
};

export const IO_SECTION: BodySectionSpec = {
  id: 'io',
  code: DiagnosticCode.BodySuggestIO,
  message: 'Consider documenting the expected input and output format.',
  tokens: ['input', 'inputs', 'output', 'outputs', 'format', 'formats'],
  phrases: ['input and output', 'inputs and outputs'],
};

/** Default section set when a profile does not define its own. */
export const DEFAULT_BODY_SECTIONS: BodySectionSpec[] = [
  EXAMPLES_SECTION,
  WHEN_TO_USE_SECTION,
  BOUNDARY_SECTION,
  IO_SECTION,
];

/**
 * Whole-token or alias match (never a bare substring) between a heading and a
 * section spec.
 */
export function matchesSection(headingText: string, spec: BodySectionSpec): boolean {
  const normalized = headingText.toLowerCase().trim();
  if (spec.phrases.some((phrase) => phraseRegex(phrase).test(normalized))) {
    return true;
  }
  const tokens = new Set(normalized.split(/[^a-z0-9]+/).filter(Boolean));
  return spec.tokens.some((token) => tokens.has(token));
}

/** True when any heading satisfies the section spec. */
export function hasSection(headings: SkillHeading[], spec: BodySectionSpec): boolean {
  return headings.some((heading) => matchesSection(heading.text, spec));
}
