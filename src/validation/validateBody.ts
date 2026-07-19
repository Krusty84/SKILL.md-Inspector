import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic, SkillDiagnosticSeverity } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import {
  assessScopeClause,
  hasNegativeBoundaryPhrase,
  hasExclusiveTriggerPhrase,
} from '../quality/descriptionHeuristics';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  type HeuristicDictionaries,
} from '../quality/dictionaries';
import { DEFAULT_BODY_SECTIONS, hasSection } from './bodySections';
import { analyzeBodyEvidence } from './bodyEvidence';
import { diag, bodyTopRange } from './util';

/**
 * Checks the Markdown body for the sections a well-formed skill should have
 * (brief §7.4). An empty body is a structural warning regardless of strictness;
 * the section recommendations come from the profile and are surfaced at a
 * severity governed by `profile.body.strictness` (off | recommended | strict).
 */
export function validateBody(
  doc: SkillDocument,
  profile: SkillProfile,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
): SkillDiagnostic[] {
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

  const strictness = profile.body?.strictness ?? 'recommended';
  if (strictness === 'off') {
    return [];
  }
  const severity: SkillDiagnosticSeverity = strictness === 'strict' ? 'warning' : 'information';
  const sections = profile.body?.sections ?? DEFAULT_BODY_SECTIONS;

  const evidence = analyzeBodyEvidence(doc.body);
  const diagnostics: SkillDiagnostic[] = [];
  const description =
    typeof doc.frontmatter.description === 'string' ? doc.frontmatter.description : '';
  const frontmatterTrigger = assessScopeClause(description, 'trigger', dictionaries);
  const frontmatterBoundary = assessScopeClause(description, 'boundary', dictionaries);

  for (const spec of sections) {
    // Trigger and boundary scope can live in concrete frontmatter clauses;
    // boundaries expressed in body prose remain supported as before.
    const satisfied =
      (spec.id === 'examples'
        ? evidence.hasExampleEvidence
        : hasSection(evidence.headings, spec)) ||
      (spec.id === 'whenToUse' && frontmatterTrigger.contentFound) ||
      (spec.id === 'boundary' &&
        (hasNegativeBoundaryPhrase(doc.body, dictionaries).found ||
          hasExclusiveTriggerPhrase(doc.body, dictionaries).found ||
          frontmatterBoundary.contentFound));
    if (!satisfied) {
      diagnostics.push(diag(spec.code, severity, spec.message, range));
    }
  }

  return diagnostics;
}
