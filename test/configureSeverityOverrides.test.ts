import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

const hoisted = vi.hoisted(() => ({
  showQuickPick: vi.fn(),
  showWarningMessage: vi.fn(),
  showInformationMessage: vi.fn(),
  update: vi.fn(),
  inspect: vi.fn(),
  get: vi.fn(),
  folders: [] as unknown[],
}));

vi.mock('vscode', () => ({
  ConfigurationTarget: { Global: 1, Workspace: 2, WorkspaceFolder: 3 },
  QuickPickItemKind: { Separator: -1, Default: 0 },
  window: {
    showQuickPick: hoisted.showQuickPick,
    showWarningMessage: hoisted.showWarningMessage,
    showInformationMessage: hoisted.showInformationMessage,
  },
  workspace: {
    get workspaceFolders() {
      return hoisted.folders.length === 0 ? undefined : hoisted.folders;
    },
    getConfiguration: vi.fn(() => ({
      get: hoisted.get,
      inspect: hoisted.inspect,
      update: hoisted.update,
    })),
  },
}));

import { configureSeverityOverrides } from '../src/commands/configureSeverityOverrides';

const OVERRIDES_KEY = 'severityOverrides';
const ALLOW_SPEC_KEY = 'severity.allowSpecificationOverrides';
const GLOBAL = 1;

interface ConfigState {
  overrides?: Record<string, string>;
  allowSpec?: boolean;
  inspect?: { globalValue?: unknown; workspaceValue?: unknown };
}

function primeConfig({ overrides = {}, allowSpec = false, inspect = {} }: ConfigState = {}): void {
  hoisted.get.mockImplementation((key: string, fallback?: unknown) => {
    if (key === OVERRIDES_KEY) return overrides;
    if (key === ALLOW_SPEC_KEY) return allowSpec;
    return fallback;
  });
  hoisted.inspect.mockReturnValue(inspect);
}

beforeEach(() => {
  vi.clearAllMocks();
  hoisted.folders = [];
  hoisted.showQuickPick.mockResolvedValue(undefined);
  hoisted.showWarningMessage.mockResolvedValue(undefined);
  primeConfig();
});

describe('configureSeverityOverrides command', () => {
  it('adds a quality override and, with no workspace open, writes to User without a scope prompt', async () => {
    primeConfig(); // empty -> skips the manage panel
    hoisted.showQuickPick
      .mockResolvedValueOnce({ code: DiagnosticCode.DescriptionVague }) // pick code
      .mockResolvedValueOnce({ value: 'warning' }); // pick severity

    await configureSeverityOverrides();

    // Only the code + severity picks — no scope QuickPick, since there is no workspace.
    expect(hoisted.showQuickPick).toHaveBeenCalledTimes(2);
    expect(hoisted.update).toHaveBeenCalledTimes(1);
    expect(hoisted.update).toHaveBeenCalledWith(
      OVERRIDES_KEY,
      { [DiagnosticCode.DescriptionVague]: 'warning' },
      GLOBAL,
    );
  });

  it('merges a new override into the existing map at the chosen scope', async () => {
    hoisted.folders = [{ name: 'ws' }];
    primeConfig({
      overrides: { [DiagnosticCode.BodyLineLimit]: 'off' }, // non-empty -> manage panel first
      inspect: { globalValue: { [DiagnosticCode.BodyLineLimit]: 'off' } },
    });
    hoisted.showQuickPick
      .mockResolvedValueOnce({ action: 'add' }) // manage panel
      .mockResolvedValueOnce({ code: DiagnosticCode.DescriptionVague }) // pick code
      .mockResolvedValueOnce({ value: 'information' }) // pick severity
      .mockResolvedValueOnce({ label: 'User', target: GLOBAL }); // scope prompt (workspace open)

    await configureSeverityOverrides();

    expect(hoisted.update).toHaveBeenCalledWith(
      OVERRIDES_KEY,
      {
        [DiagnosticCode.BodyLineLimit]: 'off',
        [DiagnosticCode.DescriptionVague]: 'information',
      },
      GLOBAL,
    );
  });

  it('removes a non-last override, leaving the rest of the map', async () => {
    primeConfig({
      overrides: {
        [DiagnosticCode.DescriptionVague]: 'information',
        [DiagnosticCode.BodyLineLimit]: 'off',
      },
      inspect: {
        globalValue: {
          [DiagnosticCode.DescriptionVague]: 'information',
          [DiagnosticCode.BodyLineLimit]: 'off',
        },
      },
    });
    hoisted.showQuickPick
      .mockResolvedValueOnce({ action: 'edit', code: DiagnosticCode.DescriptionVague }) // manage panel
      .mockResolvedValueOnce({ value: 'remove' }); // edit action

    await configureSeverityOverrides();

    expect(hoisted.update).toHaveBeenCalledWith(
      OVERRIDES_KEY,
      { [DiagnosticCode.BodyLineLimit]: 'off' },
      GLOBAL,
    );
  });

  it('clears the key entirely when the last override is removed', async () => {
    primeConfig({
      overrides: { [DiagnosticCode.DescriptionVague]: 'information' },
      inspect: { globalValue: { [DiagnosticCode.DescriptionVague]: 'information' } },
    });
    hoisted.showQuickPick
      .mockResolvedValueOnce({ action: 'edit', code: DiagnosticCode.DescriptionVague })
      .mockResolvedValueOnce({ value: 'remove' });

    await configureSeverityOverrides();

    expect(hoisted.update).toHaveBeenCalledWith(OVERRIDES_KEY, undefined, GLOBAL);
  });

  it('clears all overrides after a modal confirmation', async () => {
    primeConfig({
      overrides: { [DiagnosticCode.DescriptionVague]: 'information' },
      inspect: { globalValue: { [DiagnosticCode.DescriptionVague]: 'information' } },
    });
    hoisted.showQuickPick.mockResolvedValueOnce({ action: 'clear' });
    hoisted.showWarningMessage.mockResolvedValueOnce('Clear overrides');

    await configureSeverityOverrides();

    expect(hoisted.showWarningMessage).toHaveBeenCalledWith(
      expect.any(String),
      { modal: true },
      'Clear overrides',
    );
    expect(hoisted.update).toHaveBeenCalledWith(OVERRIDES_KEY, undefined, GLOBAL);
  });

  it('warns before downgrading a specification error and, on "Enable & apply", flips the allow flag too', async () => {
    primeConfig(); // empty, allowSpec false
    hoisted.showQuickPick
      .mockResolvedValueOnce({ code: DiagnosticCode.NameMissing }) // specification code
      .mockResolvedValueOnce({ value: 'off' }); // disable it
    hoisted.showWarningMessage.mockResolvedValueOnce('Enable & apply');

    await configureSeverityOverrides();

    expect(hoisted.showWarningMessage).toHaveBeenCalledWith(
      expect.stringContaining('specification-level error'),
      { modal: true },
      'Enable & apply',
      'Apply anyway',
    );
    expect(hoisted.update).toHaveBeenCalledWith(
      OVERRIDES_KEY,
      { [DiagnosticCode.NameMissing]: 'off' },
      GLOBAL,
    );
    expect(hoisted.update).toHaveBeenCalledWith(ALLOW_SPEC_KEY, true, GLOBAL);
  });

  it('writes nothing when the specification-protection warning is dismissed', async () => {
    primeConfig();
    hoisted.showQuickPick
      .mockResolvedValueOnce({ code: DiagnosticCode.NameMissing })
      .mockResolvedValueOnce({ value: 'off' });
    hoisted.showWarningMessage.mockResolvedValueOnce(undefined); // dismissed

    await configureSeverityOverrides();

    expect(hoisted.update).not.toHaveBeenCalled();
  });

  it('writes nothing when the code picker is dismissed', async () => {
    primeConfig();
    hoisted.showQuickPick.mockResolvedValueOnce(undefined); // Esc at code picker

    await configureSeverityOverrides();

    expect(hoisted.update).not.toHaveBeenCalled();
  });

  it('prompts for a scope when a workspace is open', async () => {
    hoisted.folders = [{ name: 'ws' }];
    primeConfig();
    hoisted.showQuickPick
      .mockResolvedValueOnce({ code: DiagnosticCode.DescriptionVague })
      .mockResolvedValueOnce({ value: 'warning' })
      .mockResolvedValueOnce({ label: 'Workspace', target: 2 }); // scope prompt

    await configureSeverityOverrides();

    // 3rd QuickPick is the scope prompt, offering User and Workspace.
    const scopeCallArgs = hoisted.showQuickPick.mock.calls[2]?.[0] as Array<{ label: string }>;
    expect(scopeCallArgs.map((item) => item.label)).toEqual(['User', 'Workspace']);
    expect(hoisted.update).toHaveBeenCalledWith(
      OVERRIDES_KEY,
      { [DiagnosticCode.DescriptionVague]: 'warning' },
      2,
    );
  });
});
