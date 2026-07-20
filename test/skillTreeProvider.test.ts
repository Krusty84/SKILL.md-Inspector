import { describe, expect, it, vi } from 'vitest';

const vscodeState = vi.hoisted(() => ({ emitters: [] as { fire: ReturnType<typeof vi.fn> }[] }));

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly fsPath: string) {}
    static file(value: string): Uri {
      return new Uri(value);
    }
  }
  class TreeItem {
    description?: string;
    tooltip?: unknown;
    iconPath?: unknown;
    resourceUri?: Uri;
    command?: unknown;
    contextValue?: string;
    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }
  class MarkdownString {
    constructor(readonly value: string) {}
  }
  return {
    Uri,
    TreeItem,
    MarkdownString,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1, Expanded: 2 },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
      constructor() {
        vscodeState.emitters.push(this);
      }
    },
    window: { withProgress: vi.fn((_options, task) => task()) },
  };
});

vi.mock('../src/analysis/workspaceAnalysis', () => ({ computeWorkspaceAnalysis: vi.fn() }));

import * as vscode from 'vscode';
import { computeWorkspaceAnalysis } from '../src/analysis/workspaceAnalysis';
import { SkillTreeProvider } from '../src/ui/skillTreeProvider';
import type { WorkspaceAnalysis } from '../src/types/Workspace';

function analysis(): WorkspaceAnalysis {
  return {
    skills: [
      {
        name: 'minimal-skill',
        path: 'skills/minimal-skill/SKILL.md',
        absolutePath: '/ws/skills/minimal-skill/SKILL.md',
        description: 'Format technical engineering reports using company layout rules.',
        validationStatus: 'warning',
        staticDescriptionQuality: {
          state: 'scored',
          score: 69,
          rawScore: 75,
          adjustedScore: 69,
          label: 'acceptable',
          findings: [],
          gradeLimitations: [
            {
              code: 'missing-usage-trigger',
              ceiling: 69,
              reason:
                'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
            },
          ],
          coverage: 'high',
          limitations: [],
        },
        authoringQuality: {
          instructions: { state: 'scored', score: 0, label: 'poor', findings: [] },
          resources: { score: 100, label: 'excellent', findings: [] },
        },
        errors: 0,
        warnings: 2,
        information: 1,
        diagnostics: [],
        profile: 'generic',
        profileCompatibility: {
          generic: 'pass',
          vscode: 'pass',
          claude: 'pass',
          codex: 'pass',
        },
        portability: [
          { profile: 'generic', status: 'pass', notes: [], diagnostics: [] },
          { profile: 'vscode', status: 'pass', notes: [], diagnostics: [] },
          { profile: 'claude', status: 'pass', notes: [], diagnostics: [] },
          { profile: 'codex', status: 'pass', notes: [], diagnostics: [] },
        ],
        resourceGraph: { nodes: [] },
      },
    ],
    collisions: [],
    nameConflicts: [],
    similarNames: [],
    cancelled: false,
  };
}

async function loadedProvider(model = analysis()): Promise<SkillTreeProvider> {
  vi.mocked(computeWorkspaceAnalysis).mockReturnValue({ rootDir: '/ws', analysis: model });
  const provider = new SkillTreeProvider();
  await provider.refresh();
  return provider;
}

describe('SkillTreeProvider workspace skill tooltip', () => {
  it('separates validation and authoring quality from format compatibility', async () => {
    vi.mocked(computeWorkspaceAnalysis).mockReturnValue({ rootDir: '/ws', analysis: analysis() });
    const provider = await loadedProvider();
    const node = provider.getChildren().find((candidate) => candidate.type === 'skill')!;
    const item = provider.getTreeItem(node);
    const tooltip = (item.tooltip as { value: string }).value;

    expect(item.description).toContain('Validation warning');
    expect(tooltip).toContain('Validation status: warning');
    expect(tooltip).toContain('Adjusted Static Description Quality: 69/100 (acceptable)');
    expect(tooltip).toContain('Raw Static Description Quality: 75/100');
    expect(tooltip).toContain('Grade limitations:');
    expect(tooltip).toContain('missing-usage-trigger — ceiling 69/100');
    expect(tooltip).toContain(
      'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
    );
    expect(tooltip).toContain('heuristic coverage high');
    expect(tooltip).toContain('Instruction authoring quality: 0/100 (poor)');
    expect(tooltip).toContain('Format/portability compatibility: generic ✓');
    expect(tooltip).toContain('do not include general description or instruction-body quality');
  });

  it('does not show adjustment details when no ceiling was applied', async () => {
    const model = analysis();
    const quality = model.skills[0].staticDescriptionQuality;
    quality.score = 100;
    quality.rawScore = 100;
    quality.adjustedScore = 100;
    quality.label = 'excellent';
    quality.gradeLimitations = [];
    const provider = await loadedProvider(model);
    const node = provider.getChildren().find((candidate) => candidate.type === 'skill')!;
    const item = provider.getTreeItem(node);
    const tooltip = (item.tooltip as { value: string }).value;

    expect(tooltip).toContain('Adjusted Static Description Quality: 100/100 (excellent)');
    expect(tooltip).not.toContain('Raw Static Description Quality:');
    expect(tooltip).not.toContain('Grade limitations:');
  });

  it('renders not-scored states without numeric placeholders or quality labels', async () => {
    const model = analysis();
    model.skills[0].staticDescriptionQuality = {
      state: 'not-scored',
      score: null,
      rawScore: null,
      adjustedScore: null,
      label: null,
      notScoredReason: 'description is missing',
      findings: [],
      gradeLimitations: [],
      coverage: 'low',
      limitations: ['description is missing'],
    };
    model.skills[0].authoringQuality.instructions = {
      state: 'not-scored',
      score: null,
      label: null,
      notScoredReason: 'frontmatter could not be parsed',
      findings: [],
    };
    const provider = await loadedProvider(model);
    const node = provider.getChildren().find((candidate) => candidate.type === 'skill')!;
    const item = provider.getTreeItem(node);
    const tooltip = (item.tooltip as { value: string }).value;

    expect(item.description).toContain('SDQ Not scored');
    expect(tooltip).toContain('Description quality: Not scored — description is missing');
    expect(tooltip).toContain(
      'Instruction structure: Not scored — frontmatter could not be parsed',
    );
    expect(tooltip).not.toMatch(/(?:null|undefined)\/100/);
  });
});

describe('SkillTreeProvider loading', () => {
  it('returns a non-clickable spinner before analysis completes and refreshes afterward', async () => {
    vi.mocked(computeWorkspaceAnalysis).mockReturnValue({ rootDir: '/ws', analysis: analysis() });
    const provider = new SkillTreeProvider();

    const [loading] = provider.getChildren();
    const item = provider.getTreeItem(loading!);

    expect(loading).toEqual({ type: 'loading', text: 'Analyzing workspace skills…' });
    expect((item.iconPath as { id: string }).id).toBe('loading~spin');
    expect(item.command).toBeUndefined();
    expect(item.resourceUri).toBeUndefined();
    const refreshesBeforeCompletion = vscodeState.emitters.at(-1)?.fire.mock.calls.length ?? 0;
    await provider.refresh();
    expect(vscodeState.emitters.at(-1)?.fire.mock.calls.length).toBeGreaterThan(
      refreshesBeforeCompletion,
    );
    expect(vscode.window.withProgress).toHaveBeenCalledWith(
      { location: { viewId: 'skillMdInspectorSkills' } },
      expect.any(Function),
    );
    expect(provider.getChildren()).toEqual([expect.objectContaining({ type: 'skill' })]);
  });

  it('reuses an active refresh and keeps previous analysis visible', async () => {
    const provider = await loadedProvider();
    vi.mocked(computeWorkspaceAnalysis).mockClear();

    const first = provider.refresh();
    const second = provider.refresh();

    expect(first).toBe(second);
    expect(provider.getChildren()).toEqual([expect.objectContaining({ type: 'skill' })]);
    await first;
    expect(computeWorkspaceAnalysis).toHaveBeenCalledTimes(1);
  });

  it('clears failed loading state and permits retry', async () => {
    vi.mocked(computeWorkspaceAnalysis).mockImplementationOnce(() => {
      throw new Error('failed');
    });
    const provider = new SkillTreeProvider();

    await expect(provider.refresh()).rejects.toThrow('failed');
    expect(provider.getChildren()).toEqual([
      { type: 'message', text: 'Unable to analyze workspace skills.' },
    ]);

    vi.mocked(computeWorkspaceAnalysis).mockReturnValue({ rootDir: '/ws', analysis: analysis() });
    await provider.refresh();
    expect(provider.getChildren()).toEqual([expect.objectContaining({ type: 'skill' })]);
  });
});
