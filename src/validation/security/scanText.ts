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
  /**
   * The catalog entry that produced this match. Carried through to the
   * diagnostic's `data` so `severityOverrides` can address a single pattern
   * (`skill.security.command.risky#sudo`) instead of its whole class — the
   * alternative to disabling eighteen rules to silence one.
   */
  ruleId?: string;
  severity: SkillDiagnosticSeverity;
  message: string;
  index: number;
  length: number;
}

/**
 * Whether the scanned string is a code context (a fence, inline code, or a
 * script resource) or prose. Prose in a SKILL.md is still the agent's
 * instructions and is still scanned — but a handful of catalog rules are bare
 * English words (`sudo`, `eval`) that mean something only in a command
 * position, and those are marked `codeOnly`.
 */
export type ScanContext = 'code' | 'prose';

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
 * line). Two tiers; a risky match on a line that already carries a dangerous
 * one is dropped, so a catastrophic command reports exactly once, at the higher
 * severity. Same-tier matches on one line collapse into a single finding that
 * names each distinct rule.
 *
 * Suppression and de-duplication are both line-scoped rather than span-scoped:
 * a command occupies a line, and `sudo rm -rf /` is one dangerous instruction,
 * not a dangerous one plus an unrelated warning about `sudo`.
 *
 * `allowedCommands` suppresses a match whose *matched text* includes an
 * allowlisted substring, and applies to the risky tier only.
 */
export function scanCommands(
  value: string,
  patterns: CompiledSecurityPatterns,
  allowedCommands: readonly string[],
  context: ScanContext = 'code',
): RawMatch[] {
  const dangerous: RawMatch[] = [];
  for (const pattern of patterns.dangerousCommands) {
    if (pattern.codeOnly && context === 'prose') {
      continue;
    }
    for (const match of execAll(pattern.re, value)) {
      dangerous.push(
        toCommandMatch(
          match,
          DiagnosticCode.SecurityCommandDangerous,
          'error',
          pattern.message,
          patterns,
          pattern.id,
        ),
      );
    }
  }
  const dangerousLines = new Set(dangerous.map((m) => lineAt(value, m.index).start));
  const risky: RawMatch[] = [];
  for (const pattern of patterns.riskyCommands) {
    if (pattern.codeOnly && context === 'prose') {
      continue;
    }
    for (const match of execAll(pattern.re, value)) {
      const candidate = toCommandMatch(
        match,
        DiagnosticCode.SecurityCommandRisky,
        'warning',
        pattern.message,
        patterns,
        pattern.id,
      );
      if (dangerousLines.has(lineAt(value, candidate.index).start)) {
        continue;
      }
      // The allowlist is a warning-tier convenience. It must never be able to
      // switch off an `error`, so it is applied here and not to the tier above.
      if (isAllowed(value, candidate, allowedCommands)) {
        continue;
      }
      risky.push(candidate);
    }
  }
  return [...mergePerLine(value, dangerous), ...mergePerLine(value, risky)];
}

/**
 * Collapses same-tier matches that share a line into one finding at the
 * earliest index, joining the distinct explanations. Four warnings whose
 * messages all open with the same snippet are noise, not four problems.
 */
function mergePerLine(value: string, matches: RawMatch[]): RawMatch[] {
  if (matches.length < 2) {
    return matches;
  }
  const byLine = new Map<number, RawMatch[]>();
  for (const match of matches) {
    const line = lineAt(value, match.index).start;
    const group = byLine.get(line);
    if (group) {
      group.push(match);
    } else {
      byLine.set(line, [match]);
    }
  }
  const merged: RawMatch[] = [];
  for (const group of byLine.values()) {
    if (group.length === 1) {
      merged.push(group[0]);
      continue;
    }
    group.sort((a, b) => a.index - b.index);
    const seen = new Set<string>();
    const messages: string[] = [];
    for (const match of group) {
      if (!seen.has(match.message)) {
        seen.add(match.message);
        messages.push(match.message);
      }
    }
    merged.push({ ...group[0], message: messages.join(' ') });
  }
  return merged.sort((a, b) => a.index - b.index);
}

function toCommandMatch(
  match: RegExpExecArray,
  code: string,
  severity: SkillDiagnosticSeverity,
  message: string,
  patterns: CompiledSecurityPatterns,
  ruleId: string,
): RawMatch {
  return {
    code,
    ruleId,
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

/**
 * An allowlist entry must have something to do with the finding it silences.
 *
 * Testing the whole containing line let an unrelated fragment do the job:
 * `allowedCommands: ['preserve-root']` silenced the very error that
 * `--no-preserve-root` raises, and allowlisting one benign command silenced
 * everything chained after it on the same line.
 *
 * Testing only the matched span would fix that but break the documented use —
 * `docs/rules.md` tells authors to "add the exact line", and no pattern ever
 * matches a whole command line, so every such entry would silently stop
 * working. So an entry qualifies two ways: it names the matched command (or
 * part of it), or it is a fuller command line that both contains what matched
 * and actually appears here.
 */
function isAllowed(value: string, match: RawMatch, allowedCommands: readonly string[]): boolean {
  if (allowedCommands.length === 0) {
    return false;
  }
  const matched = value.slice(match.index, match.index + match.length).toLowerCase();
  const line = lineAt(value, match.index).text.toLowerCase();
  return allowedCommands.some((allowed) => {
    if (allowed.length === 0) {
      return false;
    }
    return matched.includes(allowed) || (allowed.includes(matched) && line.includes(allowed));
  });
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
      ruleId: host.toLowerCase(),
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
        ruleId: sig.id,
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
    if (!looksLikeLiteralCredential(secretValue, patterns)) {
      continue;
    }
    if (patterns.secretPlaceholder.test(secretValue)) {
      continue;
    }
    const candidate: RawMatch = {
      code: DiagnosticCode.SecuritySecret,
      ruleId: patterns.secretAssignment.id,
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
      ruleId: patterns.credentialedUrl.id,
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

/**
 * A value is only a hardcoded credential if it is a literal that looks like
 * one. The assignment pattern's value group accepts any 8+ non-space
 * characters, so it read `api_key: os.environ["API_KEY"]` as a credential —
 * erroring on the very remediation the diagnostic's message recommends — and
 * `password: choose something memorable` as another.
 *
 * Gating on credential *shape* rather than enumerating what a value must not
 * be: a function call, an interpolation, or a secret-manager lookup is not a
 * literal, and a literal credential carries mixed alphanumerics or is a long
 * opaque run.
 */
const NONLITERAL_VALUE =
  /[([{]|\$\{|\bos\.environ\b|\bgetenv\b|\bprocess\.env\b|\bvault\b|\bkeyring\b|\bsecret_manager\b/i;
const CREDENTIAL_SHAPE =
  /^(?=.*[0-9])(?=.*[A-Za-z])[A-Za-z0-9_\-.+/=]{8,}$|^[A-Za-z0-9_\-+/=]{16,}$/;

function looksLikeLiteralCredential(value: string, patterns: CompiledSecurityPatterns): boolean {
  if (value.length === 0 || NONLITERAL_VALUE.test(value)) {
    return false;
  }
  if (patterns.secretPlaceholder.test(value)) {
    return false;
  }
  return CREDENTIAL_SHAPE.test(value);
}

/** Flags prompt-injection / agent-manipulation wording (prose and HTML comments). */
export function scanInjection(value: string, patterns: CompiledSecurityPatterns): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns.injectionPhrases) {
    for (const match of execAll(pattern.re, value)) {
      matches.push({
        code: DiagnosticCode.SecurityPromptInjection,
        ruleId: pattern.id,
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
      ruleId: 'hiddenImperative',
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
      ruleId: 'hiddenUnicode',
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

/**
 * Wording that makes a sensitive-path mention advice about *protecting* the
 * file rather than reading it. "Add .env to .gitignore" is the recommended
 * practice, not a finding.
 */
const PROTECTIVE_CONTEXT = /\.gitignore|\.dockerignore|never\s+commit|do\s+not\s+commit/i;

/** Flags references to credential stores and other sensitive paths. */
export function scanSensitivePaths(value: string, patterns: CompiledSecurityPatterns): RawMatch[] {
  const matches: RawMatch[] = [];
  for (const pattern of patterns.sensitivePaths) {
    for (const match of execAll(pattern.re, value)) {
      if (PROTECTIVE_CONTEXT.test(lineAt(value, match.index).text)) {
        continue;
      }
      matches.push({
        code: DiagnosticCode.SecuritySensitivePath,
        ruleId: pattern.id,
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
