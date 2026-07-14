import * as vscode from 'vscode';

export class OpenCodeSessionTraceState {
  private rawUri: vscode.Uri | undefined;

  setRawUri(rawUri: vscode.Uri | undefined): void {
    this.rawUri = rawUri;
  }

  getRawUri(): vscode.Uri | undefined {
    return this.rawUri;
  }
}
