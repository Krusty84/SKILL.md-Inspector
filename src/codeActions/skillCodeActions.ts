import * as path from 'node:path';
import * as vscode from 'vscode';
import { isSkillFile } from '../diagnostics/mapping';
import { QuickFixId } from '../types/DiagnosticCode';
import { frontmatterStartLine } from '../parser/parseSkillFile';
import { isPathInsideDir } from '../parser/linkPaths';
import { toKebabCase, isSafeFolderRenameTarget } from '../validation/validateName';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import { REGISTRABLE_WORD } from '../validation/validateDescription';
import {
  DESCRIPTION_PLACEHOLDER,
  USE_WHEN_CLAUSE,
  DO_NOT_USE_CLAUSE,
  frontmatterBlock,
  bodyTemplate,
} from './templates';

/**
 * Where the provider gets its analysis. VS Code requests code actions on every
 * cursor move and content change, so the source must be cheap: the
 * DiagnosticsProvider satisfies this interface from its per-version analysis
 * cache instead of re-running the pipeline per request.
 */
export interface CodeActionAnalysisSource {
  analysisForCodeActions(document: vscode.TextDocument): {
    document: SkillDocument;
    diagnostics: SkillDiagnostic[];
  };
}

export class SkillCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  constructor(private readonly analysisSource: CodeActionAnalysisSource) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
    token?: vscode.CancellationToken,
  ): vscode.CodeAction[] {
    if (token?.isCancellationRequested || !isSkillFile(document)) {
      return [];
    }

    const { document: skillDoc, diagnostics } =
      this.analysisSource.analysisForCodeActions(document);

    const actions: vscode.CodeAction[] = [];
    for (const diagnostic of diagnostics) {
      if (!diagnostic.quickFixId || !diagnostic.range) {
        continue;
      }
      if (!overlapsLine(diagnostic.range.startLine, diagnostic.range.endLine, range)) {
        continue;
      }
      const action = this.buildAction(diagnostic, skillDoc, document, context);
      if (action) {
        actions.push(action);
      }
    }
    return actions;
  }

  private buildAction(
    diagnostic: SkillDiagnostic,
    skillDoc: SkillDocument,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction | undefined {
    switch (diagnostic.quickFixId) {
      case QuickFixId.ConvertNameToKebabCase:
        return this.replaceKeyLine(
          diagnostic,
          skillDoc,
          document,
          context,
          'name',
          `name: ${String(diagnostic.data?.suggestion ?? '')}`,
          'Convert name to kebab-case',
          true,
        );

      case QuickFixId.RenameParentFolder:
        return this.renameFolder(diagnostic, skillDoc, context);

      case QuickFixId.InsertFrontmatter:
        return this.insertText(
          diagnostic,
          document,
          context,
          new vscode.Position(0, 0),
          frontmatterBlock(this.suggestName(skillDoc)),
          'Insert SKILL.md frontmatter',
        );

      case QuickFixId.InsertName:
        return this.insertText(
          diagnostic,
          document,
          context,
          new vscode.Position(frontmatterStartLine(skillDoc), 0),
          `name: ${this.suggestName(skillDoc)}\n`,
          'Insert name field',
        );

      case QuickFixId.InsertDescription:
        return this.insertText(
          diagnostic,
          document,
          context,
          this.descriptionInsertPosition(skillDoc),
          `description: ${DESCRIPTION_PLACEHOLDER}\n`,
          'Insert description field',
        );

      case QuickFixId.InsertBodyTemplate:
        return this.insertText(
          diagnostic,
          document,
          context,
          document.lineAt(document.lineCount - 1).range.end,
          `\n${bodyTemplate(this.suggestName(skillDoc))}`,
          'Insert recommended body template',
        );

      case QuickFixId.InsertUseWhenClause:
        return this.appendToDescription(
          diagnostic,
          skillDoc,
          document,
          context,
          USE_WHEN_CLAUSE,
          'Add "Use when..." clause to description',
        );

      case QuickFixId.InsertDoNotUseClause:
        return this.appendToDescription(
          diagnostic,
          skillDoc,
          document,
          context,
          DO_NOT_USE_CLAUSE,
          'Add "Do not use when..." boundary to description',
        );

      case QuickFixId.CreateMissingLinkedFile:
        return this.createLinkedFile(diagnostic, skillDoc, context);

      case QuickFixId.AddResourceLink:
        return this.addResourceLink(diagnostic, document, context);

      case QuickFixId.AddActionVerbToDictionary:
        return this.addToDictionary(
          diagnostic,
          document,
          context,
          'actionVerbs',
          'recognized action verbs',
        );

      case QuickFixId.AddArtifactToDictionary:
        return this.addToDictionary(
          diagnostic,
          document,
          context,
          'artifactHints',
          'recognized artifacts',
        );

      default:
        return undefined;
    }
  }

  /**
   * Offers to register an unrecognized word in a heuristic dictionary setting
   * (plan 9 Part C). This edits configuration, not the user's file, so it is
   * deliberately never `isPreferred`: an auto-applied fix must not write global
   * or workspace settings.
   */
  private addToDictionary(
    diagnostic: SkillDiagnostic,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
    key: 'actionVerbs' | 'artifactHints',
    label: string,
  ): vscode.CodeAction | undefined {
    const word = diagnostic.data?.word;
    // The producing diagnostic already sanitizes, but the check is repeated here
    // because this value ends up in user settings and in a matching pattern: the
    // quick fix must not depend on its caller having been careful.
    if (typeof word !== 'string' || !REGISTRABLE_WORD.test(word)) {
      return undefined;
    }
    const action = this.newAction(`Add "${word}" to ${label}`, diagnostic, context);
    action.isPreferred = false;
    action.command = {
      command: 'skillMdInspector.addHeuristicDictionaryWord',
      title: action.title,
      arguments: [{ uri: document.uri.toString(), key, word }],
    };
    return action;
  }

  private replaceKeyLine(
    diagnostic: SkillDiagnostic,
    skillDoc: SkillDocument,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
    key: string,
    replacement: string,
    title: string,
    isPreferred = false,
  ): vscode.CodeAction | undefined {
    const keyRange = skillDoc.frontmatterKeyRanges?.[key];
    if (!keyRange) {
      return undefined;
    }
    const action = this.newAction(title, diagnostic, context);
    action.isPreferred = isPreferred;
    action.edit = new vscode.WorkspaceEdit();
    // Replace the whole key+value entry so multi-line scalar values are not left
    // orphaned. Fall back to the key's line when there is no value range (e.g. an
    // empty value), which is what the single-line assumption handled before.
    const valueRange = skillDoc.frontmatterValueRanges?.[key];
    const range = valueRange
      ? new vscode.Range(
          new vscode.Position(keyRange.startLine, keyRange.startCharacter),
          new vscode.Position(valueRange.endLine, valueRange.endCharacter),
        )
      : document.lineAt(keyRange.startLine).range;
    action.edit.replace(document.uri, range, replacement);
    return action;
  }

  private renameFolder(
    diagnostic: SkillDiagnostic,
    skillDoc: SkillDocument,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction | undefined {
    const expected = diagnostic.data?.expected;
    if (typeof expected !== 'string' || !expected) {
      return undefined;
    }
    // Security: `expected` is the frontmatter `name`, which is attacker-controllable
    // in an untrusted SKILL.md. Only offer to rename to a valid kebab-case segment
    // that stays inside the parent; a value with separators or `..` (e.g.
    // "../../evil") must never drive a rename that escapes the parent directory.
    const parent = path.dirname(skillDoc.directory);
    if (!isSafeFolderRenameTarget(parent, expected)) {
      return undefined;
    }
    const oldUri = vscode.Uri.file(skillDoc.directory);
    const newUri = vscode.Uri.file(path.join(parent, expected));
    const action = this.newAction(`Rename folder to "${expected}"`, diagnostic, context);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.renameFile(oldUri, newUri, { ignoreIfExists: false });
    return action;
  }

  private insertText(
    diagnostic: SkillDiagnostic,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
    position: vscode.Position,
    text: string,
    title: string,
  ): vscode.CodeAction {
    const action = this.newAction(title, diagnostic, context);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, position, text);
    return action;
  }

  private appendToDescription(
    diagnostic: SkillDiagnostic,
    skillDoc: SkillDocument,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
    clause: string,
    title: string,
  ): vscode.CodeAction | undefined {
    if (typeof skillDoc.frontmatter?.description !== 'string') {
      return undefined;
    }
    const keyRange = skillDoc.frontmatterKeyRanges?.['description'];
    const valueRange = skillDoc.frontmatterValueRanges?.['description'];
    if (!keyRange || !valueRange) {
      return undefined;
    }
    const action = this.newAction(title, diagnostic, context);
    action.edit = new vscode.WorkspaceEdit();
    const valueStart = new vscode.Position(valueRange.startLine, valueRange.startCharacter);
    const firstChar = document.getText(new vscode.Range(valueStart, valueStart.translate(0, 1)));
    if (firstChar === '"' || firstChar === "'") {
      // Quoted scalar: appending after the value lands outside the quotes and
      // breaks the YAML. Rebuild the whole entry with the combined value, safely
      // re-serialized (JSON encoding is a valid YAML double-quoted scalar).
      const combined = skillDoc.frontmatter.description + clause;
      const entry = new vscode.Range(
        new vscode.Position(keyRange.startLine, keyRange.startCharacter),
        new vscode.Position(valueRange.endLine, valueRange.endCharacter),
      );
      action.edit.replace(document.uri, entry, `description: ${JSON.stringify(combined)}`);
    } else {
      // Plain or block (folded/literal) scalar: insert at the end of the value
      // content. This is correct even for multi-line block scalars, unlike the
      // key's physical line which the previous implementation used.
      action.edit.insert(
        document.uri,
        new vscode.Position(valueRange.endLine, valueRange.endCharacter),
        clause,
      );
    }
    return action;
  }

  private createLinkedFile(
    diagnostic: SkillDiagnostic,
    skillDoc: SkillDocument,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction | undefined {
    const absolutePath = diagnostic.data?.absolutePath;
    if (typeof absolutePath !== 'string') {
      return undefined;
    }
    // Never offer to create a file outside the skill package, even if the
    // diagnostic data is malformed or points at an escaping path.
    if (!isPathInsideDir(skillDoc.directory, absolutePath)) {
      return undefined;
    }
    const fileUri = vscode.Uri.file(absolutePath);
    const action = this.newAction(
      `Create missing file "${path.basename(absolutePath)}"`,
      diagnostic,
      context,
    );
    action.edit = new vscode.WorkspaceEdit();
    action.edit.createFile(fileUri, { ignoreIfExists: true });
    action.edit.insert(fileUri, new vscode.Position(0, 0), `# ${path.basename(absolutePath)}\n`);
    return action;
  }

  private addResourceLink(
    diagnostic: SkillDiagnostic,
    document: vscode.TextDocument,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction | undefined {
    const relativePath = diagnostic.data?.relativePath;
    if (typeof relativePath !== 'string') {
      return undefined;
    }
    const label = path.basename(relativePath);
    const action = this.newAction(`Add Markdown link to "${relativePath}"`, diagnostic, context);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(
      document.uri,
      document.lineAt(document.lineCount - 1).range.end,
      `\nSee [${label}](./${relativePath}).\n`,
    );
    return action;
  }

  private newAction(
    title: string,
    diagnostic: SkillDiagnostic,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction {
    const action = new vscode.CodeAction(title, vscode.CodeActionKind.QuickFix);
    action.diagnostics = context.diagnostics.filter((cd) => cd.code === diagnostic.code);
    return action;
  }

  private suggestName(skillDoc: SkillDocument): string {
    const folder = path.basename(skillDoc.directory);
    const kebab = toKebabCase(folder);
    return kebab || 'skill-name';
  }

  private descriptionInsertPosition(skillDoc: SkillDocument): vscode.Position {
    // Insert the new description line after the *end* of the name value so a
    // multi-line name scalar is not split. Fall back to the key line, then to the
    // first frontmatter line.
    const nameValueRange = skillDoc.frontmatterValueRanges?.['name'];
    const nameKeyRange = skillDoc.frontmatterKeyRanges?.['name'];
    const anchorLine = nameValueRange?.endLine ?? nameKeyRange?.startLine;
    const line = anchorLine !== undefined ? anchorLine + 1 : frontmatterStartLine(skillDoc);
    return new vscode.Position(line, 0);
  }
}

function overlapsLine(
  startLine: number,
  endLine: number,
  range: vscode.Range | vscode.Selection,
): boolean {
  return range.start.line <= endLine && range.end.line >= startLine;
}
