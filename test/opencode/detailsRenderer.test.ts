import { describe, expect, it, vi } from 'vitest';
import { ensureEventDetailsRequested, renderDetailsInto } from '../../src/webview/openCodeSessionReport/detailsRenderer';

class TestElement {
  public textContent = '';
  public readonly children: TestElement[] = [];
  public readonly dataset: Record<string, string> = {};
  public className = '';
  public type = '';
  constructor(public readonly tagName: string) {}
  append(...nodes: TestElement[]): void { this.children.push(...nodes); this.textContent += nodes.map((node) => node.textContent).join(''); }
}

const installDocument = (): void => {
  vi.stubGlobal('document', { createElement: (tagName: string) => new TestElement(tagName) });
};
const labels = (node: TestElement): string[] => node.children.filter((child) => child.className === 'detail-label').map((child) => child.textContent);

describe('OpenCode event details rendering', () => {
  it('renders cached details into a newly created details container without a duplicate request', () => {
    installDocument();
    const details = new Map();
    const requested = new Set<string>();
    const sendRequest = vi.fn();
    const firstContainer = new TestElement('div') as unknown as HTMLElement;

    renderDetailsInto(firstContainer, 'tool-1', details);
    ensureEventDetailsRequested('tool-1', details, requested, sendRequest);
    expect((firstContainer as unknown as TestElement).textContent).toContain('Loading details…');
    expect(sendRequest).toHaveBeenCalledTimes(1);
    expect(sendRequest).toHaveBeenCalledWith('tool-1');

    details.set('tool-1', { input: '{"filePath":"src/auth.ts"}', output: 'ok', raw: '{"state":{}}' });
    renderDetailsInto(firstContainer, 'tool-1', details);
    expect(labels(firstContainer as unknown as TestElement)).toEqual(['INPUTCopy JSON','OUTPUT','RAW']);

    const secondContainer = new TestElement('div') as unknown as HTMLElement;
    renderDetailsInto(secondContainer, 'tool-1', details);
    ensureEventDetailsRequested('tool-1', details, requested, sendRequest);
    expect(labels(secondContainer as unknown as TestElement)).toEqual(['INPUTCopy JSON','OUTPUT','RAW']);
    expect((secondContainer as unknown as TestElement).textContent).not.toContain('Loading details…');
    expect(sendRequest).toHaveBeenCalledTimes(1);
  });

  it('supports repeated bulk expand containers from the cached detail map', () => {
    installDocument();
    const details = new Map([['tool-1', { output: 'tool output' }], ['skill-1', { output: 'skill output', temporalWarning: 'temporal' }]]);
    const requested = new Set(['tool-1', 'skill-1']);
    const sendRequest = vi.fn();

    for (let cycle = 0; cycle < 2; cycle += 1) {
      const toolContainer = new TestElement('div') as unknown as HTMLElement;
      const skillContainer = new TestElement('div') as unknown as HTMLElement;
      renderDetailsInto(toolContainer, 'tool-1', details);
      ensureEventDetailsRequested('tool-1', details, requested, sendRequest);
      renderDetailsInto(skillContainer, 'skill-1', details);
      ensureEventDetailsRequested('skill-1', details, requested, sendRequest);
      expect((toolContainer as unknown as TestElement).textContent).toContain('tool output');
      expect((skillContainer as unknown as TestElement).textContent).toContain('skill output');
      expect((skillContainer as unknown as TestElement).textContent).toContain('temporal');
    }
    expect(sendRequest).not.toHaveBeenCalled();
  });
});
