import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class Uri {
    fsPath: string;
    path: string;
    scheme = 'file';
    constructor(value: string) { this.fsPath = value; this.path = value; }
    toString(): string { return `file://${this.path}`; }
    static file(value: string): Uri { return new Uri(value); }
  }
  return { Uri };
});

import * as vscode from 'vscode';
import { OpenCodeSessionTraceState } from '../../src/ui/openCodeSessionTraceState';

describe('OpenCodeSessionTraceState', () => {
  it('updates the raw session URI when the singleton panel is reused', () => {
    const state = new OpenCodeSessionTraceState();
    const first = vscode.Uri.file('/tmp/session-a.json');
    const second = vscode.Uri.file('/tmp/session-b.json');
    state.setRawUri(first);
    state.setRawUri(second);
    expect(state.getRawUri()).toBe(second);
  });
});
