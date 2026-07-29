import { DiagnosticCode } from '../../types/DiagnosticCode';
import type { SkillDiagnosticSeverity } from '../../types/SkillDiagnostic';
import type { CompiledSecurityPatterns } from './patterns';

/**
 * A pattern match located by character offset inside the scanned string, with
 * its diagnostic already formed. Callers convert `index`/`length` into a
 * document range (via valueRanges) — this engine is range-agnostic so the same
 * scanners serve body nodes, frontmatter values, and resource-file lines.
 */
export interface RawMatch {
  code: string;
  severity: SkillDiagnosticSeverity;
  message: string;
  index: number;
  length: number;
}

/** Runs a global regex over `value`, resetting state and guarding zero-length matches. */
function execAll(re: RegExp, value: string): RegExpExecArray[] {
  re.lastIndex = 0;
  const matches: RegExpExecArray[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(value)) !== null) {
    matches.push(match);
    if (match.index === re.lastIndex) {
      re.lastIndex += 1; // never loop forever on a zero-width match
    }
  }
  return matches;
}

/** The line containing `index`, with the offset where that line starts. */
function lineAt(value: string, index: number): { text: string; start: number } {
  const start = value.lastIndexOf('\n', index - 1) + 1;
  let end = value.indexOf('\n', index);
  if (end === -1) {
    end = value.length;
  }
  return { text: value.slice(start, end), start };
}

/** Collapses whitespace and truncates so a snippet is safe to show in one line. */
export function formatSnippet(text: string, max = 80): string {
  const collapsed = text.replace(/\s+/g, ' ').trim();
  return collapsed.length > max ? `${collapsed.slice(0, max - 1)}…` : collapsed;
}

function spansOverlap(aStart: number, aLen: number, bStart: number, bLen: number): boolean {
  return aStart < bStart + bLen && bStart < aStart + aLen;
}

/**
 * Command scanning over a code string (fenced/inline code or a resource-file
 * line). Two tiers; a risky match overlapping a dangerous one is dropped so a
 * catastrophic command reports exactly once, at the higher severity.
 * `allowedCommands` suppresses a match whose containing line includes any
 * allowlisted substring.
 */
export function scanCommands(
  value: string,
  patterns: CompiledSecurityPatterns,
  allowedCommands: readonly string[],
): RawMatch[] {
  const dangerous: RawMatch[] = [];
  for (const pattern of patterns.dangerousCommands) {
    for (const match of execAll(pattern.re, value)) {
      dangerous.push(
        toCommandMatch(value, match, DiagnosticCode.SecurityCommandDangerous, 'error', pattern.message),
      );
    }
  }
  const risky: RawMatch[] = [];
  for (const pattern of patterns.riskyCommands) {
    for (const match of execAll(pattern.re, value)) {
      const candidate = toCommandMatch(
        value,
        match,
        DiagnosticCode.SecurityCommandRisky,
        'warning',
        pattern.message,
      );
      if (dangerous.some((d) => spansOverlap(d.index, d.length, candidate.index, candidate.length))) {
        continue;
      }
      risky.push(candidate);
    }
  }
  return [...dangerous, ...risky].filter((m) => !isAllowed(value, m, allowedCommands));
}

function toCommandMatch(
  value: string,
  match: RegExpExecArray,
  code: string,
  severity: SkillDiagnosticSeverity,
  message: string,
): RawMatch {
  const line = lineAt(value, match.index);
  return {
    code,
    severity,
    message: `\`${formatSnippet(line.text)}\` — ${message}`,
    index: match.index,
    length: Math.max(1, match[0].length),
  };
}

function isAllowed(value: string, match: RawMatch, allowedCommands: readonly string[]): boolean {
  if (allowedCommands.length === 0) {
    return false;
  }
  const line = lineAt(value, match.index).text.toLowerCase();
  return allowedCommands.some((allowed) => allowed.length > 0 && line.includes(allowed));
}

/** Flags references to known risky public services (paste/exfil/tunnel/IP-echo). */
export function scanServices(
  value: string,
  patterns: CompiledSecurityPatterns,
  allowedDomains: readonly string[],
): RawMatch[] {
  if (!patterns.serviceHostRe) {
    return [];
  }
  const matches: RawMatch[] = [];
  for (const match of execAll(patterns.serviceHostRe, value)) {
    const host = match[1];
    if (!host) {
      continue;
    }
    const lower = host.toLowerCase();
    if (allowedDomains.some((allowed) => lower === allowed || lower.endsWith(`.${allowed}`))) {
      continue;
    }
    const hostIndex = match.index + match[0].indexOf(host);
    matches.push({
      code: DiagnosticCode.SecurityServiceRisky,
      severity: 'warning',
      message: `Risky public service: \`${host}\`. These endpoints are commonly used to exfiltrate data or fetch unverified content; confirm it is intended.`,
      index: hostIndex,
      length: host.length,
    });
  }
  return matches;
}

/**
 * Flags hardcoded credentials. The raw value is never echoed into the message
 * (that would re-leak it into the Problems panel and reports); only the token
 * label or key name is shown. Values matching the placeholder pattern
 * (`<YOUR_KEY>`, `$VAR`, `xxx…`, `…EXAMPLE`) are treated as templates.
 */
export function scanSecrets(value: string, patterns: CompiledSecurityPatterns): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const sig of patterns.secretSignatures) {
    for (const match of execAll(sig.re, value)) {
      if (patterns.secretPlaceholder.test(match[0])) {
        continue;
      }
      matches.push({
        code: DiagnosticCode.SecuritySecret,
        severity: 'error',
        message: `${sig.label} detected. Remove the hardcoded credential from the skill and rotate it if it is real.`,
        index: match.index,
        length: match[0].length,
      });
    }
  }
  for (const match of execAll(patterns.secretAssignment.re, value)) {
    const secretValue = match[2] ?? '';
    if (patterns.secretPlaceholder.test(secretValue)) {
      continue;
    }
    matches.push({
      code: DiagnosticCode.SecuritySecret,
      severity: 'error',
      message: `Hardcoded credential in \`${match[1]}\`. Read it from an environment variable or secret store instead.`,
      index: match.index,
      length: match[0].length,
    });
  }
  for (const match of execAll(patterns.credentialedUrl.re, value)) {
    matches.push({
      code: DiagnosticCode.SecuritySecret,
      severity: 'error',
      message: `${patterns.credentialedUrl.label}. Move the username and password out of the URL.`,
      index: match.index,
      length: match[0].length,
    });
  }
  return matches;
}

/** Flags prompt-injection / agent-manipulation wording (prose and HTML comments). */
export function scanInjection(value: string, patterns: CompiledSecurityPatterns): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns.injectionPhrases) {
    for (const match of execAll(pattern.re, value)) {
      matches.push({
        code: DiagnosticCode.SecurityPromptInjection,
        severity: 'warning',
        message: `Possible prompt injection: \`${formatSnippet(match[0])}\` — ${pattern.message}`,
        index: match.index,
        length: match[0].length,
      });
    }
  }
  return matches;
}

/** Flags references to credential stores and other sensitive paths. */
export function scanSensitivePaths(value: string, patterns: CompiledSecurityPatterns): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns.sensitivePaths) {
    for (const match of execAll(pattern.re, value)) {
      matches.push({
        code: DiagnosticCode.SecuritySensitivePath,
        severity: 'information',
        message: `Sensitive path referenced: \`${formatSnippet(match[0])}\` — ${pattern.message}`,
        index: match.index,
        length: match[0].length,
      });
    }
  }
  return matches;
}
