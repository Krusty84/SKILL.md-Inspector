import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import {
  hasNegativeBoundaryPhrase,
  hasExclusiveTriggerPhrase,
} from '../quality/descriptionHeuristics';
import { diag, bodyTopRange } from './util';

/**
 * Checks the Markdown body for the sections a well-formed skill should have
 * (brief §7.4). Warnings for missing body/examples/when-to-use; information
 * diagnostics suggesting boundaries and I/O documentation.
 */
export function validateBody(doc: SkillDocument): SkillDiagnostic[] {
  // Only meaningful once the frontmatter parsed; otherwise the frontmatter
  // error dominates and `body` may be the entire file.
  if (!doc.frontmatter) {
    return [];
  }

  const range = bodyTopRange(doc);
  const body = doc.body.trim();

  if (body.length === 0) {
    return [
      diag(
        DiagnosticCode.BodyMissing,
        'warning',
        'No Markdown body after the frontmatter. Document the workflow, inputs, and outputs.',
        range,
        { quickFixId: QuickFixId.InsertBodyTemplate },
      ),
    ];
  }

  const headings = extractHeadings(doc.body);
  const diagnostics: SkillDiagnostic[] = [];

  if (!hasSection(headings, ['example', 'examples', 'sample'])) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodyNoExamples,
        'warning',
        'No examples section found. Add examples showing how the skill is used.',
        range,
      ),
    );
  }

  if (!hasSection(headings, ['when to use', 'use when', 'usage', 'when the'])) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodyNoWhenToUse,
        'warning',
        'No "When to use" section found. Describe the situations the skill applies to.',
        range,
      ),
    );
  }

  const hasBoundary =
    hasNegativeBoundaryPhrase(doc.body).found ||
    hasExclusiveTriggerPhrase(doc.body).found ||
    hasSection(headings, ['constraint', 'constraints', 'limitation', 'do not', 'boundaries']);
  if (!hasBoundary) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodySuggestBoundary,
        'information',
        'Consider adding "Do not use when..." boundaries so the agent knows when to skip the skill.',
        range,
      ),
    );
  }

  if (!hasSection(headings, ['input', 'inputs', 'output', 'outputs', 'format'])) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodySuggestIO,
        'information',
        'Consider documenting the expected input and output format.',
        range,
      ),
    );
  }

  return diagnostics;
}

/** Returns heading texts (lower-cased) for ATX headings in the body. */
function extractHeadings(body: string): string[] {
  const headings: string[] = [];
  for (const line of body.split(/\r?\n/)) {
    const match = /^\s{0,3}#{1,6}\s+(.*\S)\s*$/.exec(line);
    if (match) {
      headings.push(match[1].toLowerCase());
    }
  }
  return headings;
}

function hasSection(headings: string[], keywords: string[]): boolean {
  return headings.some((heading) => keywords.some((keyword) => heading.includes(keyword)));
}
