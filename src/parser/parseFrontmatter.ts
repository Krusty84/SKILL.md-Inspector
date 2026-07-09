import { parse as parseYaml, YAMLParseError } from 'yaml';
import { DiagnosticCode } from '../types/DiagnosticCode';
import type { SkillDiagnosticRange } from '../types/SkillDiagnostic';
import type { SkillFrontmatter, SkillParseError } from '../types/SkillDocument';

export interface FrontmatterParseResult {
  /** Parsed mapping, or null when frontmatter is missing/malformed. */
  frontmatter: SkillFrontmatter | null;
  /** Raw YAML text between the `---` fences (empty when there is none). */
  frontmatterRaw: string;
  /** Range covering the raw YAML block (0-based lines), if a block was found. */
  frontmatterRange?: SkillDiagnosticRange;
  /** 0-based line index of the first YAML line (line after the opening fence). */
  yamlStartLine: number;
  /** Markdown body after the closing fence. */
  body: string;
  /** 0-based line where the body starts. */
  bodyStartLine: number;
  errors: SkillParseError[];
}

const FENCE = '---';

/** Split into logical lines while tolerating CRLF and a leading BOM. */
function toLines(content: string): string[] {
  const bom = String.fromCharCode(0xfeff);
  const normalized = content.startsWith(bom) ? content.slice(bom.length) : content;
  return normalized.split(/\r?\n/);
}

/**
 * Parses the YAML frontmatter at the very top of a SKILL.md file.
 *
 * Distinguishes three failure modes the linter cares about:
 *  - missing:    no frontmatter block at all
 *  - not at top: a `---` block exists but content precedes it
 *  - invalid:    a top block exists but the YAML is unterminated or malformed
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
  const lines = toLines(content);
  const errors: SkillParseError[] = [];

  const firstLineIsFence = lines.length > 0 && lines[0].trim() === FENCE;

  if (!firstLineIsFence) {
    // Look for a fence further down to tell "missing" from "not at top".
    const fenceIndex = lines.findIndex((line) => line.trim() === FENCE);
    const onlyBlankBefore =
      fenceIndex > 0 && lines.slice(0, fenceIndex).every((line) => line.trim() === '');

    if (fenceIndex === -1) {
      errors.push({
        code: DiagnosticCode.FrontmatterMissing,
        message:
          'SKILL.md is missing YAML frontmatter. Add a `---` block with `name` and `description` at the top of the file.',
        range: singleLineRange(0),
      });
    } else {
      errors.push({
        code: DiagnosticCode.FrontmatterNotAtTop,
        message: onlyBlankBefore
          ? 'YAML frontmatter must start on the very first line, with no blank lines before it.'
          : 'YAML frontmatter must be at the top of the file, before any other content.',
        range: singleLineRange(fenceIndex),
      });
    }

    return {
      frontmatter: null,
      frontmatterRaw: '',
      yamlStartLine: 0,
      body: content,
      bodyStartLine: 0,
      errors,
    };
  }

  // The opening fence is line 0; find the closing fence.
  const closingIndex = lines.findIndex((line, i) => i > 0 && line.trim() === FENCE);

  if (closingIndex === -1) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: 'YAML frontmatter is not terminated. Add a closing `---` line.',
      range: singleLineRange(0),
    });
    return {
      frontmatter: null,
      frontmatterRaw: '',
      yamlStartLine: 1,
      body: lines.slice(1).join('\n'),
      bodyStartLine: 1,
      errors,
    };
  }

  const yamlStartLine = 1;
  const yamlLines = lines.slice(1, closingIndex);
  const frontmatterRaw = yamlLines.join('\n');
  const bodyStartLine = closingIndex + 1;
  const body = lines.slice(bodyStartLine).join('\n');
  const frontmatterRange: SkillDiagnosticRange = {
    startLine: yamlStartLine,
    startCharacter: 0,
    endLine: Math.max(yamlStartLine, closingIndex - 1),
    endCharacter: yamlLines.length > 0 ? yamlLines[yamlLines.length - 1].length : 0,
  };

  let parsed: unknown;
  try {
    parsed = parseYaml(frontmatterRaw);
  } catch (err) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: `Invalid YAML in frontmatter: ${yamlErrorMessage(err)}`,
      range: yamlErrorRange(err, yamlStartLine) ?? frontmatterRange,
    });
    return {
      frontmatter: null,
      frontmatterRaw,
      frontmatterRange,
      yamlStartLine,
      body,
      bodyStartLine,
      errors,
    };
  }

  if (parsed === null || parsed === undefined) {
    // Empty frontmatter block: treat as an empty mapping so that the
    // required-field rules report the missing name/description.
    return {
      frontmatter: {},
      frontmatterRaw,
      frontmatterRange,
      yamlStartLine,
      body,
      bodyStartLine,
      errors,
    };
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: 'Frontmatter must be a YAML mapping of keys to values.',
      range: frontmatterRange,
    });
    return {
      frontmatter: null,
      frontmatterRaw,
      frontmatterRange,
      yamlStartLine,
      body,
      bodyStartLine,
      errors,
    };
  }

  return {
    frontmatter: parsed as SkillFrontmatter,
    frontmatterRaw,
    frontmatterRange,
    yamlStartLine,
    body,
    bodyStartLine,
    errors,
  };
}

/**
 * Locates a top-level key inside the raw frontmatter and returns its range in
 * document coordinates, so diagnostics can point at the offending line.
 */
export function locateFrontmatterKey(
  frontmatterRaw: string,
  yamlStartLine: number,
  key: string,
): SkillDiagnosticRange | undefined {
  const lines = frontmatterRaw.split(/\r?\n/);
  const pattern = new RegExp(`^(\\s*)${escapeRegExp(key)}\\s*:`);
  for (let i = 0; i < lines.length; i++) {
    const match = pattern.exec(lines[i]);
    if (match) {
      return {
        startLine: yamlStartLine + i,
        startCharacter: match[1].length,
        endLine: yamlStartLine + i,
        endCharacter: lines[i].length,
      };
    }
  }
  return undefined;
}

function singleLineRange(line: number): SkillDiagnosticRange {
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: 3 };
}

function yamlErrorMessage(err: unknown): string {
  if (err instanceof YAMLParseError) {
    return err.message.split('\n')[0];
  }
  return err instanceof Error ? err.message : String(err);
}

function yamlErrorRange(err: unknown, yamlStartLine: number): SkillDiagnosticRange | undefined {
  if (err instanceof YAMLParseError && err.linePos && err.linePos[0]) {
    const start = err.linePos[0];
    const end = err.linePos[1] ?? start;
    return {
      startLine: yamlStartLine + start.line - 1,
      startCharacter: Math.max(0, start.col - 1),
      endLine: yamlStartLine + end.line - 1,
      endCharacter: Math.max(0, end.col - 1),
    };
  }
  return undefined;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
