import { visit } from 'unist-util-visit';
import { parseMarkdownRoot } from '../../parser/markdownAst';
import { valueOrigin, offsetRange, type ValueOrigin } from '../../parser/valueRanges';
import type { SkillDiagnostic } from '../../types/SkillDiagnostic';
import type { SkillDocument } from '../../types/SkillDocument';
import type { SecuritySettings } from './settings';
import type { CompiledSecurityPatterns } from './patterns';
import {
  scanCommands,
  scanSecrets,
  scanServices,
  scanInjection,
  scanSensitivePaths,
  scanHtmlCommentInstructions,
  scanInvisible,
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
        ...scanCommands(value, patterns, settings.allowedCommands, 'code'),
        ...scanSecrets(value, patterns),
        ...scanServices(value, patterns, settings.allowedDomains),
        ...scanSensitivePaths(value, patterns),
      ]);
    } else if (node.type === 'text') {
      const origin = valueOrigin(node, doc.bodyStartLine);
      pushMatches(out, origin, value, [
        // Prose in a SKILL.md is itself the agent's instructions, so a command
        // written as an ordinary sentence is scanned too — not only fenced or
        // inline code. The policy stands; what changed is that the handful of
        // rules whose source is a bare English word (`sudo`, `eval`) are marked
        // `codeOnly` in the catalog and sit out this pass, because in prose
        // they match ordinary sentences rather than commands.
        ...scanCommands(value, patterns, settings.allowedCommands, 'prose'),
        ...scanInjection(value, patterns),
        ...scanSecrets(value, patterns),
        ...scanSensitivePaths(value, patterns),
        ...scanServices(value, patterns, settings.allowedDomains),
      ]);
    } else if (node.type === 'html') {
      const origin = valueOrigin(node, doc.bodyStartLine);
      pushMatches(out, origin, value, scanHtmlCommentInstructions(value, patterns));
    }
  });

  pushMatches(
    out,
    { line: doc.bodyStartLine, character: 0 },
    doc.body,
    scanInvisible(doc.body, patterns),
  );
  return out;
}

function pushMatches(
  out: SkillDiagnostic[],
  origin: ValueOrigin,
  value: string,
  matches: RawMatch[],
): void {
  for (const match of matches) {
    out.push(
      toSecurityDiagnostic(
        match,
        offsetRange(origin, value, match.index, match.length),
        match.ruleId ? { ruleId: match.ruleId } : undefined,
      ),
    );
  }
}
