/**
 * Plan 9 Part C, provider side: the quick fix that offers to register an
 * unrecognized word.
 *
 * The write itself is covered in addHeuristicDictionaryWord.test.ts. What matters
 * here is that the action is offered on the right diagnostic, carries the word,
 * and — the requirement with teeth — is never `isPreferred`, because an
 * auto-applied fix must not silently edit global or workspace settings.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  get: vi.fn(),
  inspect: vi.fn(),
  update: vi.fn(),
  // Declared inside the hoisted block: `vi.mock`'s factory is lifted above any
  // top-level class declaration, so a class defined out here would not exist yet.
  CodeAction: class {
    diagnostics: unknown[] = [];
    edit: unknown;
    command: unknown;
    isPreferred: boolean | undefined;
    constructor(
      public title: string,
      public kind: unknown,
    ) {}
  },
}));

vi.mock('vscode', () => ({
  CodeAction: hoisted.CodeAction,
  CodeActionKind: { QuickFix: 'quickfix' },
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  DiagnosticSeverity: { Error: 0, Warning: 1, Information: 2, Hint: 3 },
  DiagnosticTag: { Unnecessary: 1, Deprecated: 2 },
  EndOfLine: { LF: 1, CRLF: 2 },
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
    translate(dl: number, dc: number) {
      return new (this.constructor as never as new (l: number, c: number) => unknown)(
        this.line + dl,
        this.character + dc,
      );
    }
  },
  Range: class {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  Uri: { file: (p: string) => ({ fsPath: p, toString: () => `file://${p}` }) },
  WorkspaceEdit: class {
    insert() {}
    replace() {}
    createFile() {}
    renameFile() {}
  },
  workspace: {
    workspaceFolders: undefined,
    getConfiguration: vi.fn(() => ({
      get: hoisted.get,
      inspect: hoisted.inspect,
      update: hoisted.update,
    })),
  },
  window: { showWarningMessage: vi.fn(), showInformationMessage: vi.fn() },
}));

import { SkillCodeActionProvider } from '../src/codeActions/skillCodeActions';
import { QuickFixId } from '../src/types/DiagnosticCode';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { genericProfile } from '../src/profiles';

/** A `SKILL.md` whose capability verb is deliberately outside the registry. */
const UNREGISTERED_VERB = `---
name: widget-frobnicator
description: Frobnicate the widgets for shipment. Use when the user needs widgets frobnicated. Do not use for gadgets.
---

# Widget Frobnicator

Frobnicate each widget, then confirm the shipment manifest is complete.
`;

function fakeDocument(text: string) {
  const lines = text.split('\n');
  return {
    // isSkillFile() requires a file-scheme uri whose basename is SKILL.md.
    uri: {
      scheme: 'file',
      fsPath: '/w/skills/widget-frobnicator/SKILL.md',
      toString: () => 'file:///w/skills/widget-frobnicator/SKILL.md',
    },
    languageId: 'markdown',
    fileName: '/w/skills/widget-frobnicator/SKILL.md',
    lineCount: lines.length,
    getText: () => text,
    lineAt: (line: number) => ({
      range: { end: { line, character: lines[line]?.length ?? 0 } },
      text: lines[line] ?? '',
    }),
  };
}

/** Whole-document selection, so every diagnostic's range overlaps. */
const WHOLE_FILE = {
  start: { line: 0, character: 0 },
  end: { line: 99, character: 0 },
};

/**
 * Pure stand-in for the DiagnosticsProvider's cached-analysis source; the
 * dictionary quick fixes come from description heuristics, which text-only
 * mode produces without touching the filesystem.
 */
const analysisSource = {
  analysisForCodeActions: (document: { uri: { fsPath: string }; getText(): string }) =>
    analyzeSkill(document.uri.fsPath, document.getText(), genericProfile, { mode: 'text-only' }),
};

function actionsFor(text: string) {
  const provider = new SkillCodeActionProvider(analysisSource as never);
  return provider.provideCodeActions(
    fakeDocument(text) as never,
    WHOLE_FILE as never,
    { diagnostics: [], only: undefined, triggerKind: 1 } as never,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  // Every setting falls through to its default, which is what readConfig does on
  // a clean install.
  hoisted.get.mockImplementation((_key: string, fallback?: unknown) => fallback);
  hoisted.inspect.mockReturnValue(undefined);
});

describe('the "add to dictionary" quick fix', () => {
  it('is offered for an unregistered capability verb', () => {
    const action = actionsFor(UNREGISTERED_VERB).find((entry) =>
      entry.title.startsWith('Add "frobnicate"'),
    );
    expect(action?.title).toBe('Add "frobnicate" to recognized action verbs');
  });

  it('is never isPreferred, so it cannot be auto-applied', () => {
    // Editing configuration is not something a "fix all" pass may do on the
    // user's behalf.
    for (const action of actionsFor(UNREGISTERED_VERB)) {
      if (action.title.startsWith('Add "')) {
        expect(action.isPreferred, action.title).toBe(false);
      }
    }
  });

  it('routes through the command rather than editing the file', () => {
    const action = actionsFor(UNREGISTERED_VERB).find((entry) =>
      entry.title.startsWith('Add "frobnicate"'),
    );
    expect(action?.edit).toBeUndefined();
    expect(action?.command).toMatchObject({
      command: 'skillMdInspector.addHeuristicDictionaryWord',
      arguments: [expect.objectContaining({ key: 'actionVerbs', word: 'frobnicate' })],
    });
  });

  it('is not offered when the verb is already recognized', () => {
    const recognized = UNREGISTERED_VERB.replace('Frobnicate the', 'Format the').replace(
      'Frobnicate each',
      'Format each',
    );
    expect(actionsFor(recognized).filter((entry) => entry.title.startsWith('Add "'))).toEqual([]);
  });

  it('offers the artifact variant for an unregistered artifact term', () => {
    const doc = `---
name: contract-generator
description: Generate deliverables from OpenAPI definitions. Use when the upstream service changes. Do not use for handwritten wikis.
---

# Contract Generator

Generate each deliverable from the definitions, then confirm the output.
`;
    const action = actionsFor(doc).find((entry) => entry.title.startsWith('Add "OpenAPI"'));
    expect(action?.title).toBe('Add "OpenAPI" to recognized artifacts');
    expect(action?.command).toMatchObject({
      arguments: [expect.objectContaining({ key: 'artifactHints', word: 'OpenAPI' })],
    });
  });
});

describe('the quick-fix ids are stable', () => {
  it('keeps the documented values', () => {
    // Quick-fix ids are a contract with the diagnostics that carry them.
    expect(QuickFixId.AddActionVerbToDictionary).toBe('fix.dictionary.addActionVerb');
    expect(QuickFixId.AddArtifactToDictionary).toBe('fix.dictionary.addArtifact');
  });
});
