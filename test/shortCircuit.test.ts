import { describe, it, expect } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { validateName } from '../src/validation/validateName';
import { validateDescription } from '../src/validation/validateDescription';
import { genericProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

const doc = (frontmatter: string) =>
  parseSkillFile('/ws/skills/x/SKILL.md', `---\n${frontmatter}\n---\n\n# Body`);

describe('foundational short-circuit (Tasks 81, 83)', () => {
  it('a non-string name yields exactly one type error and no format analysis', () => {
    const diagnostics = validateName(
      doc('name: [a, b]\ndescription: Format inspection reports.'),
      genericProfile,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticCode.NameType);
  });

  it('a non-string description yields exactly one type error and no quality analysis', () => {
    const diagnostics = validateDescription(doc('name: demo\ndescription: [a, b]'), genericProfile);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticCode.DescriptionType);
  });

  it('an empty description yields exactly one required-field error', () => {
    const diagnostics = validateDescription(doc('name: demo\ndescription: ""'), genericProfile);
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticCode.DescriptionMissing);
  });

  it('an empty name yields exactly one required-field error', () => {
    const diagnostics = validateName(
      doc('name: ""\ndescription: Format inspection reports.'),
      genericProfile,
    );
    expect(diagnostics).toHaveLength(1);
    expect(diagnostics[0].code).toBe(DiagnosticCode.NameMissing);
  });
});
