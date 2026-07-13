import { describe, it, expect } from 'vitest';
import { validateProfileMetadata } from '../src/validation/validateProfileMetadata';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import { genericProfile, claudeProfile, vscodeProfile, codexProfile } from '../src/profiles';
import type { SkillDocument, SkillFrontmatter } from '../src/types/SkillDocument';

function doc(frontmatter: SkillFrontmatter): SkillDocument {
  return {
    uri: '/x/SKILL.md',
    directory: '/x',
    fileName: 'SKILL.md',
    frontmatter,
    frontmatterRaw: '',
    body: '',
    bodyStartLine: 0,
    links: [],
    resources: [],
    parseErrors: [],
  };
}

const has = (doc: SkillDocument, profile: typeof genericProfile, code: string): boolean =>
  validateProfileMetadata(doc, profile).some((d) => d.code === code);

describe('Claude reserved words (Task 43)', () => {
  it('flags a reserved word in the name; generic stays silent', () => {
    const d = doc({ name: 'claude-helper', description: 'Format reports.' });
    expect(has(d, claudeProfile, DiagnosticCode.MetadataReservedWord)).toBe(true);
    expect(validateProfileMetadata(d, genericProfile)).toEqual([]);
  });

  it('flags a reserved word in the description', () => {
    const d = doc({ name: 'report-formatter', description: 'Uses Anthropic models to format.' });
    expect(has(d, claudeProfile, DiagnosticCode.MetadataReservedWord)).toBe(true);
  });
});

describe('Claude XML tags (Task 44)', () => {
  it('flags an XML tag but not a comparison operator', () => {
    expect(
      has(
        doc({ name: 'x', description: 'Wrap output in <tag> markers.' }),
        claudeProfile,
        DiagnosticCode.MetadataXmlTag,
      ),
    ).toBe(true);
    expect(
      has(
        doc({ name: 'x', description: 'Use when a < b and b > c.' }),
        claudeProfile,
        DiagnosticCode.MetadataXmlTag,
      ),
    ).toBe(false);
  });
});

describe('VS Code field types (Task 45)', () => {
  it('accepts correct types and allows unknown fields', () => {
    const d = doc({
      name: 'x',
      description: 'd',
      'user-invocable': true,
      'argument-hint': 'a file path',
      context: ['a', 'b'],
      somethingElse: 'ok',
    });
    expect(validateProfileMetadata(d, vscodeProfile)).toEqual([]);
  });

  it('flags an incorrect field type', () => {
    const d = doc({ name: 'x', description: 'd', 'user-invocable': 'yes' });
    expect(has(d, vscodeProfile, DiagnosticCode.MetadataFieldType)).toBe(true);
  });
});

describe('Codex field types (Task 46)', () => {
  it('flags a malformed codex field; generic is unchanged', () => {
    const d = doc({ name: 'x', description: 'd', version: 1 });
    expect(has(d, codexProfile, DiagnosticCode.MetadataFieldType)).toBe(true);
    expect(validateProfileMetadata(d, genericProfile)).toEqual([]);
  });
});

describe('Unknown keys per profile (Task 49)', () => {
  it('generic allows unknown keys; claude warns and lists the key', () => {
    const d = doc({ name: 'x', description: 'd', 'made-up-key': 1 });
    expect(validateProfileMetadata(d, genericProfile)).toEqual([]);
    const unknown = validateProfileMetadata(d, claudeProfile).filter(
      (x) => x.code === DiagnosticCode.MetadataUnknownKey,
    );
    expect(unknown).toHaveLength(1);
    expect(unknown[0].message).toContain('made-up-key');
  });
});
