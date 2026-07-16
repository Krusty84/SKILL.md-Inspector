import { describe, expect, it } from 'vitest';
import { eventTogglePresentation } from '../../src/webview/openCodeSessionReport/eventTogglePresentation';

describe('OpenCode event toggle presentation', () => {
  it('describes collapsed and expanded toggle states with trusted static tooltip text', () => {
    expect(eventTogglePresentation(false, 'USER MESSAGE')).toEqual({ ariaLabel: 'Expand USER MESSAGE event', tooltip: 'Expand event', expanded: false });
    expect(eventTogglePresentation(true, 'USER MESSAGE')).toEqual({ ariaLabel: 'Collapse USER MESSAGE event', tooltip: 'Collapse event', expanded: true });
  });

  it('falls back to a generic event name', () => {
    expect(eventTogglePresentation(false, '')).toEqual({ ariaLabel: 'Expand event event', tooltip: 'Expand event', expanded: false });
  });
});
