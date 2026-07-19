import { DiagnosticCode } from '../types/DiagnosticCode';
import type { SkillProfileId } from '../types/SkillProfile';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { PortabilityEntry, PortabilityStatus } from '../types/Workspace';
import { PROFILES } from '../profiles';
import {
  validateFrontmatter,
  validateLinks,
  validateName,
  validateDescription,
  validateProfileMetadata,
} from '../validation';
import { diag, keyRange } from '../validation/util';
import type { HeuristicDictionaries } from '../quality/dictionaries';

const PROFILE_IDS: SkillProfileId[] = ['generic', 'vscode', 'claude', 'codex'];

/** Claude keeps descriptions short so they fit the system prompt cheaply. */
const CLAUDE_DESCRIPTION_SOFT_MAX = 500;

/**
 * Evaluates how portable a skill is by validating it independently against every
 * profile (brief §13.4, Task 41). Profile-independent rules (frontmatter, links)
 * run once; profile-dependent rules run per profile. A profile FAILS on any
 * validation error (a shared baseline error fails all; a profile-specific error
 * fails only that profile) and WARNS on portability-relevant warnings — link
 * portability plus the profile's own metadata rules and notes. General quality
 * warnings (unreferenced files, vague wording, missing sections) are surfaced in
 * the editor, not here. Each entry keeps its own diagnostics (Task 42), and the
 * selected editor profile never skews the result.
 */
export function evaluatePortability(
  doc: SkillDocument,
  dictionaries?: HeuristicDictionaries,
): PortabilityEntry[] {
  const frontmatter = validateFrontmatter(doc);
  const links = validateLinks(doc);

  return PROFILE_IDS.map((id) => {
    const profile = PROFILES[id];
    const name = validateName(doc, profile);
    const description = validateDescription(doc, profile, dictionaries);
    const metadata = validateProfileMetadata(doc, profile);
    const notes = portabilityNotes(id, doc);

    const errors = [
      ...frontmatter,
      ...links,
      ...name,
      ...description.filter((diagnostic) => diagnostic.kind !== 'quality'),
      ...metadata,
    ].filter((d) => d.severity === 'error');
    // Link portability + profile-specific rules are the portability warnings.
    const warnings = [...links, ...metadata, ...notes].filter((d) => d.severity === 'warning');

    const relevant = [...errors, ...warnings];
    const status: PortabilityStatus =
      errors.length > 0 ? 'fail' : warnings.length > 0 ? 'warning' : 'pass';
    return {
      profile: id,
      status,
      notes: relevant.map((d) => d.message),
      diagnostics: relevant.map((d) => ({
        code: d.code,
        severity: d.severity,
        message: d.message,
      })),
    };
  });
}

export function toCompatibilityMap(
  entries: PortabilityEntry[],
): Record<SkillProfileId, PortabilityStatus> {
  const map = {} as Record<SkillProfileId, PortabilityStatus>;
  for (const entry of entries) {
    map[entry.profile] = entry.status;
  }
  return map;
}

/**
 * Per-profile portability considerations that aren't baseline validation errors.
 * Codex remote-link and script handling is intentionally left to the baseline
 * link severity (Tasks 47/48): normal scripts and documentation URLs no longer
 * downgrade portability, while insecure/executable remote links stay warnings.
 */
function portabilityNotes(id: SkillProfileId, doc: SkillDocument): SkillDiagnostic[] {
  if (id !== 'claude') {
    return [];
  }
  const description =
    typeof doc.frontmatter?.description === 'string' ? doc.frontmatter.description : '';
  if (description.trim().length > CLAUDE_DESCRIPTION_SOFT_MAX) {
    return [
      diag(
        DiagnosticCode.PortabilityClaudeDescriptionLong,
        'warning',
        `Description is ${description.trim().length} chars; keep it under ~${CLAUDE_DESCRIPTION_SOFT_MAX} for Claude.`,
        keyRange(doc, 'description'),
      ),
    ];
  }
  return [];
}
