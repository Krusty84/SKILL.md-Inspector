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
import {
  authoringHygieneDefinition,
  descriptionCompletenessDefinition,
  lowTextCoverageDefinition,
} from '../src/ui/metricDefinitions';
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
          instructions: { state: 'scored', score: 0, label: 'defects', findings: [] },
          resources: { score: 100, label: 'clean', findings: [] },
        },
        errors: 0,
        warnings: 2,
        information: 1,
        diagnostics: [],
        profile: 'generic',
        resourceGraph: { nodes: [] },
        tokenUsage: {
          encoding: 'o200k_base',
          body: { tokens: 0, lines: 0 },
          references: { files: [], totalTokens: 0 },
          otherFiles: { files: [], totalTokens: 0 },
        },
        compatibility: {
          verifiedOn: '2026-07-26',
          projections: [
            { agent: 'spec', label: 'Regular SKILL.md', verdict: 'compatible', findings: [] },
            { agent: 'claude-code', label: 'Claude Code', verdict: 'compatible', findings: [] },
            { agent: 'codex', label: 'Codex', verdict: 'compatible', findings: [] },
            { agent: 'opencode', label: 'OpenCode', verdict: 'compatible', findings: [] },
          ],
        },
      },
    ],
    collisions: [],
    nameConflicts: [],
    similarNames: [],
    cancelled: false,
  };
}

async function loadedProvider(model = analysis()): Promise<SkillTreeProvider> {
  vi.mocked(computeWorkspaceAnalysis).mockResolvedValue({ rootDir: '/ws', analysis: model });
  const provider = new SkillTreeProvider();
  await provider.refresh();
  return provider;
}

describe('SkillTreeProvider workspace skill tooltip', () => {
  it('renders validation and authoring quality details in the tooltip', async () => {
    vi.mocked(computeWorkspaceAnalysis).mockResolvedValue({ rootDir: '/ws', analysis: analysis() });
    const provider = await loadedProvider();
    const node = provider.getChildren().find((candidate) => candidate.type === 'skill')!;
    const item = provider.getTreeItem(node);
    const tooltip = (item.tooltip as { value: string }).value;

    expect(item.description).toContain('Validation warning');
    expect(tooltip).toContain('Validation status: warning');
    expect(tooltip).toContain('Adjusted description completeness: 69/100 (acceptable)');
    expect(tooltip).toContain('Raw description completeness: 75/100');
    expect(tooltip).toContain('Grade limitations:');
    expect(tooltip).toContain('missing-usage-trigger — ceiling 69/100');
    expect(tooltip).toContain(
      'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
    );
    expect(tooltip).toContain('heuristic coverage high');
    expect(tooltip).toContain('Authoring hygiene: 0/100 (defects)');
    // Each metric name is followed by what it actually measures.
    expect(tooltip).toContain(descriptionCompletenessDefinition());
    expect(tooltip).toContain(authoringHygieneDefinition());
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

    expect(tooltip).toContain('Adjusted description completeness: 100/100 (excellent)');
    expect(tooltip).not.toContain('Raw description completeness:');
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

    expect(item.description).toContain('Completeness Not scored');
    expect(tooltip).toContain('Description completeness: Not scored — description is missing');
    expect(tooltip).toContain(
      'Instruction structure: Not scored — frontmatter could not be parsed',
    );
    expect(tooltip).not.toMatch(/(?:null|undefined)\/100/);
  });
});

describe('SkillTreeProvider collision tooltip', () => {
  function withCollision(textCoverage: 'full' | 'low') {
    const model = analysis();
    model.collisions = [
      {
        a: 'otchet-formatter',
        b: 'otchet-generator',
        similarity: 0.17,
        metrics: {
          scopeOverlap: 0.5,
          cosine: 0,
          jaccard: 0,
          charNgram: 0,
          nameSimilarity: 0.85,
          boundarySeparation: 0,
        },
        sharedTerms: [],
        risk: 'Low',
        confidence: 'low',
        textCoverage,
        recommendation: 'Minor overlap — verify the trigger contexts do not compete.',
      },
    ];
    return model;
  }

  async function collisionTooltip(textCoverage: 'full' | 'low'): Promise<string> {
    const provider = await loadedProvider(withCollision(textCoverage));
    const group = provider.getChildren().find((candidate) => candidate.type === 'collisions')!;
    const [collision] = provider.getChildren(group);
    return provider.getTreeItem(collision).tooltip as string;
  }

  it('caveats a similarity the text metrics could not contribute to', async () => {
    expect(await collisionTooltip('low')).toContain(lowTextCoverageDefinition());
  });

  it('stays quiet when the descriptions were comparable', async () => {
    expect(await collisionTooltip('full')).not.toContain('Text coverage low');
  });
});

describe('SkillTreeProvider loading', () => {
  it('returns a non-clickable spinner before analysis completes and refreshes afterward', async () => {
    vi.mocked(computeWorkspaceAnalysis).mockResolvedValue({ rootDir: '/ws', analysis: analysis() });
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

  it('queues one trailing re-run for refreshes during an active analysis', async () => {
    const provider = await loadedProvider();
    const refreshed = analysis();
    refreshed.skills[0]!.name = 'refreshed-skill';
    vi.mocked(computeWorkspaceAnalysis).mockClear();
    vi.mocked(computeWorkspaceAnalysis)
      .mockResolvedValueOnce({ rootDir: '/ws', analysis: analysis() })
      .mockResolvedValueOnce({ rootDir: '/ws', analysis: refreshed });

    const first = provider.refresh();
    const second = provider.refresh();
    const third = provider.refresh();

    // Busy-time refreshes coalesce into one queued trailing completion (they
    // used to be dropped outright, leaving the panel on stale results) ...
    expect(second).not.toBe(first);
    expect(third).toBe(second);
    // ... while the previous analysis stays visible during the refresh.
    expect(provider.getChildren()).toEqual([expect.objectContaining({ type: 'skill' })]);

    await third;
    expect(computeWorkspaceAnalysis).toHaveBeenCalledTimes(2);
    expect(provider.getChildren()).toEqual([
      expect.objectContaining({
        type: 'skill',
        skill: expect.objectContaining({ name: 'refreshed-skill' }),
      }),
    ]);
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

    vi.mocked(computeWorkspaceAnalysis).mockResolvedValue({ rootDir: '/ws', analysis: analysis() });
    await provider.refresh();
    expect(provider.getChildren()).toEqual([expect.objectContaining({ type: 'skill' })]);
  });
});
