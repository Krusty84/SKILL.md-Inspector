import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { buildReportModel } from '../src/ui/reportModel';
import { renderReportHtml } from '../src/ui/renderReport';
import { genericProfile } from '../src/profiles/genericProfile';

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-inspector-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function report(content: string) {
  const { document, diagnostics } = analyzeSkill(path.join(dir, 'SKILL.md'), content, genericProfile);
  return buildReportModel(document, diagnostics, genericProfile);
}

describe('buildReportModel', () => {
  it('summarizes a well-formed skill as passing and includes a trigger quality score', () => {
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
    expect(model.triggerQuality.score).toBeGreaterThanOrEqual(75);
    expect(model.triggerQuality.findings).toHaveLength(7);
    expect(
      model.triggerQuality.findings.find((f) => f.criterion.startsWith('Action verb'))?.pointsEarned,
    ).toBe(20);
    expect(
      model.triggerQuality.findings.find((f) => f.criterion === 'Boundary phrase')?.pointsEarned,
    ).toBe(15);
  });

  it('marks a skill with errors as failing', () => {
    const model = report('---\nname: Bad Name\ndescription: Helps.\n---\n');
    expect(model.status).toBe('fail');
    expect(model.errorCount).toBeGreaterThan(0);
    expect(model.triggerQuality.label).toBe('poor');
  });
});

describe('renderReportHtml', () => {
  it('renders a self-contained document with the nonce, CSP, and score', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    const html = renderReportHtml(model, { nonce: 'abc123', cspSource: 'vscode-webview://x' });
    expect(html).toContain('Content-Security-Policy');
    expect(html).toContain('nonce-abc123');
    expect(html).toContain('demo');
    expect(html).toContain('Trigger Quality');
    expect(html).toContain(`${model.triggerQuality.score}`);
  });

  it('escapes HTML in dynamic values to prevent injection', () => {
    const model = report('---\nname: demo\ndescription: Format reports. Use when needed.\n---\n');
    model.name = '<img src=x onerror=alert(1)>';
    const html = renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });
});
