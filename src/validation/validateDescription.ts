import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import type { HeuristicDictionaries } from '../quality/dictionaries';
import { analyzeDescription } from '../quality/descriptionHeuristics';
import { isProbablyNonEnglish } from '../quality/language';
import { diag, keyRange } from './util';

const RECOMMENDED_DESCRIPTION_MAX_LENGTH = 500;

/**
 * Words that may be offered for registration in a heuristic dictionary (plan 9
 * Part C step 4).
 *
 * Security: the candidate comes from an arbitrary `SKILL.md`, and the quick fix
 * writes it into user settings where it is compiled into matching patterns. Only
 * a letter/digit-led token of letters, digits, apostrophes and hyphens is
 * allowed, capped at 41 characters — anything else means no `data.word`, so no
 * quick fix is offered at all rather than a sanitized guess being written.
 */
export const REGISTRABLE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'-]{0,40}$/u;

function registrableWord(word: string | undefined): string | undefined {
  return word !== undefined && REGISTRABLE_WORD.test(word) ? word : undefined;
}

export function validateDescription(
  doc: SkillDocument,
  profile: SkillProfile,
  dictionaries?: HeuristicDictionaries,
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

  const analysis = analyzeDescription(value, dictionaries);
  const diagnostics: SkillDiagnostic[] = [];
  const { minLength, maxLength } = profile.description;

  // Anthropic's platform rejects descriptions containing angle brackets (they
  // could inject XML into the system prompt), so a clean report must not hide
  // a description the upload validator will refuse.
  if (/[<>]/.test(value)) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionXmlTags,
        'error',
        '`description` must not contain `<` or `>`. Anthropic\'s platform rejects descriptions with XML tags or angle brackets.',
        range,
      ),
    );
  }

  if (analysis.length > maxLength) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionTooLong,
        'error',
        `\`description\` is ${analysis.length} characters; the maximum is ${maxLength}.`,
        range,
      ),
    );
  } else if (analysis.length > RECOMMENDED_DESCRIPTION_MAX_LENGTH) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionTooVerbose,
        'warning',
        `\`description\` is ${analysis.length} characters; aim for at most ${RECOMMENDED_DESCRIPTION_MAX_LENGTH} and move detailed procedure to the Markdown body.`,
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

  // The verb/trigger/vagueness heuristics are English-dictionary checks. On a
  // detected non-English description their "add Use when..." advice is noise,
  // so they are replaced by a single information-level notice. Mirrors the
  // languageLimited condition used by the description-completeness score.
  if (profile.description.language !== 'en' && isProbablyNonEnglish(analysis.trimmed)) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionLanguageLimited,
        'information',
        '`description` does not appear to be English, so the English wording checks (action verb, trigger, boundary, vagueness) were skipped. Structural rules still apply.',
        range,
      ),
    );
    return diagnostics;
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

  if (analysis.overbroadTrigger.found) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionOverbroadTrigger,
        'warning',
        `\`description\` claims an overbroad usage scope ("${analysis.overbroadTrigger.matched}"). Narrow when the skill should trigger. Description completeness is capped at 69.`,
        range,
      ),
    );
  }

  if (analysis.instructionHeavy.found) {
    diagnostics.push(
      diag(
        DiagnosticCode.DescriptionInstructionHeavy,
        'warning',
        '`description` embeds a detailed workflow. Frontmatter should describe capability and trigger scope; detailed procedure belongs in the Markdown body. Description completeness is capped at 74.',
        range,
      ),
    );
  }

  // Advisory, not fatal: capability phrasing is a quality concern, and the
  // detector is heuristic (gerunds, noun phrases, and second-sentence verbs are
  // recognized, but other legitimate phrasings may not be).
  //
  // When the opening *is* shaped like a capability statement but its verb is
  // unregistered, the diagnostic names the word and carries it as `data.word` so
  // the quick fix can offer to register it (plan 9 Part C). That case is
  // information-level: the description is fine, the dictionary is incomplete.
  if (!analysis.actionVerb.found) {
    const unregistered = registrableWord(analysis.capabilityEvidence.structuralTerm);
    diagnostics.push(
      unregistered
        ? diag(
            DiagnosticCode.DescriptionNoVerb,
            'information',
            `\`description\` opens with "${unregistered}", which reads like a capability verb but is not in the configured vocabulary. Add it to score the capability criterion fully.`,
            range,
            {
              quickFixId: QuickFixId.AddActionVerbToDictionary,
              data: { word: unregistered },
            },
          )
        : diag(
            DiagnosticCode.DescriptionNoVerb,
            'warning',
            '`description` does not contain a clear action verb (e.g. "format", "analyze", "generate").',
            range,
          ),
    );
  }

  // Same shape for the artifact side, on the existing vague-description channel's
  // sibling: only offered when nothing in the dictionary matched.
  if (!analysis.concreteArtifact && analysis.artifactEvidence.structural) {
    const unregistered = registrableWord(analysis.artifactEvidence.structuralTerm);
    if (unregistered) {
      diagnostics.push(
        diag(
          DiagnosticCode.DescriptionNoArtifact,
          'information',
          `\`description\` names "${unregistered}", which reads like a concrete artifact but is not in the configured vocabulary. Add it to score the artifact criterion fully.`,
          range,
          {
            quickFixId: QuickFixId.AddArtifactToDictionary,
            data: { word: unregistered },
          },
        ),
      );
    }
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
