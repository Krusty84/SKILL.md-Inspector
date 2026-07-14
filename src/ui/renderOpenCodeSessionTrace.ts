export function renderOpenCodeSessionTraceHtml(scriptUri: string, styleUri: string, cspSource: string, nonce: string): string {
  return `<!doctype html><html><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${cspSource}; style-src ${cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}' ${cspSource};"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="${styleUri}"><title>OpenCode Session Trace</title></head><body><script nonce="${nonce}" src="${scriptUri}"></script></body></html>`;
}
