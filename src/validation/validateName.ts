import * as path from 'node:path';
import * as l10n from '@vscode/l10n';
import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import { isPathInsideDir } from '../parser/linkPaths';
import { diag, keyRange } from './util';

/** A valid skill name: lowercase letters, digits, single hyphens between. */
export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/**
 * Words Anthropic's platform rejects anywhere in a skill name (matched as
 * substrings, mirroring the upload validator, so "claude-tools" and
 * "anthropic-helper" are both refused).
 */
const RESERVED_NAME_WORDS = ['anthropic', 'claude'] as const;

/**
 * Whether `name` is a safe target for renaming a skill folder inside `parentDir`.
 * The name comes from frontmatter, which is attacker-controllable in an untrusted
 * SKILL.md, so it must be a valid kebab-case segment (no separators, no `..`) that
 * stays inside the parent — otherwise a one-click "rename folder" fix could move
 * the folder to an arbitrary filesystem location.
 */
export function isSafeFolderRenameTarget(parentDir: string, name: string): boolean {
  return NAME_PATTERN.test(name) && isPathInsideDir(parentDir, path.join(parentDir, name));
}

export function validateName(doc: SkillDocument, profile: SkillProfile): SkillDiagnostic[] {
  if (!doc.frontmatter) {
    return [];
  }

  const range = keyRange(doc, 'name');
  const value = doc.frontmatter.name;

  if (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  ) {
    return [
      diag(
        DiagnosticCode.NameMissing,
        'error',
        l10n.t('Missing required `name` field in frontmatter.'),
        range,
        { quickFixId: QuickFixId.InsertName },
      ),
    ];
  }

  if (typeof value !== 'string') {
    return [diag(DiagnosticCode.NameType, 'error', l10n.t('`name` must be a string.'), range)];
  }

  const diagnostics: SkillDiagnostic[] = [];

  if (value.length > profile.nameMaxLength) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameTooLong,
        'error',
        l10n.t('`name` is {0} characters; the maximum is {1}.', value.length, profile.nameMaxLength),
        range,
      ),
    );
  }

  if (!NAME_PATTERN.test(value)) {
    // `toKebabCase` keeps only ASCII letters and digits, so a name written
    // entirely in a non-Latin script, in emoji, or in punctuation slugs to the
    // empty string. Offering that as the *preferred* one-click fix replaced the
    // author's name with `name: `, and the next pass reported
    // `skill.name.missing`. No usable slug means no fix — the diagnostic still
    // explains what a valid name looks like.
    const suggestion = toKebabCase(value);
    const fixable = NAME_PATTERN.test(suggestion);
    diagnostics.push(
      diag(
        DiagnosticCode.NameFormat,
        'error',
        l10n.t(
          '`name` must use lowercase letters, numbers, and hyphens only, with no spaces and no leading or trailing hyphen.',
        ),
        range,
        fixable
          ? { quickFixId: QuickFixId.ConvertNameToKebabCase, data: { suggestion } }
          : undefined,
      ),
    );
  }

  const reserved = RESERVED_NAME_WORDS.find((word) => value.toLowerCase().includes(word));
  if (reserved) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameReservedWord,
        'error',
        l10n.t(
          '`name` contains the reserved word "{0}". Anthropic\'s platform rejects skill names containing "anthropic" or "claude".',
          reserved,
        ),
        range,
      ),
    );
  }

  const folder = nameFolderMismatch(doc.directory, value);
  if (folder !== null) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameFolderMismatch,
        'error',
        l10n.t('`name` "{0}" does not match the parent folder "{1}".', value, folder),
        range,
        { quickFixId: QuickFixId.RenameParentFolder, data: { expected: value, folder } },
      ),
    );
  }

  return diagnostics;
}

/**
 * The parent folder name when `name` does not match it, applying the same
 * gating the validator uses (only inside a `skills/` parent); null when they
 * match or the location is not a skill folder. Shared with the compatibility
 * projection so the two surfaces can never disagree about a mismatch.
 */
export function nameFolderMismatch(directory: string, name: string): string | null {
  const folder = path.basename(directory);
  return looksLikeSkillFolder(directory) && folder !== '' && folder !== name ? folder : null;
}

/** Converts an arbitrary string into a valid kebab-case skill name. */
export function toKebabCase(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** A skill folder is a directory whose parent is named `skills` (brief §5). */
function looksLikeSkillFolder(directory: string): boolean {
  return path.basename(path.dirname(directory)).toLowerCase() === 'skills';
}
