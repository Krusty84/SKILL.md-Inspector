import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';

const source = readFileSync('src/webview/openCodeSessionReport/index.ts','utf8');
const css = readFileSync('src/webview/openCodeSessionReport/styles.css','utf8');
const sourceCompact = source.replace(/\s+/g, '');
const cssCompact = css.replace(/\s+/g, '');

describe('OpenCode session report shell structure', () => {
  it('keeps report chrome outside the trajectory scroll region', () => {
    expect(sourceCompact).toContain("el('div','report-shell')");
    expect(sourceCompact).toContain("el('header','report-chrome')");
    expect(sourceCompact).toContain("el('main','timeline-scroll-region')");
    expect(source).toContain('timeline-columns-header');
    expect(source).toContain('timeline-events');
    expect(source.indexOf("chrome.append(header(), sessionDetails(), toolbar())")).toBeLessThan(source.indexOf('timelineShell()'));
  });

  it('assigns document and timeline scrolling responsibilities', () => {
    expect(cssCompact).toMatch(/html,body,#app\{height:100%;overflow:hidden;?\}/);
    expect(cssCompact).toMatch(/\.report-shell\{[^}]*display:flex[^}]*flex-direction:column[^}]*height:100vh[^}]*min-height:0/s);
    expect(cssCompact).toMatch(/\.report-chrome\{[^}]*flex:00auto[^}]*background:var\(--vscode-editor-background\)/s);
    expect(cssCompact).toMatch(/\.timeline-scroll-region\{[^}]*flex:11auto[^}]*min-height:0[^}]*overflow:auto/s);
    expect(cssCompact).toMatch(/\.session-details\{[^}]*max-height:min\(42vh,28rem\)[^}]*overflow:auto/s);
  });

  it('defines fixed-header control tooltips and removes the old details text button', () => {
    expect(sourceCompact).toContain("setAttribute('role','tooltip')");
    expect(source).toContain('Show all tool calls, including skill calls');
    expect(source).toContain('Show skill calls only');
    expect(source).toContain('Show session details');
    expect(source).toContain('Hide session details');
    expect(source).toContain("setAttribute('aria-label', tip)");
    expect(source).not.toContain('Session details (');
  });

  it('orders Skills immediately after Tools', () => {
    expect(sourceCompact).toMatch(
      /\['all','tools','skills','reasoning','errors','diffs','text','subtasks',?\]/,
    );
  });

  it('places explicit event toggle buttons after noninteractive event head content', () => {
    expect(sourceCompact).toContain("consthead=el('div','event-head');constcontent=el('div','event-head-content')");
    expect(sourceCompact).toContain("head.append(content);if(event.expandable)head.append(eventToggle(event,expanded));body.append(head)");
    expect(source).toContain("b.className = 'event-toggle'");
    expect(source).toContain("b.dataset.action = action");
    expect(source).toContain("b.dataset.eventId = event.id");
    expect(source).toContain("b.setAttribute('aria-controls', `details-${event.id}`)");
    expect(source).toContain("b.setAttribute('aria-expanded', String(presentation.expanded))");
    expect(source).toContain("b.setAttribute('aria-label', presentation.ariaLabel)");
    expect(sourceCompact).toContain("icon.setAttribute('aria-hidden','true')");
    expect(source).not.toContain('head.tabIndex = 0');
    expect(source).not.toContain("head.dataset.action = event.expandable ? 'toggle-event' : ''");
    expect(source).not.toContain("head.setAttribute('aria-expanded'");
  });

  it('styles event toggle placement without absolute positioning', () => {
    expect(cssCompact).toMatch(/\.event-head\{[^}]*display:grid[^}]*grid-template-columns:minmax\(0,1fr\)auto[^}]*gap:0\.5rem/s);
    expect(cssCompact).toMatch(/\.event-head-content\{[^}]*min-width:0/s);
    expect(cssCompact).toMatch(/\.event-toggle\{[^}]*width:1\.6rem[^}]*margin-left:auto[^}]*background:transparent/s);
    expect(cssCompact).toMatch(/\.event-toggle\[aria-expanded='true'\]\.event-toggle-icon\{[^}]*transform:rotate\(90deg\)/s);
    expect(cssCompact).not.toMatch(/\.event-(?:head|toggle)[^{]*\{[^}]*position:absolute/s);
  });
});
