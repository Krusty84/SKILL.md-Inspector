import { existsSync, readFileSync, readdirSync } from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSkill } from '../../src/analysis/analyzeSkill';
import { assessAuthoringQuality } from '../../src/authoring/authoringQuality';
import { genericProfile } from '../../src/profiles/genericProfile';
import { assessDocumentDescriptionQuality } from '../../src/quality/staticDescriptionQuality';
import type { QualityAssessmentState } from '../../src/types/QualityAssessment';
import type { ResourceNodeKind } from '../../src/types/Workspace';
import { analyzeWorkspace } from '../../src/workspace/analyzeWorkspace';
import { buildResourceGraph } from '../../src/workspace/buildResourceGraph';

type FixtureGroup = 'quality-ladder' | 'defect-zoo' | 'legacy';
type FrontmatterState = 'valid' | 'invalid' | 'missing';

interface ScoreExpectation {
  state: QualityAssessmentState;
  minScore?: number;
  maxScore?: number;
}

interface ResourceExpectation {
  requiredFindings: string[];
  forbiddenFindings: string[];
  requiredNodes: Array<{ path: string; kind: ResourceNodeKind }>;
}

interface FixtureExpectation {
  group: FixtureGroup;
  tier: string;
  frontmatter: FrontmatterState;
  requiredDiagnostics: string[];
  forbiddenDiagnostics: string[];
  descriptionQuality: ScoreExpectation;
  instructionQuality: ScoreExpectation;
  requiredInstructionFindings: string[];
  forbiddenInstructionFindings: string[];
  resourceExpectations?: ResourceExpectation;
  limitations?: string[];
}

const fixturesRoot = path.resolve('fixtures/skills');
const manifestPath = path.join(fixturesRoot, 'expectations.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as Record<
  string,
  FixtureExpectation
>;
const fixtureNames = readdirSync(fixturesRoot, { withFileTypes: true })
  .filter(
    (entry) => entry.isDirectory() && existsSync(path.join(fixturesRoot, entry.name, 'SKILL.md')),
  )
  .map((entry) => entry.name)
  .sort();

function frontmatterState(document: ReturnType<typeof analyzeSkill>['document']): FrontmatterState {
  if (document.parseErrors.some((error) => error.code === 'skill.frontmatter.missing')) {
    return 'missing';
  }
  return document.frontmatter === null ? 'invalid' : 'valid';
}

function assertScore(
  fixtureName: string,
  dimension: string,
  actual: { state: QualityAssessmentState; score: number | null },
  expected: ScoreExpectation,
): void {
  expect(actual.state, `${fixtureName}: ${dimension} state`).toBe(expected.state);
  if (expected.state === 'not-scored') {
    expect(actual.score, `${fixtureName}: ${dimension} not-scored value`).toBeNull();
    return;
  }

  expect(expected.minScore, `${fixtureName}: ${dimension} minScore is documented`).toBeTypeOf(
    'number',
  );
  expect(expected.maxScore, `${fixtureName}: ${dimension} maxScore is documented`).toBeTypeOf(
    'number',
  );
  expect(actual.score, `${fixtureName}: ${dimension} score is available`).not.toBeNull();
  expect(actual.score!, `${fixtureName}: ${dimension} minimum score`).toBeGreaterThanOrEqual(
    expected.minScore!,
  );
  expect(actual.score!, `${fixtureName}: ${dimension} maximum score`).toBeLessThanOrEqual(
    expected.maxScore!,
  );
}

function sortedPair(a: string, b: string): string {
  return [a, b].sort().join('|');
}

describe('SKILL.md fixture regression contract', () => {
  it('has one valid manifest entry for every fixture directory and no stale entries', () => {
    for (const fixtureName of fixtureNames) {
      expect(manifest, `${fixtureName}: missing expectations.json entry`).toHaveProperty(
        fixtureName,
      );
    }
    for (const fixtureName of Object.keys(manifest)) {
      expect(
        fixtureNames,
        `${fixtureName}: manifest entry does not have a fixture directory containing SKILL.md`,
      ).toContain(fixtureName);
    }
  });

  it.each(fixtureNames)('matches the declared expectations for %s', (fixtureName) => {
    const expected = manifest[fixtureName];
    expect(
      ['quality-ladder', 'defect-zoo', 'legacy'],
      `${fixtureName}: unsupported fixture group`,
    ).toContain(expected.group);
    expect(expected.tier, `${fixtureName}: intended tier is documented`).not.toBe('');
    expect(
      ['valid', 'invalid', 'missing'],
      `${fixtureName}: unsupported frontmatter state`,
    ).toContain(expected.frontmatter);

    const skillPath = path.join(fixturesRoot, fixtureName, 'SKILL.md');
    const analysis = analyzeSkill(skillPath, readFileSync(skillPath, 'utf8'), genericProfile, {
      mode: 'full',
    });
    const descriptionQuality = assessDocumentDescriptionQuality(analysis.document, {
      minLength: genericProfile.description.minLength,
      maxLength: genericProfile.description.maxLength,
      language: genericProfile.description.language,
      weights: genericProfile.description.weights,
    });
    const authoringQuality = assessAuthoringQuality(analysis.document);
    const resourceGraph = buildResourceGraph(analysis.document);
    const diagnosticCodes = analysis.diagnostics.map((diagnostic) => diagnostic.code);
    const instructionFindings = authoringQuality.instructions.findings.map(
      (finding) => finding.criterion,
    );

    expect(frontmatterState(analysis.document), `${fixtureName}: frontmatter state`).toBe(
      expected.frontmatter,
    );
    for (const code of expected.requiredDiagnostics) {
      expect(diagnosticCodes, `${fixtureName}: required diagnostic ${code}`).toContain(code);
    }
    for (const code of expected.forbiddenDiagnostics) {
      expect(diagnosticCodes, `${fixtureName}: forbidden diagnostic ${code}`).not.toContain(code);
    }

    assertScore(
      fixtureName,
      'description quality',
      descriptionQuality,
      expected.descriptionQuality,
    );
    assertScore(
      fixtureName,
      'instruction quality',
      authoringQuality.instructions,
      expected.instructionQuality,
    );
    for (const criterion of expected.requiredInstructionFindings) {
      expect(
        instructionFindings,
        `${fixtureName}: required instruction finding ${criterion}`,
      ).toContain(criterion);
    }
    for (const criterion of expected.forbiddenInstructionFindings) {
      expect(
        instructionFindings,
        `${fixtureName}: forbidden instruction finding ${criterion}`,
      ).not.toContain(criterion);
    }

    if (expected.resourceExpectations) {
      const resourceFindings = authoringQuality.resources.findings.map(
        (finding) => finding.criterion,
      );
      for (const criterion of expected.resourceExpectations.requiredFindings) {
        expect(
          resourceFindings,
          `${fixtureName}: required resource finding ${criterion}`,
        ).toContain(criterion);
      }
      for (const criterion of expected.resourceExpectations.forbiddenFindings) {
        expect(
          resourceFindings,
          `${fixtureName}: forbidden resource finding ${criterion}`,
        ).not.toContain(criterion);
      }
      for (const node of expected.resourceExpectations.requiredNodes) {
        expect(
          resourceGraph.nodes,
          `${fixtureName}: required ${node.kind} resource node ${node.path}`,
        ).toContainEqual(expect.objectContaining(node));
      }
    }
  });

  it('preserves cross-fixture workspace behavior', () => {
    const skillPaths = fixtureNames.map((name) => path.join(fixturesRoot, name, 'SKILL.md'));
    const workspace = analyzeWorkspace(fixturesRoot, skillPaths, genericProfile);

    expect(workspace.cancelled, 'fixture workspace: scan must complete').toBe(false);

    const conflict = workspace.nameConflicts.find(
      (candidate) => candidate.normalized === 'code-formatter',
    );
    expect(conflict, 'code-formatter/style-formatter: name conflict is required').toBeDefined();
    expect(
      conflict?.entries.map((entry) => entry.path),
      'code-formatter/style-formatter: both fixture paths must participate in the conflict',
    ).toEqual(expect.arrayContaining(['code-formatter/SKILL.md', 'style-formatter/SKILL.md']));

    const reportPair = sortedPair('engineering-report-formatter', 'pdf-report-formatter');
    const collision = workspace.collisions.find(
      (candidate) => sortedPair(candidate.a, candidate.b) === reportPair,
    );
    expect(collision, `${reportPair}: collision is required`).toBeDefined();
    expect(collision?.risk, `${reportPair}: collision risk`).toBe('High');
    expect(collision?.confidence, `${reportPair}: collision confidence`).not.toBe('low');

    const styleFormatter = workspace.skills.find(
      (skill) => skill.path === 'style-formatter/SKILL.md',
    );
    expect(
      styleFormatter?.diagnostics.map((diagnostic) => diagnostic.code),
      'style-formatter: folder/name mismatch must remain visible in workspace analysis',
    ).toContain('skill.name.folderMismatch');

    const markdownSlides = workspace.skills.find(
      (skill) => skill.path === 'markdown-slides/SKILL.md',
    );
    expect(
      markdownSlides?.resourceGraph.nodes,
      'markdown-slides: theme guide must remain a missing referenced target',
    ).toContainEqual(
      expect.objectContaining({ path: 'references/theme-guide.md', kind: 'missing' }),
    );
    expect(
      markdownSlides?.resourceGraph.nodes,
      'markdown-slides: build script must remain a missing referenced target',
    ).toContainEqual(expect.objectContaining({ path: 'scripts/build.py', kind: 'missing' }));

    const pdfFormFiller = workspace.skills.find(
      (skill) => skill.path === 'pdf-form-filler/SKILL.md',
    );
    expect(
      pdfFormFiller?.resourceGraph.nodes,
      'pdf-form-filler: field reference must be present and referenced',
    ).toContainEqual(
      expect.objectContaining({ path: 'references/field-types.md', kind: 'referenced' }),
    );
    expect(
      pdfFormFiller?.resourceGraph.nodes,
      'pdf-form-filler: fill script must be present and referenced',
    ).toContainEqual(expect.objectContaining({ path: 'scripts/fill_form.py', kind: 'referenced' }));
  });
});
