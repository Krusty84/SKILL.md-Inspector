import { parseDocument, LineCounter, isMap, isScalar } from 'yaml';
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
  /** Document ranges of each top-level key, from the YAML AST (0-based lines). */
  frontmatterKeyRanges: Record<string, SkillDiagnosticRange>;
  /** 0-based line index of the first YAML line (line after the opening fence). */
  yamlStartLine: number;
  /** Markdown body after the closing fence. */
  body: string;
  /** 0-based line where the body starts. */
  bodyStartLine: number;
  errors: SkillParseError[];
}

const FENCE = '---';
/** A later delimiter is frontmatter only when followed by a conservative YAML key. */
function isPlausibleLaterFrontmatter(lines: string[], index: number): boolean {
  if (lines[index] !== FENCE) return false;
  for (let i = index + 1; i < lines.length; i++) {
    if (lines[i] === FENCE) return false;
    if (lines[i].trim() === '') continue;
    return /^[A-Za-z][\w-]*\s*:/.test(lines[i]);
  }
  return false;
}


/** Split into logical lines while tolerating CRLF and a leading BOM. */
function toLines(content: string): string[] {
  const bom = String.fromCharCode(0xfeff);
  const normalized = content.startsWith(bom) ? content.slice(bom.length) : content;
  return normalized.split(/\r?\n/);
}

/**
 * Parses the YAML frontmatter at the very top of a SKILL.md file using the YAML
 * AST (so top-level key ranges, quoted/nested keys, and duplicate keys are exact).
 *
 * Distinguishes the failure modes the linter cares about:
 *  - missing:    no frontmatter block at all
 *  - not at top: a `---` block exists but content precedes it
 *  - invalid:    a top block exists but the YAML is unterminated or malformed
 *  - duplicate:  a top-level key appears more than once (non-fatal; last wins)
 */
export function parseFrontmatter(content: string): FrontmatterParseResult {
  const lines = toLines(content);
  const errors: SkillParseError[] = [];

  const firstLineIsFence = lines.length > 0 && lines[0] === FENCE;

  if (!firstLineIsFence) {
    // Look for a fence further down to tell "missing" from "not at top".
    const fenceIndex = lines.findIndex((_, index) => index > 0 && isPlausibleLaterFrontmatter(lines, index));
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
      frontmatterKeyRanges: {},
      yamlStartLine: 0,
      body: content,
      bodyStartLine: 0,
      errors,
    };
  }

  // The opening fence is line 0; find the closing fence.
  const closingIndex = lines.findIndex((line, i) => i > 0 && line === FENCE);

  if (closingIndex === -1) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: 'YAML frontmatter is not terminated. Add a closing `---` line.',
      range: singleLineRange(0),
    });
    return {
      frontmatter: null,
      frontmatterRaw: '',
      frontmatterKeyRanges: {},
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

  const lineCounter = new LineCounter();
  const doc = parseDocument(frontmatterRaw, { lineCounter });

  // Converts YAML character offsets (into frontmatterRaw) to document coordinates.
  const toRange = (start: number, end: number): SkillDiagnosticRange => {
    const s = lineCounter.linePos(start);
    const e = lineCounter.linePos(end);
    return {
      startLine: yamlStartLine + s.line - 1,
      startCharacter: Math.max(0, s.col - 1),
      endLine: yamlStartLine + e.line - 1,
      endCharacter: Math.max(0, e.col - 1),
    };
  };

  // Top-level key ranges straight from the AST — nested keys never appear here.
  const frontmatterKeyRanges: Record<string, SkillDiagnosticRange> = {};
  if (isMap(doc.contents)) {
    for (const item of doc.contents.items) {
      if (isScalar(item.key) && item.key.range) {
        const name = String(item.key.value);
        if (!(name in frontmatterKeyRanges)) {
          frontmatterKeyRanges[name] = toRange(item.key.range[0], item.key.range[1]);
        }
      }
    }
  }

  // Duplicate keys are non-fatal (last value wins) but reported at the duplicate.
  for (const err of doc.errors) {
    if (err.code === 'DUPLICATE_KEY') {
      errors.push({
        code: DiagnosticCode.FrontmatterDuplicateKey,
        message: `Duplicate frontmatter key: ${err.message.split('\n')[0]}`,
        range: err.pos ? toRange(err.pos[0], err.pos[1]) : frontmatterRange,
      });
    }
  }

  const fatal = doc.errors.filter((err) => err.code !== 'DUPLICATE_KEY');
  if (fatal.length > 0) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: `Invalid YAML in frontmatter: ${fatal[0].message.split('\n')[0]}`,
      range: fatal[0].pos ? toRange(fatal[0].pos[0], fatal[0].pos[1]) : frontmatterRange,
    });
    return baseResult(null);
  }

  const parsed = doc.toJS();

  if (parsed === null || parsed === undefined) {
    // Empty frontmatter block: treat as an empty mapping so the required-field
    // rules report the missing name/description.
    return baseResult({});
  }

  if (typeof parsed !== 'object' || Array.isArray(parsed)) {
    errors.push({
      code: DiagnosticCode.FrontmatterInvalid,
      message: 'Frontmatter must be a YAML mapping of keys to values.',
      range: frontmatterRange,
    });
    return baseResult(null);
  }

  return baseResult(parsed as SkillFrontmatter);

  function baseResult(frontmatter: SkillFrontmatter | null): FrontmatterParseResult {
    return {
      frontmatter,
      frontmatterRaw,
      frontmatterRange,
      frontmatterKeyRanges,
      yamlStartLine,
      body,
      bodyStartLine,
      errors,
    };
  }
}

function singleLineRange(line: number): SkillDiagnosticRange {
  return { startLine: line, startCharacter: 0, endLine: line, endCharacter: 3 };
}
