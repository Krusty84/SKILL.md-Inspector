import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { assessAuthoringQuality } from '../src/authoring/authoringQuality';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import { validateBody } from '../src/validation/validateBody';

function inspectFixture(name: string) {
  const fixturePath = path.resolve(`demo_skills/skills/${name}/SKILL.md`);
  const document = parseSkillFile(fixturePath, readFileSync(fixturePath, 'utf8'));
  return assessAuthoringQuality(document).instructions;
}

function fixtureDocument(name: string) {
  const fixturePath = path.resolve(`demo_skills/skills/${name}/SKILL.md`);
  return parseSkillFile(fixturePath, readFileSync(fixturePath, 'utf8'));
}

describe('fixture-backed instruction structure analysis', () => {
  it('finds the unclosed fence in legacy-migration', () => {
    const finding = inspectFixture('legacy-migration').findings.find(
      (item) => item.criterion === 'Unclosed code fence',
    );
    expect(finding?.severity).toBe('major');
    expect(finding?.message).toContain('line 15');
  });

  it('finds the stub body in webhook-debugger', () => {
    expect(inspectFixture('webhook-debugger').findings).toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions', severity: 'moderate' }),
    );
  });

  it('finds length and repetition in release-automation and reduces it to issues', () => {
    const result = inspectFixture('release-automation');
    expect(result.findings.map((finding) => finding.criterion)).toEqual(
      expect.arrayContaining(['Length', 'Repetitive instructions']),
    );
    expect(result.score).toBeLessThanOrEqual(50);
    expect(result.label).toBe('issues');
  });

  it.each(['api-error-triage', 'pdf-form-filler', 'changelog-writer', 'bug-repro-minimizer'])(
    'keeps %s free of the new structure findings',
    (name) => {
      const criteria = inspectFixture(name).findings.map((finding) => finding.criterion);
      expect(criteria).not.toContain('Unclosed code fence');
      expect(criteria).not.toContain('Substantive instructions');
      expect(criteria).not.toContain('Repetitive instructions');
      expect(criteria).not.toContain('Examples');
      const codes = validateBody(fixtureDocument(name), genericProfile).map((item) => item.code);
      expect(codes).not.toContain(DiagnosticCode.BodyNoExamples);
      expect(codes).not.toContain(DiagnosticCode.BodyNoWhenToUse);
    },
  );

  it('penalizes git-commit-helper exactly once for missing example evidence', () => {
    const result = inspectFixture('git-commit-helper');
    expect(result.findings.filter((finding) => finding.criterion === 'Examples')).toEqual([
      expect.objectContaining({ severity: 'minor' }),
    ]);
    expect(result.score).toBe(90);
    expect(
      validateBody(fixtureDocument('git-commit-helper'), genericProfile).map((item) => item.code),
    ).toContain(DiagnosticCode.BodyNoExamples);
  });

  it('does not infer an example from csv-cleaner workflow code or diagnosis table', () => {
    const result = inspectFixture('csv-cleaner');
    expect(result.findings).toContainEqual(
      expect.objectContaining({ criterion: 'Examples', severity: 'minor' }),
    );
  });
});
