import * as path from 'node:path';
import { DiagnosticCode, QuickFixId } from '../types/DiagnosticCode';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import type { SkillProfile } from '../types/SkillProfile';
import { isPathInsideDir } from '../parser/linkPaths';
import { diag, keyRange } from './util';

/** A valid skill name: lowercase letters, digits, single hyphens between. */
export const NAME_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
        'Missing required `name` field in frontmatter.',
        range,
        { quickFixId: QuickFixId.InsertName },
      ),
    ];
  }

  if (typeof value !== 'string') {
    return [diag(DiagnosticCode.NameType, 'error', '`name` must be a string.', range)];
  }

  const diagnostics: SkillDiagnostic[] = [];

  if (value.length > profile.nameMaxLength) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameTooLong,
        'error',
        `\`name\` is ${value.length} characters; the maximum is ${profile.nameMaxLength}.`,
        range,
      ),
    );
  }

  if (!NAME_PATTERN.test(value)) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameFormat,
        'error',
        '`name` must use lowercase letters, numbers, and hyphens only, with no spaces and no leading or trailing hyphen.',
        range,
        { quickFixId: QuickFixId.ConvertNameToKebabCase, data: { suggestion: toKebabCase(value) } },
      ),
    );
  }

  const folder = path.basename(doc.directory);
  if (looksLikeSkillFolder(doc.directory) && folder && folder !== value) {
    diagnostics.push(
      diag(
        DiagnosticCode.NameFolderMismatch,
        'error',
        `\`name\` "${value}" does not match the parent folder "${folder}".`,
        range,
        { quickFixId: QuickFixId.RenameParentFolder, data: { expected: value, folder } },
      ),
    );
  }

  return diagnostics;
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
