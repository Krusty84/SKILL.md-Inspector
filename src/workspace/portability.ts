import type { SkillProfileId } from '../types/SkillProfile';
import type { PortabilityEntry, PortabilityStatus } from '../types/Workspace';

export interface PortabilityContext {
  errorCount: number;
  descriptionLength: number;
  nameLength: number;
  hasRemoteLinks: boolean;
  hasScripts: boolean;
}

const PROFILE_IDS: SkillProfileId[] = ['generic', 'vscode', 'claude', 'codex'];

/** Claude keeps descriptions short so they fit the system prompt cheaply. */
const CLAUDE_DESCRIPTION_SOFT_MAX = 500;

/**
 * Evaluates how portable a skill is across the supported profiles (brief §13.4).
 * A skill that fails baseline validation fails everywhere; otherwise each
 * profile applies its own extra rules and may downgrade to a warning.
 */
export function evaluatePortability(context: PortabilityContext): PortabilityEntry[] {
  return PROFILE_IDS.map((profile) => evaluateProfile(profile, context));
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

function evaluateProfile(profile: SkillProfileId, ctx: PortabilityContext): PortabilityEntry {
  if (ctx.errorCount > 0) {
    return { profile, status: 'fail', notes: ['Skill has validation errors.'] };
  }

  const notes: string[] = [];
  let status: PortabilityStatus = 'pass';

  if (profile === 'claude') {
    if (ctx.descriptionLength > CLAUDE_DESCRIPTION_SOFT_MAX) {
      status = 'warning';
      notes.push(
        `Description is ${ctx.descriptionLength} chars; keep it under ~${CLAUDE_DESCRIPTION_SOFT_MAX} for Claude.`,
      );
    }
  }

  if (profile === 'codex') {
    if (ctx.hasRemoteLinks) {
      status = 'warning';
      notes.push('Uses remote links, which the Codex sandbox may block.');
    }
    if (ctx.hasScripts) {
      status = 'warning';
      notes.push('Bundles scripts, which may not run in a restricted sandbox.');
    }
  }

  return { profile, status, notes };
}
