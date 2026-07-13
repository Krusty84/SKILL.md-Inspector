import { describe, it, expect } from 'vitest';
import { renderWorkspaceReportHtml } from '../src/ui/renderWorkspaceReport';
import type { WorkspaceAnalysis } from '../src/types/Workspace';

function analysis(): WorkspaceAnalysis {
  return {
    skills: [
      {
        name: 'pdf-report-formatter',
        path: 'skills/pdf-report-formatter/SKILL.md',
        absolutePath: '/ws/skills/pdf-report-formatter/SKILL.md',
        description: 'Format PDF reports.',
        triggerQualityScore: 90,
        triggerQualityLabel: 'excellent',
        errors: 0,
        warnings: 1,
        information: 0,
        profile: 'generic',
        profileCompatibility: { generic: 'pass', vscode: 'pass', claude: 'warning', codex: 'pass' },
        portability: [
          { profile: 'generic', status: 'pass', notes: [], diagnostics: [] },
          { profile: 'vscode', status: 'pass', notes: [], diagnostics: [] },
          { profile: 'claude', status: 'warning', notes: ['too long'], diagnostics: [] },
          { profile: 'codex', status: 'pass', notes: [], diagnostics: [] },
        ],
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
  };
}

describe('renderWorkspaceReportHtml', () => {
  it('renders the collision matrix, portability, and resources with a CSP', () => {
    const html = renderWorkspaceReportHtml(analysis(), {
      nonce: 'n',
      cspSource: 'vscode-webview://x',
    });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('Collision matrix');
    expect(html).toContain('0.84');
    expect(html).toContain('High');
    expect(html).toContain('references/unused.md');
    expect(html).toContain('pdf-report-formatter');
    expect(html).toContain('Duplicate names');
    expect(html).toContain('skills/b/SKILL.md'); // every conflicting path is listed
    expect(html).toContain('Similar names');
    expect(html).toContain('pdf-reports-formatter');
  });

  it('escapes HTML in skill names', () => {
    const model = analysis();
    model.skills[0].name = '<script>alert(1)</script>';
    const html = renderWorkspaceReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).not.toContain('<script>alert(1)');
    expect(html).toContain('&lt;script&gt;');
  });
});
