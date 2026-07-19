import { readFileSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { analyzeDescription } from '../src/quality/descriptionHeuristics';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';
import { codexProfile } from '../src/profiles/codexProfile';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillProfile } from '../src/types/SkillProfile';

function inspectFixture(name: string, profile: SkillProfile = genericProfile) {
  const fixturePath = path.resolve(`fixtures/skills/${name}/SKILL.md`);
  const content = readFileSync(fixturePath, 'utf8');
  const { document, diagnostics } = analyzeSkill(fixturePath, content, profile, {
    mode: 'text-only',
  });
  const description = String(document.frontmatter?.description ?? '');
  const quality = computeStaticDescriptionQuality(description, {
    minLength: profile.description.minLength,
    maxLength: profile.description.maxLength,
    language: profile.description.language,
    weights: profile.description.weights,
  });
  return {
    analysis: analyzeDescription(description),
    codes: diagnostics.map((diagnostic) => diagnostic.code),
    quality,
  };
}

describe('fixture-backed action capability detection', () => {
  it.each(['api-error-triage', 'pdf-form-filler'])(
    'keeps %s front-loaded and excellent under the generic profile',
    (name) => {
      const result = inspectFixture(name);
      expect(result.codes).not.toContain(DiagnosticCode.DescriptionNoVerb);
      expect(result.analysis.frontLoadedIntent.found).toBe(true);
      expect(result.quality.adjustedScore).toBeGreaterThanOrEqual(90);
      expect(result.quality.gradeLimitations.map((limitation) => limitation.code)).not.toContain(
        'missing-action-capability',
      );
    },
  );

  it.each(['tech-translator', 'meeting-notes', 'style-formatter'])(
    'removes only the false no-verb diagnostic from %s',
    (name) => {
      expect(inspectFixture(name).codes).not.toContain(DiagnosticCode.DescriptionNoVerb);
    },
  );

  it('preserves the meeting-notes folder mismatch', () => {
    expect(inspectFixture('meeting-notes').codes).toContain(DiagnosticCode.NameFolderMismatch);
  });

  it('preserves the style-formatter name defect', () => {
    expect(inspectFixture('style-formatter').codes).toContain(DiagnosticCode.NameFolderMismatch);
  });

  it.each([
    ['bug-repro-minimizer', 'reduce'],
    ['code-formatter', 'run'],
  ])('reports the leading capability for %s', (name, capability) => {
    const result = inspectFixture(name);
    expect(result.analysis.actionVerb).toEqual({ found: true, matched: capability });
    expect(result.analysis.frontLoadedIntent.matchedCapability).toBe(capability);
    expect(
      result.quality.findings.find((finding) => finding.criterion.startsWith('Action verb'))
        ?.message,
    ).toContain(`"${capability}"`);
  });

  it.each(['api-error-triage', 'pdf-form-filler'])(
    'keeps %s action-capable under the Codex profile',
    (name) => {
      const result = inspectFixture(name, codexProfile);
      expect(result.codes).not.toContain(DiagnosticCode.DescriptionNoVerb);
      expect(result.analysis.frontLoadedIntent.found).toBe(true);
      expect(result.quality.gradeLimitations.map((limitation) => limitation.code)).not.toContain(
        'missing-action-capability',
      );
    },
  );
});
