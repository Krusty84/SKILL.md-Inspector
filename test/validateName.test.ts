import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import {
  validateName,
  toKebabCase,
  isSafeFolderRenameTarget,
} from '../src/validation/validateName';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode, QuickFixId } from '../src/types/DiagnosticCode';

function doc(name: unknown, filePath = '/ws/skills/pdf-report-formatter/SKILL.md') {
  const content = `---\nname: ${name}\ndescription: placeholder\n---\n`;
  return parseSkillFile(filePath, content);
}

function codes(name: unknown, filePath?: string): string[] {
  return validateName(doc(name, filePath), genericProfile).map((d) => d.code);
}

describe('validateName', () => {
  it('accepts a valid kebab-case name matching its folder', () => {
    expect(codes('pdf-report-formatter')).toHaveLength(0);
  });

  it.each([
    ['PDF Report Formatter'],
    ['pdf_report_formatter'],
    ['pdf report formatter'],
    ['-pdf-report'],
    ['pdf-report-'],
  ])('flags invalid name format: %s', (name) => {
    expect(codes(`"${name}"`)).toContain(DiagnosticCode.NameFormat);
  });

  it('suggests a kebab-case replacement for invalid names', () => {
    const [diagnostic] = validateName(doc('"PDF Report Formatter"'), genericProfile);
    expect(diagnostic.data?.suggestion).toBe('pdf-report-formatter');
  });

  it('reports a missing name', () => {
    const built = parseSkillFile('/ws/skills/demo/SKILL.md', '---\ndescription: text\n---\n');
    expect(validateName(built, genericProfile).map((d) => d.code)).toContain(
      DiagnosticCode.NameMissing,
    );
  });

  it.each([['""'], ['"   "']])('treats a whitespace-only name as missing: %s', (name) => {
    expect(codes(name)).toContain(DiagnosticCode.NameMissing);
  });

  it('does not offer the kebab-case quick fix for an empty name', () => {
    const diagnostics = validateName(doc('"   "'), genericProfile);
    expect(diagnostics.some((d) => d.quickFixId === QuickFixId.ConvertNameToKebabCase)).toBe(false);
    expect(diagnostics.map((d) => d.code)).toContain(DiagnosticCode.NameMissing);
  });

  it('reports a name longer than the profile maximum', () => {
    const long = 'a'.repeat(genericProfile.nameMaxLength + 1);
    expect(codes(long)).toContain(DiagnosticCode.NameTooLong);
  });

  it('warns when the name does not match the parent skill folder', () => {
    expect(codes('other-name')).toContain(DiagnosticCode.NameFolderMismatch);
  });

  it('does not check the folder when the file is not inside a skills/ folder', () => {
    expect(codes('other-name', '/ws/docs/SKILL.md')).not.toContain(
      DiagnosticCode.NameFolderMismatch,
    );
  });
});

describe('toKebabCase', () => {
  it.each([
    ['PDF Report Formatter', 'pdf-report-formatter'],
    ['pdf_report_formatter', 'pdf-report-formatter'],
    ['  spaced  name ', 'spaced-name'],
    ['-leading-and-trailing-', 'leading-and-trailing'],
    ['double--hyphen', 'double-hyphen'],
  ])('%s -> %s', (input, expected) => {
    expect(toKebabCase(input)).toBe(expected);
  });
});

describe('isSafeFolderRenameTarget (RenameParentFolder guard)', () => {
  const parent = '/ws/skills';

  it.each(['../../evil', '../sibling', 'a/b', '..', 'a/../../b', 'foo bar', 'UPPER', ''])(
    'rejects the unsafe rename target %j',
    (name) => {
      // The frontmatter name is attacker-controllable; a traversal or non-kebab
      // value must never drive a folder rename outside the parent directory.
      expect(isSafeFolderRenameTarget(parent, name)).toBe(false);
    },
  );

  it.each(['my-skill', 'pdf-report-formatter', 'skill123'])(
    'accepts the valid kebab target %j',
    (name) => {
      expect(isSafeFolderRenameTarget(parent, name)).toBe(true);
    },
  );

  it('a malicious frontmatter name still surfaces the diagnostic but not a safe rename', () => {
    // validateName emits folderMismatch with the raw name in data.expected; the
    // guard is the defense that stops the rename fix from acting on it.
    const parsed = parseSkillFile(
      '/ws/skills/demo/SKILL.md',
      '---\nname: ../../evil\ndescription: Format PDF reports for audits.\n---\n# Body',
    );
    const mismatch = validateName(parsed, genericProfile).find(
      (d) => d.quickFixId === QuickFixId.RenameParentFolder,
    );
    expect(mismatch?.data?.expected).toBe('../../evil');
    expect(isSafeFolderRenameTarget('/ws/skills', String(mismatch?.data?.expected))).toBe(false);
  });
});
