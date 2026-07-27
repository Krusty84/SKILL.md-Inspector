import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { buildReportModel } from '../src/ui/reportModel';
import { renderReportHtml } from '../src/ui/renderReport';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-inspector-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function report(content: string) {
  const { document, diagnostics, tokenUsage } = analyzeSkill(
    path.join(dir, 'SKILL.md'),
    content,
    genericProfile,
  );
  return buildReportModel(document, diagnostics, genericProfile, tokenUsage);
}

describe('buildReportModel', () => {
  it('summarizes a well-formed skill as passing and includes a static description quality score', () => {
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references', 'guide.md'), '# Guide');
    const content = [
      '---',
      'name: demo',
      'description: Format inspection reports using company rules. Use when asked to standardize reports. Do not use for contracts.',
      '---',
      '',
      '## When to use',
      'text',
      '',
      'See [guide](./references/guide.md).',
    ].join('\n');

    const model = report(content);
    expect(model.status).toBe('pass');
    expect(model.errorCount).toBe(0);
    expect(model.referencedFiles).toContain('references/guide.md');
    expect(model.staticDescriptionQuality.score).toBeGreaterThanOrEqual(75);
    expect(model.staticDescriptionQuality.findings).toHaveLength(7);
    expect(
      model.staticDescriptionQuality.findings.find((f) => f.criterion.startsWith('Action verb'))
        ?.pointsEarned,
    ).toBe(20);
    expect(
      // Generic profile de-emphasizes the boundary criterion (weight 5); the
      // single concrete artifact "contracts" earns the clause full credit.
      model.staticDescriptionQuality.findings.find((f) => f.criterion === 'Boundary phrase')
        ?.pointsEarned,
    ).toBe(5);
  });

  it('marks a skill with errors as failing', () => {
    const model = report('---\nname: Bad Name\ndescription: Helps.\n---\n');
    expect(model.status).toBe('fail');
    expect(model.errorCount).toBeGreaterThan(0);
    expect(model.staticDescriptionQuality.label).toBe('poor');
  });

  it('keeps the substantive engineering report formatter fixture at minor issues', () => {
    const fixturePath = path.resolve('demo_skills/skills/engineering-report-formatter/SKILL.md');
    const content = fs.readFileSync(fixturePath, 'utf8');
    const { document, diagnostics, tokenUsage } = analyzeSkill(
      fixturePath,
      content,
      genericProfile,
    );
    const model = buildReportModel(document, diagnostics, genericProfile, tokenUsage);

    // One minor finding costs 10 points, so a real finding can never read as clean.
    expect(model.authoringQuality.instructions.score).toBe(90);
    expect(model.authoringQuality.instructions.label).toBe('minor-issues');
  });

  it('reports warnings without treating description or authoring quality as validation', () => {
    const model = report(
      [
        '---',
        'name: engineering-report-formatter',
        'description: Format technical engineering reports using company layout rules.',
        '---',
      ].join('\n'),
    );

    expect(model.status).toBe('warning');
    expect(model.errorCount).toBe(0);
    expect(model.diagnostics.map((diagnostic) => diagnostic.code)).toEqual([
      DiagnosticCode.DescriptionNoTrigger,
      DiagnosticCode.DescriptionNoBoundary,
      DiagnosticCode.BodyMissing,
    ]);
    expect(model.warningCount).toBe(2);
    expect(model.informationCount).toBe(1);
    expect(model.authoringQuality.instructions.score).toBe(0);
    expect(model.authoringQuality.instructions.label).toBe('defects');
    expect(model.authoringQuality.resources.score).toBe(100);
  });
});

describe('renderReportHtml', () => {
  it('renders a self-contained document with the nonce, CSP, and score', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    const html = renderReportHtml(model, { nonce: 'abc123', cspSource: 'vscode-webview://x' });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-abc123');
    expect(html).toContain('demo');
    expect(html).toContain('Description completeness');
    expect(html).toContain(`${model.staticDescriptionQuality.score}`);
    expect(html).toContain('Reference files (0)');
    expect(html).toContain('Other text files (0)');
    expect(html).toContain('Aggregate total: 0 tokens');
    // Left-hand section navigation with anchor links to each section.
    expect(html).toContain('class="report-toc"');
    expect(html).toContain('href="#validation-findings"');
    expect(html).toContain('href="#token-usage"');
    expect(html).toContain('href="#reference-files"');
  });

  it('renders the agent compatibility projection with the verbatim footer', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\nBody.');
    expect(model.compatibility.projections.map((p) => p.agent)).toEqual([
      'spec',
      'claude-code',
      'codex',
      'opencode',
    ]);

    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).toContain('<h2 id="agent-compatibility">Agent compatibility</h2>');
    expect(html).toContain('href="#agent-compatibility"');
    expect(html).toContain('Spec (skills-ref)');
    expect(html).toContain('Claude Code');
    expect(html).toContain('OpenCode');
    // The temp-dir location is outside every documented discovery path, so the
    // tool agents carry notes.
    expect(html).toContain('compatible with notes');
    expect(html).toContain(
      `Based on documented behavior verified on ${model.compatibility.verifiedOn}. This is a static projection, not a runtime test — it does not prove an agent will select or correctly execute the skill.`,
    );
  });

  it('escapes HTML in compatibility finding messages', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\nBody.');
    model.compatibility.projections[0].findings.push({
      agent: 'spec',
      level: 'issue',
      kind: 'field-rejected',
      message: '<img src=x onerror=alert(4)>',
      subject: 'x',
    });
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).not.toContain('<img src=x onerror=alert(4)>');
    expect(html).toContain('&lt;img src=x onerror=alert(4)&gt;');
  });

  it('renders the generated-at timestamp when provided', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    const html = renderReportHtml(model, {
      nonce: 'n',
      cspSource: 'x',
      generatedAt: 'STAMP-123',
    });
    expect(html).toContain('Generated: STAMP-123');
  });

  it('omits the generated-at line when no timestamp is provided', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).not.toContain('Generated:');
  });

  it('escapes HTML in dynamic values to prevent injection', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    model.name = '<img src=x onerror=alert(1)>';
    model.staticDescriptionQuality.limitations = ['<img src=x onerror=alert(2)>'];
    model.staticDescriptionQuality.gradeLimitations[0].reason = '<img src=x onerror=alert(3)>';
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
    expect(html).toContain('Heuristic coverage limitations');
    expect(html).toContain('Grade limitations and score adjustments');
  });

  it('renders deterministic o200k_base file counts, totals, and escaped paths', () => {
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.mkdirSync(path.join(dir, 'templates'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references', 'z.md'), 'zulu');
    fs.writeFileSync(path.join(dir, 'references', 'a<&>.md'), 'alpha');
    fs.writeFileSync(path.join(dir, 'templates', '<card>.txt'), 'template');
    const model = report(
      [
        '---',
        'name: demo',
        'description: Format reports. Use when needed. Do not use for contracts.',
        '---',
        'Body text.',
      ].join('\n'),
    );
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });

    expect(model.tokenUsage.references.files.map((entry) => entry.relativePath)).toEqual([
      'references/a<&>.md',
      'references/z.md',
    ]);
    expect(html).toContain('Token usage (o200k_base)');
    expect(html).toContain('Reference files (2)');
    expect(html).toContain('Other text files (1)');
    expect(html).toContain('references/a&lt;&amp;&gt;.md');
    expect(html).toContain('templates/&lt;card&gt;.txt');
    expect(html).toContain(
      `Aggregate total: ${model.tokenUsage.references.totalTokens.toLocaleString('en-US')} tokens`,
    );
    expect(html).toContain(
      `Aggregate total: ${model.tokenUsage.otherFiles.totalTokens.toLocaleString('en-US')} tokens`,
    );

    // Token usage is also summarized as a card at the top, beside the quality cards.
    const summaryBody = model.tokenUsage.body.tokens.toLocaleString('en-US');
    const summaryRefs = model.tokenUsage.references.totalTokens.toLocaleString('en-US');
    const summaryOther = model.tokenUsage.otherFiles.totalTokens.toLocaleString('en-US');
    const summaryTotal = (
      model.tokenUsage.body.tokens +
      model.tokenUsage.references.totalTokens +
      model.tokenUsage.otherFiles.totalTokens
    ).toLocaleString('en-US');
    expect(html).toContain('<div class="label">Token usage</div>');
    expect(html).toContain(
      `${summaryTotal}<div class="token-breakdown">Body ${summaryBody} · Ref ${summaryRefs} · Other ${summaryOther}</div>`,
    );
  });

  it('renders validation severity and ordered findings for a warning-only skill', () => {
    const model = report(
      [
        '---',
        'name: engineering-report-formatter',
        'description: Format technical engineering reports using company layout rules.',
        '---',
      ].join('\n'),
    );
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });

    expect(html).toContain('Validation status: VALID WITH WARNINGS');
    expect(html).not.toContain('>PASS<');
    expect(html).toContain('Authoring hygiene');
    expect(html).toContain('0/100 · Defects');
    expect(html.indexOf('Authoring hygiene')).toBeLessThan(
      html.indexOf('<h2 id="validation-findings">Validation findings</h2>'),
    );
    expect(html).toContain(
      'Suggestion: Write the instructions the agent should follow after the skill triggers.',
    );
    expect(html).toContain('<h2 id="validation-findings">Validation findings</h2>');
    expect(html).toContain('Diagnostic code');
    expect(html.indexOf(DiagnosticCode.DescriptionNoTrigger)).toBeLessThan(
      html.indexOf(DiagnosticCode.DescriptionNoBoundary),
    );
    expect(html.indexOf(DiagnosticCode.DescriptionNoBoundary)).toBeLessThan(
      html.indexOf(DiagnosticCode.BodyMissing),
    );
    expect(model.staticDescriptionQuality).toMatchObject({
      adjustedScore: 69,
      label: 'acceptable',
      rawScore: 75,
    });
    expect(html).toContain('Description completeness 69/100 · Acceptable');
    expect(html).toContain('Raw criterion score: <strong>75/100</strong>');
    expect(html).toContain('Adjusted score after ceilings: <strong>69/100</strong>');
    expect(html).toContain('<code>missing-usage-trigger</code> — ceiling: 69/100');
    expect(html).toContain(
      'No concrete usage-trigger content is present, so the adjusted score cannot exceed 69.',
    );
  });

  it('does not render an adjustment notice for a complete description', () => {
    const model = report(
      [
        '---',
        'name: complete-skill',
        'description: Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.',
        '---',
      ].join('\n'),
    );
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });

    expect(model.staticDescriptionQuality.rawScore).toBe(
      model.staticDescriptionQuality.adjustedScore,
    );
    expect(model.staticDescriptionQuality.gradeLimitations).toEqual([]);
    expect(html).not.toContain('<div class="adjustments">');
    expect(html).not.toContain('Raw criterion score:');
  });
});
