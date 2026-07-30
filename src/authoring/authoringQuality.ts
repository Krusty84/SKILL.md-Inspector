import * as l10n from '@vscode/l10n';
import type { SkillDocument, SkillResource } from '../types/SkillDocument';
import type { QualityAssessmentState } from '../types/QualityAssessment';
import { DiagnosticCode } from '../types/DiagnosticCode';
import {
  DEFAULT_HEURISTIC_DICTIONARIES,
  type HeuristicDictionaries,
} from '../quality/dictionaries';
import { buildVerbForms } from '../quality/wordForms';
import { analyzeBodyEvidence } from '../validation/bodyEvidence';
import { countTextLines } from '../analysis/textMetrics';

/**
 * Deliberately non-evaluative: these checks count structural defects, so the
 * band names describe the defect load and never praise the content. `clean`
 * means no findings at all — an `excellent`-style top band would let a body
 * with a real finding read as top marks.
 */
export type AuthoringLabel = 'clean' | 'minor-issues' | 'issues' | 'defects';

export type AuthoringSeverity = 'major' | 'moderate' | 'minor';

export interface AuthoringFinding {
  criterion: string;
  severity: AuthoringSeverity;
  message: string;
  suggestion: string;
}

interface InstructionQualityResultBase {
  findings: AuthoringFinding[];
}

export interface ScoredInstructionQualityResult extends InstructionQualityResultBase {
  state: Extract<QualityAssessmentState, 'scored'>;
  score: number;
  label: AuthoringLabel;
}

export interface NotScoredInstructionQualityResult extends InstructionQualityResultBase {
  state: Extract<QualityAssessmentState, 'not-scored'>;
  score: null;
  label: null;
  notScoredReason: string;
}

export type InstructionQualityResult =
  ScoredInstructionQualityResult | NotScoredInstructionQualityResult;

export interface ResourceQualityResult {
  score: number;
  label: AuthoringLabel;
  findings: AuthoringFinding[];
}

export interface SkillAuthoringQuality {
  instructions: InstructionQualityResult;
  resources: ResourceQualityResult;
}

/**
 * Penalty per finding. A structural failure of the whole instruction body
 * (empty, headings-only) is weighted far above a housekeeping issue like one
 * unreferenced asset file.
 */
const SEVERITY_PENALTY: Record<AuthoringSeverity, number> = {
  major: 100,
  moderate: 20,
  minor: 10,
};

const MAX_BODY_LINES = 500;
const MIN_SUBSTANTIVE_WORDS = 30;
const MIN_CONCRETE_STEPS = 3;
const MIN_REPETITION_LINES = 100;
const MIN_REPEATED_LINE_LENGTH = 20;
const REPETITION_THRESHOLD = 0.25;
const LARGE_RESOURCE_BYTES = 1024 * 1024;

/**
 * Deterministic authoring checks run on full save / report generation; never
 * used by text-only validation. These are structural hygiene checks — they do
 * not judge whether the instructions are *correct*, only whether the body and
 * bundled resources have obvious authoring defects.
 */
export function assessAuthoringQuality(
  doc: SkillDocument,
  dictionaries: HeuristicDictionaries = DEFAULT_HEURISTIC_DICTIONARIES,
  bodyLines: number = countTextLines(doc.body),
): SkillAuthoringQuality {
  const resourceFindings = assessResources(doc.resources);
  return {
    instructions:
      doc.frontmatter === null
        ? notScoredInstructions(instructionNotScoredReason(doc))
        : {
            state: 'scored',
            ...toResult(assessInstructions(doc.body, doc.bodyStartLine, dictionaries, bodyLines)),
          },
    resources: toResult(resourceFindings),
  };
}

function toResult(findings: AuthoringFinding[]): ResourceQualityResult {
  // Repeated housekeeping findings are grouped by severity, with a cap per class.
  const penalties = new Map<AuthoringSeverity, number>();
  for (const finding of findings) {
    const cap = finding.severity === 'minor' ? 30 : finding.severity === 'moderate' ? 50 : 100;
    penalties.set(
      finding.severity,
      Math.min(cap, (penalties.get(finding.severity) ?? 0) + SEVERITY_PENALTY[finding.severity]),
    );
  }
  const severityPenalty = [...penalties.values()].reduce((sum, value) => sum + value, 0);
  const longRepetitivePenalty =
    findings.some((finding) => finding.criterion === 'Length') &&
    findings.some((finding) => finding.criterion === 'Repetitive instructions')
      ? 50
      : 0;
  const score = Math.max(0, 100 - Math.max(severityPenalty, longRepetitivePenalty));
  return { score, label: authoringLabelFor(score), findings };
}

function instructionNotScoredReason(doc: SkillDocument): string {
  return doc.parseErrors.some((error) => error.code === DiagnosticCode.FrontmatterMissing)
    ? l10n.t('frontmatter is missing')
    : l10n.t('frontmatter could not be parsed');
}

function notScoredInstructions(reason: string): InstructionQualityResult {
  return {
    state: 'not-scored',
    score: null,
    label: null,
    notScoredReason: reason,
    findings: [],
  };
}

/**
 * Bands the same score the arithmetic above produces. The top band requires a
 * full 100 rather than 90+: the smallest possible finding costs 10 points, so
 * `clean` is reachable only with an empty findings list.
 */
function authoringLabelFor(score: number): AuthoringLabel {
  if (score >= 100) return 'clean';
  if (score >= 75) return 'minor-issues';
  if (score >= 30) return 'issues';
  return 'defects';
}

function assessInstructions(
  body: string,
  bodyStartLine: number,
  dictionaries: HeuristicDictionaries,
  bodyLines: number,
): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];

  if (body.trim().length === 0) {
    findings.push({
      criterion: 'Substantive body',
      severity: 'major',
      message: l10n.t('Instruction body is empty.'),
      suggestion: l10n.t(
        'Write the instructions the agent should follow after the skill triggers.',
      ),
    });
    return findings; // every other body check is meaningless on an empty body
  }

  const scan = scanLines(body);
  const { lines } = scan;
  const sections = parseSections(lines);
  const bodyEvidence = analyzeBodyEvidence(body);
  const hasProse = lines.some(
    (line) => !line.isHeading && !line.isFenceDelimiter && line.text.trim().length > 0,
  );

  if (!hasProse) {
    findings.push({
      criterion: 'Substantive body',
      severity: 'major',
      message: l10n.t('Body contains headings only, with no instruction content.'),
      suggestion: l10n.t('Add concrete instructions under the headings.'),
    });
  } else if (!hasSubstantiveInstructions(lines, dictionaries)) {
    findings.push({
      criterion: 'Substantive instructions',
      severity: 'moderate',
      message: l10n.t(
        'Body does not contain enough meaningful prose or concrete instruction steps.',
      ),
      suggestion: l10n.t('Add specific guidance or at least three concrete workflow steps.'),
    });
  }

  if (scan.openFence) {
    const marker = scan.openFence.marker.repeat(scan.openFence.length);
    const openingLine = bodyStartLine + scan.openFence.lineIndex + 1;
    findings.push({
      criterion: 'Unclosed code fence',
      severity: 'major',
      message: l10n.t(
        'Code fence opened on line {0} remains open at the end of the file.',
        openingLine,
      ),
      suggestion: l10n.t('Add a matching {0} closing fence.', marker),
    });
  }

  // Headings are included: "## TODO: fill this in" is a placeholder too. The
  // angle-bracket form rejects '=' so real HTML with attributes
  // (<input type="text">) is not mistaken for a template placeholder.
  const textOutsideCode = lines
    .filter((line) => !line.inFence)
    .map((line) => line.text)
    .join('\n');
  if (/\bTODO\b|\bFIXME\b|<\s*(?:input|describe|placeholder)[^>=]*>/i.test(textOutsideCode)) {
    findings.push({
      criterion: 'Placeholders',
      severity: 'moderate',
      message: l10n.t('Template placeholder (TODO / FIXME / <describe ...>) found in the body.'),
      suggestion: l10n.t('Replace placeholders with skill-specific guidance.'),
    });
  }

  for (const title of bodyEvidence.emptyExampleHeadings) {
    findings.push({
      criterion: 'Examples',
      severity: 'moderate',
      message: l10n.t('Section "{0}" has no content.', title),
      suggestion: l10n.t('Add a representative input and expected outcome.'),
    });
  }

  for (const section of sections) {
    if (!section.hasContent && !bodyEvidence.emptyExampleHeadings.includes(section.title)) {
      findings.push({
        criterion: 'Empty section',
        severity: 'minor',
        message: l10n.t('Section "{0}" has no content.', section.title),
        suggestion: l10n.t('Fill the section in or remove the heading.'),
      });
    }
  }

  if (
    !bodyEvidence.hasExampleEvidence &&
    (bodyEvidence.emptyExampleHeadings.length === 0 ||
      bodyEvidence.nonConcreteExampleHeadings.length > 0)
  ) {
    findings.push({
      criterion: 'Examples',
      severity: 'minor',
      message: l10n.t('Body has no concrete example evidence.'),
      suggestion: l10n.t('Add a representative input and expected outcome.'),
    });
  }

  const duplicates = findDuplicateTitles(sections);
  if (duplicates.length > 0) {
    findings.push({
      criterion: 'Duplicate sections',
      severity: 'minor',
      message:
        duplicates.length > 1
          ? l10n.t('Duplicate section headings: {0}.', duplicates.join(', '))
          : l10n.t('Duplicate section heading: {0}.', duplicates.join(', ')),
      suggestion: l10n.t('Merge duplicate sections so instructions are stated once.'),
    });
  }

  if (bodyLines > MAX_BODY_LINES) {
    findings.push({
      criterion: 'Length',
      severity: 'moderate',
      message: l10n.t('Body exceeds {0} lines, creating a maintainability risk.', MAX_BODY_LINES),
      suggestion: l10n.t('Move detailed material into referenced resource files.'),
    });
  }

  if (hasExcessiveRepetition(lines)) {
    findings.push({
      criterion: 'Repetitive instructions',
      severity: 'moderate',
      message: l10n.t('At least 25% of the substantive content lines repeat earlier instructions.'),
      suggestion: l10n.t(
        'Consolidate repeated steps or move repeated detail into a referenced resource.',
      ),
    });
  }

  return findings;
}

function assessResources(resources: readonly SkillResource[]): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];
  for (const resource of resources) {
    if (!resource.referenced) {
      const isScript = resource.category === 'scripts';
      findings.push({
        criterion: isScript ? 'Undocumented script' : 'Unreferenced resource',
        severity: isScript ? 'moderate' : 'minor',
        message: isScript
          ? l10n.t(
              '{0} is a bundled script that SKILL.md never references or explains.',
              resource.relativePath,
            )
          : l10n.t('{0} is not referenced from SKILL.md.', resource.relativePath),
        suggestion: isScript
          ? l10n.t('Document when the agent should run the script and what it does.')
          : l10n.t('Link it from surrounding explanatory text, or remove it.'),
      });
    }
    if (resource.sizeBytes > LARGE_RESOURCE_BYTES) {
      findings.push({
        criterion: 'Large resource',
        severity: 'minor',
        message: l10n.t('{0} exceeds 1 MiB.', resource.relativePath),
        suggestion: l10n.t('Reduce the file, or document why the large resource is needed.'),
      });
    }
  }
  return findings;
}

interface ScannedLine {
  text: string;
  /** Inside a ``` / ~~~ fenced code block (delimiters count as inside). */
  inFence: boolean;
  /** Inside a fence whose info string names a command/script language. */
  inCommandFence: boolean;
  /** Opening or closing fence delimiter rather than fence content. */
  isFenceDelimiter: boolean;
  /** ATX heading OUTSIDE fenced code; `#` lines inside code are content. */
  isHeading: boolean;
  headingTitle?: string;
  headingDepth?: number;
}

interface FenceState {
  marker: '`' | '~';
  length: number;
  lineIndex: number;
  /** The fence carries commands the agent is meant to run, not sample text. */
  isCommand: boolean;
}

interface LineScanResult {
  lines: ScannedLine[];
  openFence: FenceState | null;
}

/** Single pass that tags each line and preserves an opening fence at EOF. */
function scanLines(body: string): LineScanResult {
  const result: ScannedLine[] = [];
  let fence: FenceState | null = null;
  const bodyLines = body.split('\n');
  for (let lineIndex = 0; lineIndex < bodyLines.length; lineIndex++) {
    const text = bodyLines[lineIndex];
    if (fence === null) {
      const opening = parseOpeningFence(text, lineIndex);
      if (opening) {
        fence = opening;
        result.push({
          text,
          inFence: true,
          inCommandFence: false,
          isFenceDelimiter: true,
          isHeading: false,
        });
        continue;
      }
    } else if (isClosingFence(text, fence)) {
      result.push({
        text,
        inFence: true,
        inCommandFence: false,
        isFenceDelimiter: true,
        isHeading: false,
      });
      fence = null;
      continue;
    }
    const heading = fence !== null ? null : /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(text);
    result.push({
      text,
      inFence: fence !== null,
      inCommandFence: fence?.isCommand ?? false,
      isFenceDelimiter: false,
      isHeading: Boolean(heading),
      ...(heading ? { headingTitle: heading[2], headingDepth: heading[1].length } : {}),
    });
  }
  return { lines: result, openFence: fence };
}

/**
 * Info strings that mark a fence as runnable commands or code rather than
 * sample text/output. A `text`/unlabeled fence stays non-substantive so
 * arbitrary fenced prose cannot satisfy the instruction check.
 */
const COMMAND_FENCE_LANGUAGES = new Set([
  'bash',
  'sh',
  'shell',
  'zsh',
  'fish',
  'console',
  'terminal',
  'powershell',
  'pwsh',
  'bat',
  'cmd',
  'python',
  'py',
  'javascript',
  'js',
  'typescript',
  'ts',
  'node',
  'ruby',
  'rb',
  'perl',
  'php',
  'sql',
]);

function parseOpeningFence(text: string, lineIndex: number): FenceState | null {
  // Container-relative indentation is unavailable here, so preserve support for
  // fences nested in Markdown list items while enforcing marker compatibility.
  const match = /^\s*(`{3,}|~{3,})(.*)$/.exec(text);
  if (!match || (match[1][0] === '`' && match[2].includes('`'))) return null;
  const language = match[2].trim().split(/\s+/)[0]?.toLowerCase() ?? '';
  return {
    marker: match[1][0] as FenceState['marker'],
    length: match[1].length,
    lineIndex,
    isCommand: COMMAND_FENCE_LANGUAGES.has(language),
  };
}

function isClosingFence(text: string, fence: FenceState): boolean {
  const match = /^\s*(`+|~+)[ \t]*$/.exec(text);
  return Boolean(match && match[1][0] === fence.marker && match[1].length >= fence.length);
}

function hasSubstantiveInstructions(
  lines: readonly ScannedLine[],
  dictionaries: HeuristicDictionaries,
): boolean {
  const content = lines.filter(
    (line) =>
      !line.isHeading &&
      !line.isFenceDelimiter &&
      line.text.trim().length > 0 &&
      !isPurePlaceholder(line.text),
  );
  const proseWords = content
    .filter((line) => !line.inFence)
    .flatMap((line) => line.text.match(/[\p{L}\p{N}][\p{L}\p{N}'’_-]*/gu) ?? []).length;
  if (proseWords >= MIN_SUBSTANTIVE_WORDS) return true;

  const verbForms = buildVerbForms(dictionaries.actionVerbs, dictionaries.actionVerbForms).forms;
  const concreteSteps = content.reduce((count, line) => {
    // A fenced command is itself a concrete instruction — a command-centric
    // body keeps its substance inside bash/python/... blocks. Unlabeled and
    // `text` fences stay non-substantive.
    if (line.inFence) return count + (line.inCommandFence ? 1 : 0);
    if (/^\s*(?:[-+*]|\d+[.)])\s+\S/.test(line.text)) return count + 1;
    const actionCount = (line.text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? []).filter((word) =>
      verbForms.has(word),
    ).length;
    const negativeInstruction = /^\s*(?:do not|don't|never)\b/i.test(line.text) ? 1 : 0;
    return count + Math.max(actionCount, negativeInstruction);
  }, 0);
  return concreteSteps >= MIN_CONCRETE_STEPS;
}

function isPurePlaceholder(text: string): boolean {
  const content = text
    .trim()
    .replace(/^(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/^(?:\/\/|#|<!--)\s*/, '')
    .replace(/\s*-->$/, '')
    .trim();
  return (
    /^(?:TODO|FIXME|TBD)\b.*$/i.test(content) ||
    /^<\s*(?:input|describe|placeholder)[^>=]*>\s*[.!?]?$/i.test(content)
  );
}

function hasExcessiveRepetition(lines: readonly ScannedLine[]): boolean {
  const contentLines = lines.filter(
    (line) => !line.isFenceDelimiter && line.text.trim().length > 0 && !isTableDelimiter(line.text),
  );
  if (contentLines.length < MIN_REPETITION_LINES) return false;

  const normalized = contentLines
    .map((line) => normalizeComparisonLine(line.text))
    .filter((line) => line.length >= MIN_REPEATED_LINE_LENGTH);
  if (normalized.length === 0) return false;

  const seen = new Set<string>();
  let repeats = 0;
  for (const line of normalized) {
    if (seen.has(line)) repeats += 1;
    else seen.add(line);
  }
  return repeats / normalized.length >= REPETITION_THRESHOLD;
}

function normalizeComparisonLine(text: string): string {
  return text
    .trim()
    .toLowerCase()
    .replace(/^#{1,6}\s*/, '')
    .replace(/^(?:[-+*]|\d+[.)])\s+/, '')
    .replace(/\b\d+\b/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim();
}

function isTableDelimiter(text: string): boolean {
  return /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(text);
}

interface BodySection {
  title: string;
  depth: number;
  /** True when the section has direct content or an introducing subsection. */
  hasContent: boolean;
}

/**
 * A section counts as empty only when no content (prose OR code) appears
 * before the next heading of the SAME or SHALLOWER depth — a parent heading
 * whose content lives in subsections is not empty.
 */
function parseSections(lines: ScannedLine[]): BodySection[] {
  const sections: BodySection[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.isHeading || line.headingTitle === undefined) continue;
    const depth = line.headingDepth ?? 1;
    let hasContent = false;
    for (let j = i + 1; j < lines.length; j++) {
      const next = lines[j];
      if (next.isHeading) {
        hasContent = (next.headingDepth ?? 1) > depth; // subsection carries the content
        break;
      }
      if (next.text.trim().length > 0) {
        hasContent = true;
        break;
      }
    }
    sections.push({ title: line.headingTitle, depth, hasContent });
  }
  return sections;
}

function findDuplicateTitles(sections: BodySection[]): string[] {
  const seen = new Map<string, number>();
  for (const section of sections) {
    const key = section.title.toLowerCase();
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([title]) => `"${title}"`);
}
