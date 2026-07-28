/**
 * Reactivity contract of the code-action path: VS Code requests code actions
 * on every cursor move and content change, so the provider must serve them
 * from the DiagnosticsProvider's per-version analysis cache instead of
 * re-running the full pipeline (which used to rescan the skill directory and
 * re-encode every reference file per cursor move).
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
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
  Position: class {
    constructor(
      public line: number,
      public character: number,
    ) {}
  },
  Range: class {
    constructor(
      public start: unknown,
      public end: unknown,
    ) {}
  },
  Diagnostic: class {
    source?: string;
    code?: string;
    constructor(
      readonly range: unknown,
      readonly message: string,
      readonly severity: number,
    ) {}
  },
  Uri: { file: (p: string) => ({ scheme: 'file', fsPath: p, toString: () => `file://${p}` }) },
  WorkspaceEdit: class {
    insert() {}
    replace() {}
    createFile() {}
    renameFile() {}
  },
  languages: {
    createDiagnosticCollection: () => ({ set: vi.fn(), delete: vi.fn(), dispose: vi.fn() }),
  },
  window: { showWarningMessage: vi.fn(), showInformationMessage: vi.fn() },
  workspace: {
    workspaceFolders: [],
    getConfiguration: () => ({
      get: (_key: string, fallback?: unknown) => fallback,
    }),
  },
}));

vi.mock('../src/parser/discoverResources', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/parser/discoverResources')>();
  return { ...actual, discoverResources: vi.fn(() => []) };
});

vi.mock('../src/analysis/analyzeSkill', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/analysis/analyzeSkill')>();
  return { ...actual, analyzeSkill: vi.fn(actual.analyzeSkill) };
});

import { DiagnosticsProvider } from '../src/diagnostics/diagnosticsProvider';
import { SkillCodeActionProvider } from '../src/codeActions/skillCodeActions';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { genericProfile } from '../src/profiles';

const analyzeSkillMock = vi.mocked(analyzeSkill);

const SKILL_TEXT = `---
name: demo
description: Format inspection reports using company rules. Use when asked to standardize reports. Do not use for contracts.
---

# Demo

Format each report, then confirm the result.
`;

/** A SKILL.md whose capability verb is outside the registry -> quick fix. */
const UNREGISTERED_VERB = SKILL_TEXT.replace(/Format/g, 'Frobnicate').replace(
  /standardize/g,
  'frobnicate',
);

function fakeDocument(text: string, filePath = '/workspace/demo/SKILL.md') {
  const lines = text.split('\n');
  const state = { version: 1 };
  return {
    state,
    document: {
      uri: { scheme: 'file', fsPath: filePath, toString: () => `file://${filePath}` },
      languageId: 'markdown',
      fileName: filePath,
      get version() {
        return state.version;
      },
      lineCount: lines.length,
      getText: () => text,
      lineAt: (line: number) => ({
        range: { end: { line, character: lines[line]?.length ?? 0 } },
        text: lines[line] ?? '',
      }),
    },
  };
}

const WHOLE_FILE = { start: { line: 0, character: 0 }, end: { line: 99, character: 0 } };
const CONTEXT = { diagnostics: [], only: undefined, triggerKind: 1 };

beforeEach(() => {
  analyzeSkillMock.mockClear();
});

describe('DiagnosticsProvider.analysisForCodeActions', () => {
  it('reuses the analysis computed by validate for the same document version', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = fakeDocument(SKILL_TEXT);
    const validated = await provider.validate(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(1);

    const served = provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(1);
    expect(served).toBe(validated);
    provider.dispose();
  });

  it('recomputes once the document version moved on', async () => {
    const provider = new DiagnosticsProvider();
    const { state, document } = fakeDocument(SKILL_TEXT);
    await provider.validate(document as never);
    state.version = 2;
    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it('never serves a text-only analysis to code actions', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = fakeDocument(SKILL_TEXT);
    await provider.validate(document as never, 'text-only');
    expect(analyzeSkillMock).toHaveBeenCalledTimes(1);

    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(2);
    // The recompute runs the whole pipeline: filesystem-backed quick fixes
    // (create missing linked file, ...) need full-mode diagnostics.
    expect(analyzeSkillMock.mock.calls[1]?.[3]).toMatchObject({ mode: 'full' });
    provider.dispose();
  });

  it('drops cached analyses when a resource of the owning skill changes', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = fakeDocument(SKILL_TEXT);
    await provider.validate(document as never);

    provider.invalidateResource('/workspace/demo/references/guide.md');
    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(2);
    provider.dispose();
  });

  it('keeps cached analyses of unrelated skills on resource changes', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = fakeDocument(SKILL_TEXT);
    await provider.validate(document as never);

    provider.invalidateResource('/workspace/other-skill/references/guide.md');
    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(1);
    provider.dispose();
  });

  it('drops cached analyses on clearResourceCache and clear', async () => {
    const provider = new DiagnosticsProvider();
    const { document } = fakeDocument(SKILL_TEXT);
    await provider.validate(document as never);

    provider.clearResourceCache();
    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(2);

    provider.clear(document.uri as never);
    provider.analysisForCodeActions(document as never);
    expect(analyzeSkillMock).toHaveBeenCalledTimes(3);
    provider.dispose();
  });
});

describe('SkillCodeActionProvider', () => {
  function sourceFor(text: string, filePath = '/workspace/demo/SKILL.md') {
    const analysis = analyzeSkill(filePath, text, genericProfile, { mode: 'text-only' });
    return { analysisForCodeActions: vi.fn(() => analysis) };
  }

  it('produces actions from the injected analysis without analyzing itself', () => {
    const source = sourceFor(UNREGISTERED_VERB);
    analyzeSkillMock.mockClear();
    const provider = new SkillCodeActionProvider(source);
    const actions = provider.provideCodeActions(
      fakeDocument(UNREGISTERED_VERB).document as never,
      WHOLE_FILE as never,
      CONTEXT as never,
    );
    expect(source.analysisForCodeActions).toHaveBeenCalledTimes(1);
    expect(analyzeSkillMock).not.toHaveBeenCalled();
    expect(actions.some((action) => action.title.startsWith('Add "frobnicate"'))).toBe(true);
  });

  it('short-circuits on a cancelled token without touching the source', () => {
    const source = sourceFor(UNREGISTERED_VERB);
    const provider = new SkillCodeActionProvider(source);
    const actions = provider.provideCodeActions(
      fakeDocument(UNREGISTERED_VERB).document as never,
      WHOLE_FILE as never,
      CONTEXT as never,
      { isCancellationRequested: true } as never,
    );
    expect(actions).toEqual([]);
    expect(source.analysisForCodeActions).not.toHaveBeenCalled();
  });

  it('ignores documents that are not a SKILL.md', () => {
    const source = sourceFor(UNREGISTERED_VERB);
    const provider = new SkillCodeActionProvider(source);
    const actions = provider.provideCodeActions(
      fakeDocument(UNREGISTERED_VERB, '/workspace/demo/README.md').document as never,
      WHOLE_FILE as never,
      CONTEXT as never,
    );
    expect(actions).toEqual([]);
    expect(source.analysisForCodeActions).not.toHaveBeenCalled();
  });
});
