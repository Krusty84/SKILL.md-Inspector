import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class Uri {
    fsPath: string;
    path: string;
    scheme: string;
    constructor(value: string, scheme = 'file') {
      this.fsPath = value;
      this.path = value;
      this.scheme = scheme;
    }
    toString(): string {
      return `${this.scheme}://${this.path}`;
    }
    static file(value: string): Uri {
      return new Uri(value);
    }
    static parse(value: string): Uri {
      const [scheme, rest] = value.split('://');
      return new Uri(rest ?? value, scheme ?? 'file');
    }
  }
  return { Uri, window: { showOpenDialog: vi.fn() } };
});

import * as vscode from 'vscode';
import {
  getOpenCodeSessionUriFromTarget,
  resolveOpenCodeSessionUri,
} from '../../src/commands/opencode/sessionUriResolver';

describe('resolveOpenCodeSessionUri', () => {
  it('uses an explicit vscode.Uri target', async () => {
    const uri = vscode.Uri.file('/tmp/session.json');
    const showOpenDialog = vi.fn();
    await expect(resolveOpenCodeSessionUri(uri, { showOpenDialog })).resolves.toBe(uri);
    expect(showOpenDialog).not.toHaveBeenCalled();
  });

  it('uses a tree item summary URI target', async () => {
    const uri = vscode.Uri.file('/tmp/tree.json');
    const target = { summary: { uri } };
    await expect(resolveOpenCodeSessionUri(target, { showOpenDialog: vi.fn() })).resolves.toBe(uri);
  });

  it('uses a resourceUri-compatible target', async () => {
    const uri = vscode.Uri.file('/tmp/resource.json');
    const target = { resourceUri: uri };
    await expect(resolveOpenCodeSessionUri(target, { showOpenDialog: vi.fn() })).resolves.toBe(uri);
  });

  it('opens a JSON file picker when no target is provided', async () => {
    const uri = vscode.Uri.file('/tmp/picked.json');
    const showOpenDialog = vi.fn().mockResolvedValue([uri]);
    await expect(resolveOpenCodeSessionUri(undefined, { showOpenDialog })).resolves.toBe(uri);
    expect(showOpenDialog).toHaveBeenCalledWith(
      expect.objectContaining({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: { 'OpenCode Session Export': ['json'] },
      }),
    );
  });

  it('returns undefined when the file picker is cancelled', async () => {
    const showOpenDialog = vi.fn().mockResolvedValue(undefined);
    await expect(resolveOpenCodeSessionUri(undefined, { showOpenDialog })).resolves.toBeUndefined();
  });

  it('opens the file picker for invalid targets without accepting URI strings', async () => {
    const uri = vscode.Uri.file('/tmp/fallback.json');
    const showOpenDialog = vi.fn().mockResolvedValue([uri]);
    expect(getOpenCodeSessionUriFromTarget('file:///tmp/untrusted.json')).toBeUndefined();
    await expect(
      resolveOpenCodeSessionUri('file:///tmp/untrusted.json', { showOpenDialog }),
    ).resolves.toBe(uri);
  });
});
