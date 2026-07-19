import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillAnalysis } from '../src/analysis/analyzeSkill';
import type { SkillReport } from '../src/ui/reportModel';

const hoisted = vi.hoisted(() => ({
  analysis: undefined as SkillAnalysis | undefined,
  content: '',
  filePath: '',
  report: undefined as SkillReport | undefined,
}));

vi.mock('vscode', () => ({
  workspace: {
    getConfiguration: vi.fn(() => ({
      get: vi.fn((key: string, fallback?: unknown) => {
        if (key === 'heuristics.dictionaryValues.actionVerbs') {
          return ['frobnicate'];
        }
        if (key === 'resources.directories') {
          return ['playbooks'];
        }
        return fallback;
      }),
    })),
  },
}));

vi.mock('../src/commands/resolveSkillTarget', () => ({
  resolveSkillTarget: vi.fn(async () => ({
    document: {
      uri: { fsPath: hoisted.filePath },
      getText: () => hoisted.content,
    },
  })),
}));

vi.mock('../src/analysis/analyzeSkill', async (importOriginal) => {
  const original = await importOriginal<typeof import('../src/analysis/analyzeSkill')>();
  return {
    ...original,
    analyzeSkill: vi.fn((...args: Parameters<typeof original.analyzeSkill>) => {
      const result = original.analyzeSkill(...args);
      hoisted.analysis = result;
      return result;
    }),
  };
});

vi.mock('../src/ui/skillReportWebview', () => ({
  SkillReportPanel: {
    show: vi.fn((report: SkillReport) => {
      hoisted.report = report;
    }),
  },
}));

import { showSkillReport } from '../src/commands/showSkillReport';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-report-'));
  hoisted.filePath = path.join(dir, 'SKILL.md');
  hoisted.analysis = undefined;
  hoisted.report = undefined;
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

describe('showSkillReport', () => {
  it('uses the resolved dictionaries and resource directories for analysis and scoring', async () => {
    fs.mkdirSync(path.join(dir, 'playbooks'));
    fs.writeFileSync(path.join(dir, 'playbooks', 'guide.md'), '# Guide');
    hoisted.content = [
      '---',
      'name: demo',
      'description: Frobnicate widgets with calibrated settings. Use when widget settings drift. Do not use for invoices.',
      '---',
      '',
      '## When to use',
      '',
      'Use this skill when widget settings drift.',
      '',
      '## Examples',
      '',
      'Given a widget, return its calibrated settings.',
    ].join('\n');

    await showSkillReport();

    const diagnostics = hoisted.analysis?.diagnostics ?? [];
    const resourceWarnings = diagnostics.filter(
      (diagnostic) => diagnostic.code === DiagnosticCode.ResourceUnreferenced,
    );
    expect(diagnostics.map((diagnostic) => diagnostic.code)).not.toContain(
      DiagnosticCode.DescriptionNoVerb,
    );
    expect(resourceWarnings).toHaveLength(1);
    expect(resourceWarnings[0]?.message).toContain('playbooks/guide.md');

    const report = hoisted.report;
    expect(
      report?.staticDescriptionQuality.findings.find((finding) =>
        finding.criterion.startsWith('Action verb'),
      )?.pointsEarned,
    ).toBe(20);
    expect(report?.warningCount).toBe(
      diagnostics.filter((diagnostic) => diagnostic.severity === 'warning').length,
    );
    expect(report?.unreferencedFiles).toContain('playbooks/guide.md');
  });
});
