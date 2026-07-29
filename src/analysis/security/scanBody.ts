import { visit } from 'unist-util-visit';
import { parseMarkdownRoot } from '../../parser/markdownAst';
import { valueOrigin, offsetRange, type ValueOrigin } from '../../parser/valueRanges';
import type { SkillDiagnostic } from '../../types/SkillDiagnostic';
import { DiagnosticCode } from '../../types/DiagnosticCode';
import type { SkillDocument } from '../../types/SkillDocument';
import type { SecuritySettings } from './settings';
import type { CompiledSecurityPatterns } from './patterns';
import {
  scanCommands,
  scanSecrets,
  scanServices,
  scanInjection,
  scanSensitivePaths,
  formatSnippet,
  type RawMatch,
} from './scanText';
// scanSecrets is used in both the code and prose branches (token formats are
// distinctive enough that prose scanning stays low-false-positive).
import { toSecurityDiagnostic } from './diagnostic';

interface ScanNode {
  type: string;
  value?: string;
  position?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

const HTML_COMMENT_RE = /<!--([\s\S]*?)-->/g;
// Zero-width (200B–200D, 2060, FEFF) and bidirectional-override (202A–202E,
// 2066–2069, "Trojan Source") characters — invisible to a human reviewer.
// Built with escapes (not literal glyphs) so the source stays readable.
const INVISIBLE_RE = new RegExp(
  '[\\u200B-\\u200D\\u2060\\uFEFF\\u202A-\\u202E\\u2066-\\u2069]',
  'g',
);

/**
 * Scans the parsed Markdown body for security findings. Commands, secrets,
 * services, and sensitive paths are scanned in both prose and code contexts
 * (fenced blocks and inline code, regardless of language tag) — the whole body
 * is instructions an agent may act on, so a command in a sentence is as real as
 * one in a fence. Prose additionally gets injection-wording checks; HTML
 * comments are scanned for hidden instructions, and the raw body for
 * invisible/bidi Unicode.
 */
export function scanBody(
  doc: SkillDocument,
  patterns: CompiledSecurityPatterns,
  settings: SecuritySettings,
): SkillDiagnostic[] {
  const out: SkillDiagnostic[] = [];
  const tree = parseMarkdownRoot(doc.body);

  visit(tree, (raw: unknown) => {
    const node = raw as ScanNode;
    if (!node.position || typeof node.value !== 'string') {
      return;
    }
    const value = node.value;
    if (node.type === 'code' || node.type === 'inlineCode') {
      const origin = valueOrigin(node, doc.bodyStartLine);
      pushMatches(out, origin, value, [
        ...scanCommands(value, patterns, settings.allowedCommands),
        ...scanSecrets(value, patterns),
        ...scanServices(value, patterns, settings.allowedDomains),
        ...scanSensitivePaths(value, patterns),
      ]);
    } else if (node.type === 'text') {
      const origin = valueOrigin(node, doc.bodyStartLine);
      pushMatches(out, origin, value, [
        // Prose in a SKILL.md is itself the agent's instructions, so a command
        // written as an ordinary sentence is scanned too — not only fenced or
        // inline code. The dangerous-tier patterns are specific enough that
        // prose false positives are rare; risky-tier prose hits (e.g. "sudo")
        // are warnings and can be allowlisted or overridden.
        ...scanCommands(value, patterns, settings.allowedCommands),
        ...scanInjection(value, patterns),
        ...scanSecrets(value, patterns),
        ...scanSensitivePaths(value, patterns),
        ...scanServices(value, patterns, settings.allowedDomains),
      ]);
    } else if (node.type === 'html') {
      const origin = valueOrigin(node, doc.bodyStartLine);
      out.push(...scanHtmlComments(value, patterns, origin));
    }
  });

  out.push(...scanInvisible(doc.body, doc.bodyStartLine));
  return out;
}

function pushMatches(
  out: SkillDiagnostic[],
  origin: ValueOrigin,
  value: string,
  matches: RawMatch[],
): void {
  for (const match of matches) {
    out.push(toSecurityDiagnostic(match, offsetRange(origin, value, match.index, match.length)));
  }
}

/**
 * An HTML comment that carries imperative/command/injection wording is a hidden
 * instruction: invisible in rendered Markdown, but read by an agent. Empty or
 * purely descriptive comments are left alone.
 */
function scanHtmlComments(
  value: string,
  patterns: CompiledSecurityPatterns,
  origin: ValueOrigin,
): SkillDiagnostic[] {
  const out: SkillDiagnostic[] = [];
  HTML_COMMENT_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = HTML_COMMENT_RE.exec(value)) !== null) {
    const inner = match[1] ?? '';
    if (!patterns.hiddenImperative.test(inner)) {
      continue;
    }
    out.push(
      toSecurityDiagnostic(
        {
          code: DiagnosticCode.SecurityHiddenContent,
          severity: 'warning',
          message: `Hidden instruction in an HTML comment: \`${formatSnippet(inner)}\` — this text is invisible in rendered Markdown but read by an agent. Remove it or make it visible.`,
        },
        offsetRange(origin, value, match.index, match[0].length),
      ),
    );
  }
  return out;
}

/** Flags zero-width and bidirectional-override characters anywhere in the body. */
function scanInvisible(body: string, bodyStartLine: number): SkillDiagnostic[] {
  const out: SkillDiagnostic[] = [];
  const origin: ValueOrigin = { line: bodyStartLine, character: 0 };
  INVISIBLE_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = INVISIBLE_RE.exec(body)) !== null) {
    const code = body.codePointAt(match.index) ?? 0;
    const hex = code.toString(16).toUpperCase().padStart(4, '0');
    out.push(
      toSecurityDiagnostic(
        {
          code: DiagnosticCode.SecurityHiddenContent,
          severity: 'warning',
          message: `Invisible Unicode character (U+${hex}) in the skill text; it can hide or reorder instructions from human review. Remove it.`,
        },
        offsetRange(origin, body, match.index, 1),
      ),
    );
  }
  return out;
}
