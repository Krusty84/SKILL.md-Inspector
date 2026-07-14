import * as vscode from 'vscode';
import type { WorkspaceExplorerNode } from './workspaceExplorerTypes';

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });

export function compareWorkspaceNodes(a: WorkspaceExplorerNode, b: WorkspaceExplorerNode): number {
  const aDirectory = a.type === 'workspaceDirectory';
  const bDirectory = b.type === 'workspaceDirectory';
  if (aDirectory !== bDirectory) return aDirectory ? -1 : 1;
  const byName = collator.compare(workspaceNodeName(a), workspaceNodeName(b));
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

export function isDirectoryType(fileType: vscode.FileType): boolean {
  return (fileType & vscode.FileType.Directory) === vscode.FileType.Directory;
}

function workspaceNodeName(node: WorkspaceExplorerNode): string {
  if (node.type === 'workspaceRoot') return node.folder.name;
  if (node.type === 'workspaceError') return node.label;
  return node.name;
}
