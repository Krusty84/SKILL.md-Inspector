import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/webview/openCodeSessionReport/index.ts','utf8');
const css = readFileSync('src/webview/openCodeSessionReport/styles.css','utf8');

describe('OpenCode session report shell structure', () => {
  it('keeps report chrome outside the trajectory scroll region', () => {
    expect(source).toContain("el('div', 'report-shell')");
    expect(source).toContain("el('header','report-chrome')");
    expect(source).toContain("el('main','timeline-scroll-region')");
    expect(source).toContain('timeline-columns-header');
    expect(source).toContain('timeline-events');
    expect(source.indexOf("chrome.append(header(), sessionDetails(), toolbar())")).toBeLessThan(source.indexOf('timelineShell()'));
  });

  it('assigns document and timeline scrolling responsibilities', () => {
    expect(css).toMatch(/html,body,#app\{height:100%;overflow:hidden\}/);
    expect(css).toMatch(/\.report-shell\{[^}]*display:flex[^}]*flex-direction:column[^}]*height:100vh[^}]*min-height:0/s);
    expect(css).toMatch(/\.report-chrome\{[^}]*flex:0 0 auto[^}]*background:var\(--vscode-editor-background\)/s);
    expect(css).toMatch(/\.timeline-scroll-region\{[^}]*flex:1 1 auto[^}]*min-height:0[^}]*overflow:auto/s);
    expect(css).toMatch(/\.session-details\{[^}]*max-height:min\(42vh,28rem\)[^}]*overflow:auto/s);
  });

  it('defines fixed-header control tooltips and removes the old details text button', () => {
    expect(source).toContain("role','tooltip'");
    expect(source).toContain('Show tool calls, excluding skill calls');
    expect(source).toContain('Show skill calls only');
    expect(source).toContain('Show session details');
    expect(source).toContain('Hide session details');
    expect(source).toContain("setAttribute('aria-label', tip)");
    expect(source).not.toContain('Session details (');
  });

  it('orders Skills immediately after Tools', () => {
    expect(source).toContain("['all','tools','skills','reasoning','errors','diffs','text','subtasks']");
  });
});
