import * as vscode from 'vscode';

export interface WorkspaceRootNode {
  type: 'workspaceRoot';
  id: string;
  folder: vscode.WorkspaceFolder;
  uri: vscode.Uri;
}

export interface WorkspaceDirectoryNode {
  type: 'workspaceDirectory';
  id: string;
  uri: vscode.Uri;
  name: string;
  parentUri: vscode.Uri;
}

export interface WorkspaceFileNode {
  type: 'workspaceFile';
  id: string;
  uri: vscode.Uri;
  name: string;
  fileType: vscode.FileType;
  parentUri: vscode.Uri;
}

export interface WorkspaceErrorNode {
  type: 'workspaceError';
  id: string;
  label: string;
  parentUri: vscode.Uri;
}

export interface WorkspaceLoadingNode {
  type: 'loading';
  id: string;
  label: string;
  parentUri: vscode.Uri;
}

export type WorkspaceExplorerNode =
  WorkspaceRootNode | WorkspaceDirectoryNode | WorkspaceFileNode | WorkspaceErrorNode;
export type WorkspaceContainerNode = WorkspaceRootNode | WorkspaceDirectoryNode;
export type WorkspaceExplorerChild = WorkspaceExplorerNode | WorkspaceLoadingNode;
