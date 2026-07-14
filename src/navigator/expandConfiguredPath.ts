import * as path from 'node:path';

export interface PathExpansionContext {
  homeDir: string;
  cwd: string;
  env: Record<string, string | undefined>;
}

export function expandConfiguredPath(input: string, context: PathExpansionContext): string | undefined {
  if (/`|\$\(|<\(|\|/.test(input)) {
    return undefined;
  }
  let expanded = input;
  if (expanded === '~' || expanded.startsWith(`~${path.sep}`) || expanded.startsWith('~/')) {
    expanded = path.join(context.homeDir, expanded.slice(2));
  }
  expanded = expanded.replace(/\$\{env:([A-Za-z_][A-Za-z0-9_]*)\}/g, (_match, name: string) => context.env[name] ?? '');
  return path.resolve(context.cwd, expanded);
}
