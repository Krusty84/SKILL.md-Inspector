import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({ ThemeIcon: class { constructor(public readonly id: string) {} }, TreeItem: class { constructor(public readonly label: string, public readonly collapsibleState: number) {} }, TreeItemCollapsibleState: { None: 0, Collapsed: 1 }, workspace: { getConfiguration: () => ({ get: (_key: string, fallback: unknown) => fallback }) } }));

import { OpenCodeSessionTreeItem } from '../../src/ui/openCodeSessionsTreeProvider';
import type { SessionSummary } from '../../src/opencode/model';

describe('OpenCode graph removal guards', () => {
  it('uses the static report command as the session tree item default action', () => {
    const uri = { scheme: 'file', fsPath: '/tmp/session.json', toString: () => 'file:///tmp/session.json' } as never;
    const item = new OpenCodeSessionTreeItem({ uri, uriString: 'file:///tmp/session.json', fileName: 'session.json', size: 1, mtime: 1, title: 'Session', toolCalls: 0, skillCalls: 0, errors: 0, children: [] } satisfies SessionSummary);
    expect(item.command).toMatchObject({ command: 'skillMdInspector.openCode.openReport', title: 'Open OpenCode Session Report', arguments: [item] });
  });

  it('does not reference the removed graph webview in the build script', () => {
    expect(fs.readFileSync(path.resolve('esbuild.js'), 'utf8')).not.toContain(['openCode', 'Session', 'Trace'].join(''));
  });

  it('has no source imports of deleted graph modules', () => {
    const sourceRoots = ['src', 'test'];
    const forbidden = new RegExp([['build', 'Trace', 'Graph', 'View', 'Model'].join(''), ['build', 'Session', 'Path', 'View', 'Model'].join(''), ['trace', 'Graph', 'State'].join(''), ['session', 'Path', 'State'].join(''), ['openCode', 'Session', 'Trace'].join(''), ['OpenCode', 'Session', 'Trace'].join(''), ['request', 'Node', 'Details'].join(''), ['request', 'Path', 'Node', 'Details'].join(''), ['path', 'Node', 'Details'].join('')].join('|'));
    const matches: string[] = [];
    const visit = (filePath: string): void => {
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) { for (const entry of fs.readdirSync(filePath)) visit(path.join(filePath, entry)); return; }
      if (filePath.endsWith(path.join('test', 'opencode', 'graphRemoval.test.ts'))) return;
      if (!/\.(ts|js|json|md)$/.test(filePath)) return;
      const text = fs.readFileSync(filePath, 'utf8');
      if (forbidden.test(text)) matches.push(filePath);
    };
    sourceRoots.forEach(visit);
    expect(matches).toEqual([]);
  });
});
