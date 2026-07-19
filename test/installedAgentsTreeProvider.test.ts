import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => {
  class Uri {
    constructor(readonly fsPath: string) {}
    static file(value: string): Uri {
      return new Uri(value);
    }
    static parse(value: string): Uri {
      return new Uri(value.replace(/^file:\/\//, ''));
    }
    toString(): string {
      return `file://${this.fsPath}`;
    }
  }
  class TreeItem {
    resourceUri?: Uri;
    description?: string;
    tooltip?: string;
    command?: unknown;
    contextValue?: string;
    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  }
  return {
    Uri,
    TreeItem,
    TreeItemCollapsibleState: { None: 0, Collapsed: 1 },
    ThemeIcon: class {
      constructor(readonly id: string) {}
    },
    EventEmitter: class {
      event = vi.fn();
      fire = vi.fn();
    },
    workspace: { getConfiguration: vi.fn(() => ({ get: vi.fn(() => []) })) },
    window: { showWarningMessage: vi.fn() },
  };
});

import {
  deduplicateDiscoveredFiles,
  InstalledAgentsTreeProvider,
} from '../src/ui/installedAgentsTreeProvider';
import type { DiscoveredFile } from '../src/navigator/types';

function file(fileName: DiscoveredFile['fileName'], absolutePath: string): DiscoveredFile {
  return {
    sourceId: 'source',
    sourceLabel: 'Agent/Group',
    fileName,
    absolutePath,
    relativePath: fileName,
  };
}

const provider = new InstalledAgentsTreeProvider(
  { globalState: { get: vi.fn(() => []) } } as never,
  { appendLine: vi.fn() } as never,
);

describe('InstalledAgentsTreeProvider file items', () => {
  it.each([
    ['SKILL.md', '/tmp/example-skill/SKILL.md', 'example-skill'],
    ['AGENTS.md', '/tmp/AGENTS.md', 'AGENTS.md'],
    ['CLAUDE.md', '/tmp/CLAUDE.md', 'CLAUDE.md'],
  ] as const)(
    'labels %s correctly and lets the file icon theme resolve its icon',
    (fileName, absolutePath, label) => {
      const item = provider.getTreeItem({
        type: 'file',
        file: file(fileName, absolutePath),
        favorite: fileName === 'SKILL.md',
      });

      expect(item.label).toBe(label);
      expect(item.resourceUri?.fsPath).toBe(absolutePath);
      expect(item.iconPath).toBeUndefined();
      expect(item.contextValue).toBe(
        fileName === 'SKILL.md'
          ? 'skillMdInspector.favoriteSkillFile'
          : 'skillMdInspector.installedAgentsFile',
      );
    },
  );

  it('deduplicates canonical files while preserving the first source', () => {
    const first = file('SKILL.md', '/real/skills/example/SKILL.md');
    const duplicate = { ...first, sourceId: 'other' };
    expect(deduplicateDiscoveredFiles([first, duplicate])).toEqual([first]);
    expect(
      deduplicateDiscoveredFiles(
        [
          { ...first, absolutePath: 'C:\\Skills\\SKILL.md' },
          { ...duplicate, absolutePath: 'c:\\skills\\skill.md' },
        ],
        'win32',
      ),
    ).toHaveLength(1);
  });
});
