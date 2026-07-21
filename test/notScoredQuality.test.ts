import { describe, expect, it } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { assessAuthoringQuality } from '../src/authoring/authoringQuality';
import { withResources } from '../src/parser/parseSkillFile';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';
import { codexProfile } from '../src/profiles/codexProfile';
import { genericProfile } from '../src/profiles/genericProfile';
import type { SkillProfile } from '../src/types/SkillProfile';
import { buildReportModel } from '../src/ui/reportModel';
import { renderReportHtml } from '../src/ui/renderReport';
import { renderWorkspaceReportHtml } from '../src/ui/renderWorkspaceReport';
import { analyzeWorkspace, buildSkillsIndex } from '../src/workspace/analyzeWorkspace';

const FIXTURE_ROOT = path.resolve('fixtures');

function fixturePath(name: string): string {
  return path.join(FIXTURE_ROOT, 'skills', name, 'SKILL.md');
}

function fixtureReport(name: string, profile: SkillProfile = genericProfile) {
  const filePath = fixturePath(name);
  const content = fs.readFileSync(filePath, 'utf8');
  const { document, diagnostics, tokenUsage } = analyzeSkill(filePath, content, profile);
  return buildReportModel(document, diagnostics, profile, tokenUsage);
}

describe('explicit not-scored quality state', () => {
  it.each([
    ['missing', undefined, 'description is missing'],
    ['null', null, 'description is null'],
    ['non-string', 42, 'description is not a string'],
    ['empty', '', 'description is empty'],
    ['whitespace-only', '  \n\t', 'description is empty'],
  ])('does not score a %s description', (_case, description, reason) => {
    const result = computeStaticDescriptionQuality(description);
    expect(result).toMatchObject({
      state: 'not-scored',
      score: null,
      rawScore: null,
      adjustedScore: null,
      label: null,
      notScoredReason: reason,
      findings: [],
    });
  });

  it('keeps zero distinct for a valid description that earns no points', () => {
    const result = computeStaticDescriptionQuality('Helpful useful.');
    expect(result).toMatchObject({
      state: 'scored',
      score: 0,
      rawScore: 0,
      adjustedScore: 0,
      label: 'poor',
    });
  });

  it.each([
    ['null', 'null', 'description is null'],
    ['non-string', '42', 'description is not a string'],
    ['blank', '"   "', 'description is empty'],
  ])('propagates a %s YAML description through the report model', (_case, value, reason) => {
    const content = [
      '---',
      'name: invalid-description',
      `description: ${value}`,
      '---',
      '',
      '# Body',
    ].join('\n');
    const { document, diagnostics, tokenUsage } = analyzeSkill(
      '/skills/invalid-description/SKILL.md',
      content,
      genericProfile,
    );
    const result = buildReportModel(
      document,
      diagnostics,
      genericProfile,
      tokenUsage,
    ).staticDescriptionQuality;

    expect(result).toMatchObject({
      state: 'not-scored',
      score: null,
      rawScore: null,
      adjustedScore: null,
      notScoredReason: reason,
    });
  });

  it.each([
    ['generic', genericProfile],
    ['codex', codexProfile],
  ])('propagates fixture states under the %s profile', (_name, profile) => {
    const missingDescription = fixtureReport('json-formatter', profile);
    expect(missingDescription.staticDescriptionQuality).toMatchObject({
      state: 'not-scored',
      score: null,
      adjustedScore: null,
      notScoredReason: 'description is missing',
    });
    expect(missingDescription.authoringQuality.instructions.state).toBe('scored');

    const malformed = fixtureReport('helper', profile);
    expect(malformed.staticDescriptionQuality).toMatchObject({
      state: 'not-scored',
      score: null,
      adjustedScore: null,
      notScoredReason: 'frontmatter could not be parsed',
    });
    expect(malformed.authoringQuality.instructions).toMatchObject({
      state: 'not-scored',
      score: null,
      label: null,
      notScoredReason: 'frontmatter could not be parsed',
    });

    const missingFrontmatter = fixtureReport('stuff', profile);
    expect(missingFrontmatter.staticDescriptionQuality).toMatchObject({
      state: 'not-scored',
      score: null,
      adjustedScore: null,
    });
    expect(missingFrontmatter.authoringQuality.instructions).toMatchObject({
      state: 'not-scored',
      score: null,
      label: null,
      notScoredReason: 'frontmatter is missing',
    });
  });

  it('keeps resource quality scorable after fatal frontmatter parsing', () => {
    const filePath = fixturePath('helper');
    const { document } = analyzeSkill(filePath, fs.readFileSync(filePath, 'utf8'), genericProfile, {
      mode: 'text-only',
    });
    const withDiscoveredResource = withResources(document, [
      {
        relativePath: 'references/guide.md',
        absolutePath: path.join(path.dirname(filePath), 'references', 'guide.md'),
        category: 'references',
        sizeBytes: 100,
        referenced: false,
      },
    ]);

    const result = assessAuthoringQuality(withDiscoveredResource);
    expect(result.instructions.state).toBe('not-scored');
    expect(result.resources).toMatchObject({ score: 90, label: 'excellent' });
  });

  it('serializes the explicit state in skills index schema version 4', () => {
    const analysis = analyzeWorkspace(
      FIXTURE_ROOT,
      [fixturePath('json-formatter'), fixturePath('helper'), fixturePath('stuff')],
      genericProfile,
    );
    const serialized = JSON.parse(JSON.stringify(buildSkillsIndex(analysis)));

    expect(serialized).toMatchObject({
      schemaVersion: 4,
      skills: expect.arrayContaining([
        expect.objectContaining({
          name: 'json-formatter',
          staticDescriptionQuality: expect.objectContaining({
            state: 'not-scored',
            score: null,
          }),
        }),
        expect.objectContaining({
          name: 'helper',
          staticDescriptionQuality: expect.objectContaining({
            state: 'not-scored',
            score: null,
          }),
          authoringQuality: expect.objectContaining({
            instructions: expect.objectContaining({ state: 'not-scored', score: null }),
          }),
        }),
        expect.objectContaining({
          name: 'stuff',
          staticDescriptionQuality: expect.objectContaining({
            state: 'not-scored',
            score: null,
          }),
        }),
      ]),
    });
  });

  it('renders not-scored assessments without numeric placeholders or ordinary labels', () => {
    const report = fixtureReport('helper');
    const skillHtml = renderReportHtml(report, { nonce: 'n', cspSource: 'x' });
    const workspace = analyzeWorkspace(FIXTURE_ROOT, [fixturePath('helper')], genericProfile);
    const workspaceHtml = renderWorkspaceReportHtml(workspace, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: FIXTURE_ROOT },
    });

    for (const html of [skillHtml, workspaceHtml]) {
      expect(html).toContain('Not scored — frontmatter could not be parsed');
      expect(html).not.toMatch(/(?:null|undefined)\/100/);
      expect(html).not.toContain('Description quality: 0/100');
      expect(html).not.toContain('Instruction structure: 0/100');
    }
    expect(skillHtml).toContain(
      'Description quality: Not scored — frontmatter could not be parsed',
    );
    expect(skillHtml).toContain(
      'Instruction structure</div><div class="value ">Not scored — frontmatter could not be parsed',
    );
  });
});
