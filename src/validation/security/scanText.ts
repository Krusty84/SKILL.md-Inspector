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

const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;
const EMOJI_BEFORE_ZWJ_RE =
  /\p{Extended_Pictographic}(?:\uFE0F|\p{Emoji_Modifier})?$/u;
const EMOJI_AFTER_ZWJ_RE = /^\p{Extended_Pictographic}/u;

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
      const candidate: RawMatch = {
        code: DiagnosticCode.SecuritySecret,
        severity: 'error',
        message: `${sig.label} detected. Remove the hardcoded credential from the skill and rotate it if it is real.`,
        index: match.index,
        length: match[0].length,
      };
      if (!matches.some((existing) => matchesOverlap(existing, candidate))) {
        matches.push(candidate);
      }
    }
  }
  for (const match of execAll(patterns.secretAssignment.re, value)) {
    const secretValue = match[2] ?? '';
    if (patterns.secretPlaceholder.test(secretValue)) {
      continue;
    }
    const candidate: RawMatch = {
      code: DiagnosticCode.SecuritySecret,
      severity: 'error',
      message: `Hardcoded credential in \`${match[1]}\`. Read it from an environment variable or secret store instead.`,
      index: match.index,
      length: match[0].length,
    };
    if (!matches.some((existing) => matchesOverlap(existing, candidate))) {
      matches.push(candidate);
    }
  }
  for (const match of execAll(patterns.credentialedUrl.re, value)) {
    const candidate: RawMatch = {
      code: DiagnosticCode.SecuritySecret,
      severity: 'error',
      message: `${patterns.credentialedUrl.label}. Move the username and password out of the URL.`,
      index: match.index,
      length: match[0].length,
    };
    if (!matches.some((existing) => matchesOverlap(existing, candidate))) {
      matches.push(candidate);
    }
  }
  return matches;
}

function matchesOverlap(a: RawMatch, b: RawMatch): boolean {
  return spansOverlap(a.index, a.length, b.index, b.length);
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

/**
 * Flags HTML comments that carry imperative/command/injection wording. Empty
 * or descriptive comments remain valid.
 */
export function scanHtmlCommentInstructions(
  value: string,
  patterns: CompiledSecurityPatterns,
): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const match of execAll(HTML_COMMENT_RE, value)) {
    const inner = match[1] ?? '';
    if (!patterns.hiddenImperative.test(inner)) {
      continue;
    }
    matches.push({
      code: DiagnosticCode.SecurityHiddenContent,
      severity: 'warning',
      message: `Hidden instruction in an HTML comment: \`${formatSnippet(inner)}\` — this text is invisible in rendered Markdown but read by an agent. Remove it or make it visible.`,
      index: match.index,
      length: match[0].length,
    });
  }
  return matches;
}

/** Flags invisible Unicode, excluding a leading BOM and legitimate emoji ZWJ sequences. */
export function scanInvisible(
  value: string,
  patterns: CompiledSecurityPatterns,
): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const match of execAll(patterns.hiddenUnicode, value)) {
    const code = value.codePointAt(match.index) ?? 0;
    if (code === 0xfeff && match.index === 0) {
      continue;
    }
    if (code === 0x200d && isEmojiJoiner(value, match.index, match[0].length)) {
      continue;
    }
    const hex = code.toString(16).toUpperCase().padStart(4, '0');
    matches.push({
      code: DiagnosticCode.SecurityHiddenContent,
      severity: 'warning',
      message: `Invisible Unicode character (U+${hex}) in the text; it can hide or reorder instructions from human review. Remove it.`,
      index: match.index,
      length: match[0].length,
    });
  }
  return matches;
}

function isEmojiJoiner(value: string, index: number, length: number): boolean {
  const before = value.slice(Math.max(0, index - 8), index);
  const after = value.slice(index + length, index + length + 8);
  return EMOJI_BEFORE_ZWJ_RE.test(before) && EMOJI_AFTER_ZWJ_RE.test(after);
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
