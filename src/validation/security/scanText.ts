import * as l10n from '@vscode/l10n';
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

const REDACTED = '[redacted]';

/**
 * Upper bound on the text handed to `redactSecrets`. Snippets are truncated to
 * 80 characters for display, so redacting far past that is wasted work — but
 * the bound must stay well clear of 80 so a credential near the truncation
 * point is replaced *before* the cut rather than sliced into a still-revealing
 * fragment.
 */
const REDACT_SCAN_LIMIT = 1000;

/**
 * Replaces any credential-shaped substring with `[redacted]` before display.
 *
 * Every scanner that echoes matched text into its message routes through here,
 * because a credential can share its span with a finding of any kind — a token
 * passed to a `sudo` command, a path beside a key, wording inside an HTML
 * comment. Diagnostic messages are written to `skills.index.json` in the
 * workspace root, so a leak here is a leak onto disk and usually into git.
 *
 * Cost is bounded: the input is an already-matched span, sliced to
 * `REDACT_SCAN_LIMIT` before matching.
 */
function redactSecrets(text: string, patterns: CompiledSecurityPatterns): string {
  let out = text.length > REDACT_SCAN_LIMIT ? text.slice(0, REDACT_SCAN_LIMIT) : text;
  for (const signature of patterns.secretSignatures) {
    signature.re.lastIndex = 0;
    out = out.replace(signature.re, REDACTED);
  }
  patterns.secretAssignment.re.lastIndex = 0;
  out = out.replace(patterns.secretAssignment.re, (full: string, _key: string, value?: string) => {
    // Group 2 is the value and always ends the match, so trimming its length
    // off the tail keeps `api_key=` visible while dropping what follows.
    if (typeof value !== 'string' || value.length === 0) {
      return full;
    }
    if (patterns.secretPlaceholder.test(value)) {
      return full; // `<YOUR_KEY>` / `$VAR` is the documentation, not the secret
    }
    return `${full.slice(0, full.length - value.length)}${REDACTED}`;
  });
  patterns.credentialedUrl.re.lastIndex = 0;
  out = out.replace(patterns.credentialedUrl.re, REDACTED);
  return out;
}

/** `formatSnippet`, with credentials stripped first. Use for anything shown to the user. */
function safeSnippet(text: string, patterns: CompiledSecurityPatterns, max = 80): string {
  return formatSnippet(redactSecrets(text, patterns), max);
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
        toCommandMatch(
          match,
          DiagnosticCode.SecurityCommandDangerous,
          'error',
          pattern.message,
          patterns,
        ),
      );
    }
  }
  const risky: RawMatch[] = [];
  for (const pattern of patterns.riskyCommands) {
    for (const match of execAll(pattern.re, value)) {
      const candidate = toCommandMatch(
        match,
        DiagnosticCode.SecurityCommandRisky,
        'warning',
        pattern.message,
        patterns,
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
  match: RegExpExecArray,
  code: string,
  severity: SkillDiagnosticSeverity,
  message: string,
  patterns: CompiledSecurityPatterns,
): RawMatch {
  return {
    code,
    severity,
    // The catalog/user-supplied explanation is the translatable part; the
    // snippet and the em-dash glue stay as-is. The snippet is the matched
    // command itself, not its containing line: the diagnostic range already
    // points at this span, so the rest of the line adds nothing the editor
    // does not show — and anything else sharing the line (a token, a
    // credentialed URL) would otherwise be copied into every surface that
    // renders this message.
    message: `\`${safeSnippet(match[0], patterns)}\` — ${l10n.t(message)}`,
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
      message: l10n.t(
        'Risky public service: `{0}`. These endpoints are commonly used to exfiltrate data or fetch unverified content; confirm it is intended.',
        host,
      ),
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
        message: l10n.t(
          '{0} detected. Remove the hardcoded credential from the skill and rotate it if it is real.',
          l10n.t(sig.label),
        ),
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
      message: l10n.t(
        'Hardcoded credential in `{0}`. Read it from an environment variable or secret store instead.',
        match[1],
      ),
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
      message: l10n.t(
        '{0}. Move the username and password out of the URL.',
        l10n.t(patterns.credentialedUrl.label),
      ),
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
        message: l10n.t(
          'Possible prompt injection: `{0}` — {1}',
          safeSnippet(match[0], patterns),
          l10n.t(pattern.message),
        ),
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
      message: l10n.t(
        'Hidden instruction in an HTML comment: `{0}` — this text is invisible in rendered Markdown but read by an agent. Remove it or make it visible.',
        safeSnippet(inner, patterns),
      ),
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
      message: l10n.t(
        'Invisible Unicode character (U+{0}) in the text; it can hide or reorder instructions from human review. Remove it.',
        hex,
      ),
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
        message: l10n.t(
          'Sensitive path referenced: `{0}` — {1}',
          safeSnippet(match[0], patterns),
          l10n.t(pattern.message),
        ),
        index: match.index,
        length: match[0].length,
      });
    }
  }
  return matches;
}
