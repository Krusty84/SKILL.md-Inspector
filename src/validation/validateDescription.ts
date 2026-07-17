import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import { analyzeDescription } from '../quality/descriptionHeuristics';
import { diag, keyRange } from './util';

export function validateDescription(
  doc: SkillDocument,
  profile: SkillProfile,
): SkillDiagnostic[] {
  if (!doc.frontmatter) {
    return [];
  }

  const range = keyRange(doc, 'description');
  const value = doc.frontmatter.description;

  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    return [
      diag(
        DiagnosticCode.DescriptionMissing,
        'error',
        'Missing required `description` field in frontmatter.',
        range,
        { quickFixId: QuickFixId.InsertDescription },
      ),
    ];
  }

  if (typeof value !== 'string') {
    return [
      diag(DiagnosticCode.DescriptionType, 'error', '`description` must be a string.', range),
    ];
  }

  const analysis = analyzeDescription(value);
  const diagnostics: SkillDiagnostic[] = [];
  const { minLength, maxLength } = profile.description;

  if (analysis.length > maxLength) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionTooLong,
        'error',
        `\`description\` is ${analysis.length} characters; the maximum is ${maxLength}.`,
        range,
      ),
    );
  }

  if (analysis.length < minLength) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionTooShort,
        'warning',
        `\`description\` is only ${analysis.length} characters. Aim for at least ${minLength} so the agent can tell what the skill does and when to use it.`,
        range,
      ),
    );
  }

  if (analysis.vagueTerms.length > 0) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionVague,
        'warning',
        `\`description\` uses vague wording (${analysis.vagueTerms.join(', ')}). Describe the concrete task instead.`,
        range,
      ),
    );
  }

  if (!analysis.actionVerb.found) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionNoVerb,
        'warning',
        '`description` does not contain a clear action verb (e.g. "format", "analyze", "generate").',
        range,
      ),
    );
  }

  if (!analysis.triggerClause.contentFound) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionNoTrigger,
        'warning',
        analysis.triggerClause.markerFound
          ? '`description` has a trigger marker, but its scope content is too vague. State a concrete context.'
          : '`description` does not explain when to use the skill. Add a trigger clause such as "Use when...".',
        range,
        { quickFixId: QuickFixId.InsertUseWhenClause },
      ),
    );
  }

  // MVP2: boundary and front-loaded-intent checks explain lost Static Description Quality
  // points (brief §10.3 / §10.4). Information-level so they stay non-intrusive.
  if (!analysis.boundaryClause.contentFound) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionNoBoundary,
        'information',
        analysis.boundaryClause.markerFound
          ? '`description` has a boundary marker, but its scope content is too vague. State a concrete excluded context.'
          : '`description` does not define when NOT to use the skill. Add a boundary such as "Do not use when...".',
        range,
        { quickFixId: QuickFixId.InsertDoNotUseClause },
      ),
    );
  }

  if (!analysis.frontLoadedIntent.found) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionNotFrontLoaded,
        'information',
        'State the main capability in the first few words of `description` so the agent can match it quickly.',
        range,
      ),
    );
  }

  return diagnostics;
}
