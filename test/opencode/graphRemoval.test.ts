import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import packageJson from '../../package.json';

vi.mock('vscode', () => {
  class TreeItem {
    command?: { command: string; title: string; arguments?: unknown[] };
    constructor(public readonly label: string, public readonly collapsibleState: number) {}
  }
  return {
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    ThemeIcon: class ThemeIcon { constructor(public readonly id: string) {} },
    EventEmitter: class EventEmitter {},
  };
});

import { OpenCodeSessionTreeItem } from '../../src/ui/openCodeSessionsTreeProvider';

const root = path.resolve('.');
const removedTraceCommand = ['skillMdInspector.openCode', 'open' + 'Trace'].join('.');
const removedBrowserBundle = 'openCodeSession' + 'Trace';
const removedDependencies = ['cyto' + 'scape', 'cyto' + 'scape-elk'];
const removedModuleNames = ['build' + 'Trace' + 'GraphViewModel', 'build' + 'Session' + 'PathViewModel', 'traceGraph' + 'State', 'sessionPath' + 'State', removedBrowserBundle];

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(entryPath) : entryPath.endsWith('.ts') ? [entryPath] : [];
  });
}

describe('OpenCode graph removal guards', () => {
  it('keeps the trace command out of commands, activation, menus, and welcomes', () => {
    expect(packageJson.contributes.commands.map((entry) => entry.command)).not.toContain(removedTraceCommand);
    expect(packageJson.activationEvents).not.toContain(`onCommand:${removedTraceCommand}`);
    expect(JSON.stringify(packageJson.contributes.menus)).not.toContain(removedTraceCommand);
    expect(JSON.stringify(packageJson.contributes.viewsWelcome)).not.toContain(removedTraceCommand);
  });

  it.each([
    ['parent', []],
    ['child', []],
  ])('uses the report command and preserves the %s session URI argument', (title, children) => {
    const uri = { scheme: 'file', toString: () => `file:///${title}.json` };
    const item = new OpenCodeSessionTreeItem({ uri, uriString: uri.toString(), fileName: `${title}.json`, size: 1, mtime: 1, title, toolCalls: 0, skillCalls: 0, errors: 0, children } as never);

    expect(item.command?.command).toBe('skillMdInspector.openCode.openReport');
    expect(item.command?.arguments).toEqual([item]);
    expect(item.summary.uri).toBe(uri);
  });

  it('does not declare graph dependencies', () => {
    for (const dependency of removedDependencies) expect(packageJson.dependencies).not.toHaveProperty(dependency);
  });

  it('defines only the extension build output', () => {
    const buildSource = fs.readFileSync(path.join(root, 'esbuild.js'), 'utf8');
    expect(buildSource).not.toContain(removedBrowserBundle);
    expect([...buildSource.matchAll(/outfile:\s*'([^']+)'/g)].map((match) => match[1])).toEqual(['dist/extension.js', 'dist/webview/openCodeSessionReport.js']);
  });

  it('has no imports of removed graph modules', () => {
    const source = sourceFiles(path.join(root, 'src')).map((file) => fs.readFileSync(file, 'utf8')).join('\n');
    for (const moduleName of removedModuleNames) expect(source).not.toContain(moduleName);
  });
});
