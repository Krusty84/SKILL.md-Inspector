import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { renderWorkspaceReportHtml } from '../src/ui/renderWorkspaceReport';
import { analyzeWorkspace } from '../src/workspace/analyzeWorkspace';
import { genericProfile } from '../src/profiles/genericProfile';
import type { WorkspaceAnalysis } from '../src/types/Workspace';

function analysis(): WorkspaceAnalysis {
  return {
    skills: [
      {
        name: 'pdf-report-formatter',
        path: 'skills/pdf-report-formatter/SKILL.md',
        absolutePath: '/ws/skills/pdf-report-formatter/SKILL.md',
        description: 'Format PDF reports.',
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
              reason: 'No concrete usage-trigger content is present.',
            },
          ],
          coverage: 'medium',
          limitations: ['The description is short.'],
        },
        authoringQuality: {
          instructions: {
            state: 'scored',
            score: 0,
            label: 'poor',
            findings: [
              {
                criterion: 'Substantive body',
                severity: 'major',
                message: 'Instruction body is empty.',
                suggestion: 'Write instructions.',
              },
            ],
          },
          resources: { score: 90, label: 'excellent', findings: [] },
        },
        errors: 0,
        warnings: 1,
        information: 0,
        diagnostics: [],
        profile: 'generic',
        resourceGraph: {
          nodes: [{ path: 'references/unused.md', kind: 'unreferenced', flags: [] }],
        },
      },
    ],
    collisions: [
      {
        a: 'pdf-report-formatter',
        b: 'engineering-report-formatter',
        similarity: 0.84,
        metrics: {
          cosine: 0.84,
          jaccard: 0.8,
          charNgram: 0.9,
          nameSimilarity: 0.6,
          boundarySeparation: 0,
        },
        sharedTerms: ['format', 'report'],
        risk: 'High',
        confidence: 'high',
        recommendation: 'Merge or differentiate.',
      },
    ],
    nameConflicts: [
      {
        normalized: 'pdf-helper',
        entries: [
          { name: 'pdf-helper', path: 'skills/a/SKILL.md' },
          { name: 'PDF-Helper', path: 'skills/b/SKILL.md' },
        ],
      },
    ],
    similarNames: [
      {
        a: 'pdf-report-formatter',
        b: 'pdf-reports-formatter',
        aPath: 'skills/x/SKILL.md',
        bPath: 'skills/y/SKILL.md',
        similarity: 0.95,
      },
    ],
    cancelled: false,
  };
}

describe('renderWorkspaceReportHtml', () => {
  it('renders the collision matrix and external-file issue count with a CSP', () => {
    const html = renderWorkspaceReportHtml(analysis(), {
      nonce: 'n',
      cspSource: 'vscode-webview://x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('Collision matrix');
    expect(html).toContain('0.84');
    expect(html).toContain('High');
    expect(html).toContain('External file issues');
    expect(html).toContain('<td class="warn">1 issue</td>');
    expect(html).not.toContain('references/unused.md');
    expect(html).not.toContain('Resource graphs');
    expect(html).toContain('pdf-report-formatter');
    expect(html).toContain('Duplicate names');
    expect(html).toContain('skills/b/SKILL.md'); // every conflicting path is listed
    expect(html).toContain('Similar names');
    expect(html).toContain('pdf-reports-formatter');
    expect(html).toContain('Validation status');
    expect(html).toContain('>warning</td>');
    expect(html).toContain('69/100 · Acceptable');
    expect(html).toContain('(raw: 75/100)');
    expect(html).toContain('<code>missing-usage-trigger</code> — ceiling: 69/100');
    expect(html).toContain('No concrete usage-trigger content is present.');
    expect(html).toContain('Heuristic coverage');
    expect(html).toContain('>medium</td>');
    expect(html).toContain('Instruction authoring quality');
    expect(html).toContain('0/100 · poor');
    expect(html).toContain('Information');
    expect(html).toContain("<title>Workspace SKILL.md's Report</title>");
    expect(html).toContain('<strong>Folder:</strong> <code>/ws</code>');
  });

  it('shows OK when a skill has no external-file issues', () => {
    const model = analysis();
    model.skills[0].resourceGraph.nodes = [
      { path: 'references/guide.md', kind: 'referenced', flags: [] },
      { path: 'https://example.com/guide', kind: 'remote', flags: ['remote'] },
    ];

    const html = renderWorkspaceReportHtml(model, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });

    expect(html).toContain('<td class="ok">OK</td>');
    expect(html).not.toContain('references/guide.md');
    expect(html).not.toContain('https://example.com/guide');
  });

  it('marks missing external files as errors without listing their paths', () => {
    const model = analysis();
    model.skills[0].resourceGraph.nodes = [
      { path: 'references/missing.md', kind: 'missing', flags: [] },
      { path: '/shared/guide.md', kind: 'absolute', flags: [] },
    ];

    const html = renderWorkspaceReportHtml(model, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });

    expect(html).toContain('<td class="fail">2 issues</td>');
    expect(html).not.toContain('references/missing.md');
    expect(html).not.toContain('/shared/guide.md');
  });

  it('identifies the agent and folder for an installed-agent report', () => {
    const html = renderWorkspaceReportHtml(analysis(), {
      nonce: 'n',
      cspSource: 'x',
      scope: {
        kind: 'installed-agent',
        agentLabel: 'Codex <local>',
        folderPath: '/Users/example/.codex/skills',
      },
    });

    expect(html).toContain("<title>Codex &lt;local&gt; Agent SKILL.md's Report</title>");
    expect(html).toContain("<h1>Codex &lt;local&gt; Agent SKILL.md's Report</h1>");
    expect(html).toContain('<strong>Folder:</strong> <code>/Users/example/.codex/skills</code>');
  });

  it('escapes HTML in skill names', () => {
    const model = analysis();
    model.skills[0].name = '<script>alert(1)</script>';
    model.skills[0].staticDescriptionQuality.gradeLimitations[0].reason =
      '<img src=x onerror=alert(1)>';
    const html = renderWorkspaceReportHtml(model, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('&lt;img src=x');
  });

  it('renders the minimal frontmatter-only regression without conflating validation and quality', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'workspace-report-minimal-'));
    const skillPath = path.join(root, 'minimal-skill', 'SKILL.md');
    try {
      fs.mkdirSync(path.dirname(skillPath), { recursive: true });
      fs.writeFileSync(
        skillPath,
        [
          '---',
          'name: minimal-skill',
          'description: Format technical engineering reports using company layout rules.',
          '---',
        ].join('\n'),
      );
      const model = analyzeWorkspace(root, [skillPath], genericProfile);
      const minimal = model.skills[0];
      const html = renderWorkspaceReportHtml(model, {
        nonce: 'n',
        cspSource: 'x',
        scope: { kind: 'workspace', folderPath: root },
      });

      expect(minimal.validationStatus).toBe('warning');
      expect(minimal.staticDescriptionQuality.label).toBe('acceptable');
      expect(minimal.authoringQuality.instructions).toMatchObject({ score: 0, label: 'poor' });
      expect(html).toContain('<td class="warn">warning</td>');
      expect(minimal.staticDescriptionQuality).toMatchObject({
        adjustedScore: 69,
        label: 'acceptable',
        rawScore: 75,
      });
      expect(html).toContain('69/100 · Acceptable');
      expect(html).toContain('(raw: 75/100)');
      expect(html).toContain('<code>missing-usage-trigger</code> — ceiling: 69/100');
      expect(html).toContain(
        'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
      );
      expect(html).toContain('0/100 · poor');
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not render adjustment details when raw and adjusted scores are equal', () => {
    const model = analysis();
    const quality = model.skills[0].staticDescriptionQuality;
    quality.score = 100;
    quality.rawScore = 100;
    quality.adjustedScore = 100;
    quality.label = 'excellent';
    quality.gradeLimitations = [];

    const html = renderWorkspaceReportHtml(model, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });

    expect(html).toContain('100/100 · Excellent');
    expect(html).not.toContain('(raw:');
    expect(html).not.toContain('<details class="grade-limitations">');
  });
});
