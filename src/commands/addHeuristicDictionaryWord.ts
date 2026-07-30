import * as l10n from '@vscode/l10n';
import * as vscode from 'vscode';
import { DEFAULT_HEURISTIC_DICTIONARIES } from '../quality/dictionaries';

/** Dictionaries this command may write. Both are `string[]` settings. */
export type AddableDictionaryKey = 'actionVerbs' | 'artifactHints';

export interface AddHeuristicDictionaryWordArgs {
  /** The `SKILL.md` the quick fix came from; decides the configuration scope. */
  uri: string;
  key: AddableDictionaryKey;
  word: string;
}

/**
 * Same guard as the producing diagnostic. The word originates in an arbitrary
 * `SKILL.md` and is written into user settings, where it is compiled into
 * matching patterns, so the value is re-validated at the point of the write
 * rather than trusted from the command arguments.
 */
const REGISTRABLE_WORD = /^[\p{L}\p{N}][\p{L}\p{N}'-]{0,40}$/u;

const SECTION = 'skillMdInspector.heuristics.dictionaryValues';

export interface AddWordResult {
  status: 'added' | 'already-present' | 'rejected';
  /** Where the value was written, for the confirmation message. */
  target?: vscode.ConfigurationTarget;
}

/**
 * Appends a word to a heuristic dictionary setting (plan 9 Part C).
 *
 * Read-modify-write over the *effective* value is mandatory, not stylistic: each
 * setting's default is the full built-in list, and a non-empty user value
 * replaces it rather than extending it. Writing `[word]` would silently drop
 * every built-in entry, so the effective value — defaults included — is read
 * first and the word appended to it. `inspect()` is used rather than `get()` so
 * the existing user value at the chosen scope is honored when there is one, and
 * the packaged default is the base when there is not.
 */
export async function addHeuristicDictionaryWord(
  args: AddHeuristicDictionaryWordArgs | undefined,
): Promise<AddWordResult> {
  if (!args || !REGISTRABLE_WORD.test(args.word ?? '')) {
    return { status: 'rejected' };
  }
  if (args.key !== 'actionVerbs' && args.key !== 'artifactHints') {
    return { status: 'rejected' };
  }

  const resource = safeUri(args.uri);
  const config = vscode.workspace.getConfiguration(SECTION, resource);
  const inspected = config.inspect<string[]>(args.key);
  // Prefer a workspace scope when one is open: these settings are `scope:
  // "resource"`, and a team sharing skills wants the addition committed with the
  // workspace rather than hidden in one machine's user settings.
  const hasWorkspace = (vscode.workspace.workspaceFolders?.length ?? 0) > 0;
  const target = hasWorkspace
    ? vscode.ConfigurationTarget.Workspace
    : vscode.ConfigurationTarget.Global;

  const existing = effectiveValue(inspected, target, args.key);
  const word = args.word;
  if (existing.some((entry) => entry.toLowerCase() === word.toLowerCase())) {
    return { status: 'already-present', target };
  }

  await config.update(args.key, [...existing, word.toLowerCase()], target);
  return { status: 'added', target };
}

/**
 * The list the write must extend: the user's own value at the chosen scope if
 * they have one, otherwise any narrower configured value, otherwise the packaged
 * default. Never an empty array, which is what would drop the built-ins.
 */
function effectiveValue(
  inspected: ReturnType<vscode.WorkspaceConfiguration['inspect']> | undefined,
  target: vscode.ConfigurationTarget,
  key: AddableDictionaryKey,
): string[] {
  const scoped =
    target === vscode.ConfigurationTarget.Workspace
      ? (inspected?.workspaceValue as string[] | undefined)
      : (inspected?.globalValue as string[] | undefined);
  const candidates = [
    scoped,
    inspected?.workspaceFolderValue as string[] | undefined,
    inspected?.workspaceValue as string[] | undefined,
    inspected?.globalValue as string[] | undefined,
    inspected?.defaultValue as string[] | undefined,
  ];
  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.filter((entry): entry is string => typeof entry === 'string');
    }
  }
  // The setting is not contributed or its default is missing: fall back to the
  // in-process catalog so the write still cannot erase the built-ins.
  return [...DEFAULT_HEURISTIC_DICTIONARIES[key]];
}

function safeUri(value: string | undefined): vscode.Uri | undefined {
  if (!value) {
    return undefined;
  }
  try {
    return vscode.Uri.parse(value, true);
  } catch {
    return undefined;
  }
}

/** Command entry point: performs the write and reports what happened. */
export async function addHeuristicDictionaryWordCommand(
  args: AddHeuristicDictionaryWordArgs | undefined,
): Promise<void> {
  const result = await addHeuristicDictionaryWord(args);
  if (result.status === 'rejected') {
    await vscode.window.showWarningMessage(
      l10n.t('SKILL.md Inspector: that word cannot be added to the heuristic dictionaries.'),
    );
    return;
  }
  // Whole sentences per variant: the list and scope nouns decline with the
  // sentence in many languages, so they cannot be substituted as fragments.
  const workspace = result.target === vscode.ConfigurationTarget.Workspace;
  const verbs = args?.key === 'actionVerbs';
  // A missing word is rejected above, so this fallback never renders.
  const word = args?.word ?? '';
  let message: string;
  if (result.status === 'added') {
    if (verbs) {
      message = workspace
        ? l10n.t('Added "{0}" to the recognized action verbs (workspace settings).', word)
        : l10n.t('Added "{0}" to the recognized action verbs (user settings).', word);
    } else {
      message = workspace
        ? l10n.t('Added "{0}" to the recognized artifacts (workspace settings).', word)
        : l10n.t('Added "{0}" to the recognized artifacts (user settings).', word);
    }
  } else {
    message = verbs
      ? l10n.t('"{0}" is already in the recognized action verbs.', word)
      : l10n.t('"{0}" is already in the recognized artifacts.', word);
  }
  await vscode.window.showInformationMessage(message);
}
