import * as path from 'node:path';
import * as vscode from 'vscode';
import { analyzeSkill } from '../analysis/analyzeSkill';
import { readConfig } from '../config';
import { isSkillFile } from '../diagnostics/mapping';
import { QuickFixId } from '../types/DiagnosticCode';
import { locateFrontmatterKey } from '../parser/parseFrontmatter';
import { frontmatterStartLine } from '../parser/parseSkillFile';
import { isPathInsideDir } from '../parser/linkPaths';
import { toKebabCase } from '../validation/validateName';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import type { SkillDocument } from '../types/SkillDocument';
import {
  DESCRIPTION_PLACEHOLDER,
  USE_WHEN_CLAUSE,
  DO_NOT_USE_CLAUSE,
  frontmatterBlock,
  bodyTemplate,
} from './templates';

export class SkillCodeActionProvider implements vscode.CodeActionProvider {
  static readonly providedCodeActionKinds = [vscode.CodeActionKind.QuickFix];

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] {
    if (!isSkillFile(document)) {
      return [];
    }

    const config = readConfig(document.uri);
    const { document: skillDoc, diagnostics } = analyzeSkill(
      document.uri.fsPath,
      document.getText(),
      config.profile,
      config.resourceExclude,
    );

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

      default:
        return undefined;
    }
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
    const keyRange = locateFrontmatterKey(skillDoc.frontmatterRaw, frontmatterStartLine(skillDoc), key);
    if (!keyRange) {
      return undefined;
    }
    const action = this.newAction(title, diagnostic, context);
    action.isPreferred = isPreferred;
    action.edit = new vscode.WorkspaceEdit();
    action.edit.replace(document.uri, document.lineAt(keyRange.startLine).range, replacement);
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
    const oldUri = vscode.Uri.file(skillDoc.directory);
    const newUri = vscode.Uri.file(path.join(path.dirname(skillDoc.directory), expected));
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
    const keyRange = locateFrontmatterKey(
      skillDoc.frontmatterRaw,
      frontmatterStartLine(skillDoc),
      'description',
    );
    if (!keyRange) {
      return undefined;
    }
    const action = this.newAction(title, diagnostic, context);
    action.edit = new vscode.WorkspaceEdit();
    action.edit.insert(document.uri, document.lineAt(keyRange.startLine).range.end, clause);
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
    const nameRange = locateFrontmatterKey(
      skillDoc.frontmatterRaw,
      frontmatterStartLine(skillDoc),
      'name',
    );
    const line = nameRange ? nameRange.startLine + 1 : frontmatterStartLine(skillDoc);
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
