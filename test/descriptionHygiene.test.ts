import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  resolveHeuristicDictionaries,
} from '../src/quality/dictionaries';
import { analyzeDescription } from '../src/quality/descriptionHeuristics';
import { genericProfile } from '../src/profiles';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillProfile } from '../src/types/SkillProfile';
import { renderWorkspaceReportHtml } from '../src/ui/renderWorkspaceReport';
import { analyzeWorkspace, buildSkillsIndex } from '../src/workspace/analyzeWorkspace';

function diagnostics(description: string, profile: SkillProfile = genericProfile) {
  const content = `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`;
  return analyzeSkill('/ws/skills/demo/SKILL.md', content, profile, {
    mode: 'text-only',
  }).diagnostics;
}

function fixtureCodes(name: string, profile: SkillProfile = genericProfile): string[] {
  const fixturePath = path.resolve(`fixtures/skills/${name}/SKILL.md`);
  return analyzeSkill(fixturePath, readFileSync(fixturePath, 'utf8'), profile, {
    mode: 'text-only',
  }).diagnostics.map((diagnostic) => diagnostic.code);
}

describe('overbroad description trigger detection', () => {
  it.each([
    'Always use this skill, for PDF reports.',
    'ALWAYS USE THIS SKILL — for PDF reports.',
    'Use this skill whenever a PDF is mentioned.',
    'Use this skill whenever PDF forms are mentioned!',
    'This skill should always be used for reports.',
    'Use this skill for anything involving reports.',
  ])('matches case-insensitively with boundaries and punctuation: %s', (description) => {
    expect(analyzeDescription(description).overbroadTrigger.found).toBe(true);
  });

  it.each([
    'Always preserve code blocks.',
    'Always verify the generated PDF before delivery.',
    'Never delete source files.',
    'Format reports in any way that preserves their tables.',
    'A basically always-on report service.',
    'This skillful formatter generates reports.',
  ])('does not mistake operational or partial-word text for trigger scope: %s', (description) => {
    expect(analyzeDescription(description).overbroadTrigger.found).toBe(false);
  });

  it('supports complete replacement and explicit extension of the configurable dictionary', () => {
    const replacement = resolveHeuristicDictionaries({
      overbroadTriggerPhrases: ['activate universally'],
    });
    expect(
      analyzeDescription('Always use this skill for reports.', replacement).overbroadTrigger.found,
    ).toBe(false);
    expect(
      analyzeDescription('Use this skill to activate universally.', replacement).overbroadTrigger
        .found,
    ).toBe(true);

    const extension = resolveHeuristicDictionaries({
      overbroadTriggerPhrases: [
        ...DEFAULT_HEURISTIC_DICTIONARIES.overbroadTriggerPhrases,
        'activate universally',
      ],
    });
    expect(
      analyzeDescription('Always use this skill for reports.', extension).overbroadTrigger.found,
    ).toBe(true);
    expect(
      analyzeDescription('Use this skill to activate universally.', extension).overbroadTrigger
        .found,
    ).toBe(true);
  });
});

describe('instruction-heavy description detection', () => {
  it('detects four Step N markers', () => {
    const analysis = analyzeDescription(
      'Generate reports. Step 1, inspect data. Step 2, validate rows. Step 3, format tables. Step 4, export PDF.',
    );
    expect(analysis.instructionHeavy).toMatchObject({ found: true, stepMarkerCount: 4 });
  });

  it('detects four numbered workflow clauses', () => {
    const analysis = analyzeDescription(
      'Generate reports. 1. Inspect data. 2. Validate rows. 3. Format tables. 4. Export PDF.',
    );
    expect(analysis.instructionHeavy).toMatchObject({ found: true, numberedClauseCount: 4 });
  });

  it('detects six imperative workflow sentences using the action-verb dictionary', () => {
    const analysis = analyzeDescription(
      'Generate reports. Inspect source data. Validate every row. Format the tables. Compare totals. Summarize exceptions.',
    );
    expect(analysis.instructionHeavy).toMatchObject({ found: true, imperativeSentenceCount: 6 });
  });

  it('detects a description over 500 characters with three workflow markers', () => {
    const description = `Generate reports. Step 1, inspect data. Step 2, validate rows. Step 3, format tables. ${'Context for audited customer reporting. '.repeat(14)}`;
    const analysis = analyzeDescription(description);
    expect(analysis.length).toBeGreaterThan(500);
    expect(analysis.instructionHeavy.found).toBe(true);
    expect(analysis.instructionHeavy.workflowMarkerCount).toBeGreaterThanOrEqual(3);
  });
});

describe('description hygiene fixture regressions', () => {
  it('detects the intended fixtures', () => {
    expect(fixtureCodes('webhook-debugger')).toEqual(
      expect.arrayContaining([
        DiagnosticCode.DescriptionOverbroadTrigger,
        DiagnosticCode.DescriptionInstructionHeavy,
        DiagnosticCode.DescriptionTooVerbose,
      ]),
    );

    const report = fixtureCodes('report-generator');
    expect(report).toContain(DiagnosticCode.DescriptionOverbroadTrigger);
    expect(report).toContain(DiagnosticCode.DescriptionTooLong);
    expect(report).not.toContain(DiagnosticCode.DescriptionTooVerbose);
  });

  it.each(['api-error-triage', 'pdf-form-filler', 'changelog-writer', 'csv-cleaner'])(
    'keeps %s free of the new diagnostics',
    (name) => {
      const codes = fixtureCodes(name);
      expect(codes).not.toContain(DiagnosticCode.DescriptionOverbroadTrigger);
      expect(codes).not.toContain(DiagnosticCode.DescriptionInstructionHeavy);
      expect(codes).not.toContain(DiagnosticCode.DescriptionTooVerbose);
    },
  );

  it('uses the configured maximum for the hard length error', () => {
    const strictProfile: SkillProfile = {
      ...genericProfile,
      description: { ...genericProfile.description, maxLength: 500 },
    };
    const overConfiguredMaximum = diagnostics(
      `Generate reports. Use when auditing reports. ${'x'.repeat(600)}`,
      strictProfile,
    );
    expect(overConfiguredMaximum.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticCode.DescriptionTooLong,
    );
    expect(overConfiguredMaximum.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.DescriptionTooVerbose,
    );
  });
});

describe('description hygiene grade-limitation visibility', () => {
  it('includes the ceiling explanation in diagnostics, exported output, and rendered output', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'description-hygiene-'));
    const skillPath = path.join(root, 'demo', 'SKILL.md');
    const description =
      'Format inspection reports using standard rules. Use when preparing customer audits. Always use this skill for everything involving reports. Do not use for invoices.';
    try {
      mkdirSync(path.dirname(skillPath), { recursive: true });
      writeFileSync(
        skillPath,
        `---\nname: demo\ndescription: ${JSON.stringify(description)}\n---\n`,
      );
      const analysis = analyzeWorkspace(root, [skillPath], genericProfile);
      const diagnostic = analysis.skills[0].diagnostics.find(
        (item) => item.code === DiagnosticCode.DescriptionOverbroadTrigger,
      );
      expect(diagnostic).toBeDefined();

      const limitation = analysis.skills[0].staticDescriptionQuality.gradeLimitations.find(
        (item) => item.code === 'overbroad-usage-scope',
      );
      expect(limitation).toMatchObject({ ceiling: 69 });
      expect(limitation?.reason).toContain('cannot exceed 69');

      const exported = JSON.stringify(buildSkillsIndex(analysis));
      expect(exported).toContain('overbroad-usage-scope');
      expect(exported).toContain('cannot exceed 69');

      const rendered = renderWorkspaceReportHtml(analysis, {
        nonce: 'n',
        cspSource: 'x',
        scope: { kind: 'workspace', folderPath: root },
      });
      expect(rendered).toContain('<code>overbroad-usage-scope</code> — ceiling: 69/100');
      expect(rendered).toContain('cannot exceed 69');
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('explains where detailed procedure belongs in the diagnostic finding', () => {
    const description =
      'Generate PDF reports. Step 1, inspect data. Step 2, validate rows. Step 3, format tables. Step 4, export PDF.';
    const finding = diagnostics(description).find(
      (diagnostic) => diagnostic.code === DiagnosticCode.DescriptionInstructionHeavy,
    );
    expect(finding?.message).toContain('capability and trigger scope');
    expect(finding?.message).toContain('Markdown body');
    expect(finding?.message).toContain('capped at 74');
  });
});
