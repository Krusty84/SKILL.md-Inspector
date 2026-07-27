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
  onlineEnabled: false,
  codexCompatEnabled: true,
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
        if (key === 'links.onlineCheck.enabled') {
          return hoisted.onlineEnabled;
        }
        if (key === 'validation.compatibilityAgents.codex') {
          return hoisted.codexCompatEnabled;
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
  hoisted.onlineEnabled = false;
  hoisted.codexCompatEnabled = true;
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

  it('omits agents disabled in settings from the compatibility projection', async () => {
    hoisted.codexCompatEnabled = false;
    hoisted.content = [
      '---',
      'name: demo',
      'description: Frobnicate widgets. Use when widget settings drift. Do not use for invoices.',
      '---',
      '',
      'Body.',
    ].join('\n');

    await showSkillReport();

    expect(hoisted.report?.compatibility.projections.map((p) => p.agent)).toEqual([
      'spec',
      'claude-code',
      'opencode',
    ]);
  });

  it('includes online diagnostics in the full skill report when enabled', async () => {
    hoisted.onlineEnabled = true;
    hoisted.content = [
      '---',
      'name: demo',
      'description: Frobnicate widgets. Use when widget settings drift. Do not use for invoices.',
      '---',
      '',
      '[docs](https://example.com/missing)',
    ].join('\n');

    await showSkillReport(undefined, {
      dns: {
        resolve: async () => [{ address: '93.184.216.34', family: 4 }],
      },
      transport: {
        request: async ({ address }) => ({
          statusCode: 404,
          connectedAddress: address,
        }),
      },
    });

    expect(hoisted.report?.diagnostics.map((diagnostic) => diagnostic.code)).toContain(
      DiagnosticCode.LinkRemoteUnavailable,
    );
  });
});
