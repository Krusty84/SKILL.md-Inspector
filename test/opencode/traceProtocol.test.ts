import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renderOpenCodeSessionTraceHtml } from '../../src/ui/renderOpenCodeSessionTrace';
import { isWebviewToExtensionMessage } from '../../src/webview/openCodeSessionTrace/model';

describe('OpenCode trace protocol', () => {
  it('accepts the ready and lazy-detail messages and rejects malformed values', () => {
    expect(isWebviewToExtensionMessage({ type: 'ready' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'requestNodeDetails', nodeId: 'node-1' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'openSkill', uri: 'file:///skill/SKILL.md' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'openSkillReport', uri: 'file:///skill/SKILL.md' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'openRawSession' })).toBe(true);
    expect(isWebviewToExtensionMessage({ type: 'requestNodeDetails', nodeId: 1 })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'openSkill', uri: '' })).toBe(false);
    expect(isWebviewToExtensionMessage({ type: 'unknown' })).toBe(false);
  });

  it('generates a restrictive, local-only webview document', () => {
    const html = renderOpenCodeSessionTraceHtml('vscode-webview://local/openCodeSessionTrace.js', 'vscode-webview://local/openCodeSessionTrace.css', 'vscode-webview:', 'nonce123');
    expect(html).toContain("default-src 'none'");
    expect(html).toContain("script-src 'nonce-nonce123' vscode-webview:");
    expect(html).toContain('openCodeSessionTrace.css');
    expect(html).not.toContain('unsafe-eval');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('keeps untrusted graph values on text-only DOM paths', () => {
    const source = fs.readFileSync(path.resolve('src/webview/openCodeSessionTrace/index.ts'), 'utf8');
    expect(source).not.toContain('.innerHTML');
    expect(source).not.toContain('insertAdjacentHTML');
    expect(source).not.toMatch(/https?:\/\//);
    expect(source).toContain('textContent');
  });
});
