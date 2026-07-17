import type { SkillDocument, SkillResource } from '../types/SkillDocument';

export type AuthoringLabel = 'excellent' | 'good' | 'acceptable' | 'weak' | 'poor';

export type AuthoringSeverity = 'major' | 'moderate' | 'minor';

export interface AuthoringFinding {
  criterion: string;
  severity: AuthoringSeverity;
  message: string;
  suggestion: string;
}

export interface InstructionQualityResult {
  score: number;
  label: AuthoringLabel;
  findings: AuthoringFinding[];
}

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
  major: 80,
  moderate: 20,
  minor: 10,
};

const MAX_BODY_LINES = 500;
const LARGE_RESOURCE_BYTES = 1024 * 1024;

/**
 * Deterministic authoring checks run on full save / report generation; never
 * used by text-only validation. These are structural hygiene checks — they do
 * not judge whether the instructions are *correct*, only whether the body and
 * bundled resources have obvious authoring defects.
 */
export function assessAuthoringQuality(doc: SkillDocument): SkillAuthoringQuality {
  const instructionFindings = assessInstructions(doc.body);
  const resourceFindings = assessResources(doc.resources);
  return {
    instructions: toResult(instructionFindings),
    resources: toResult(resourceFindings),
  };
}

function toResult(findings: AuthoringFinding[]): InstructionQualityResult {
  // Repeated housekeeping findings are grouped by severity, with a cap per class.
  const penalties = new Map<AuthoringSeverity, number>();
  for (const finding of findings) {
    const cap = finding.severity === 'minor' ? 30 : finding.severity === 'moderate' ? 50 : 80;
    penalties.set(finding.severity, Math.min(cap, (penalties.get(finding.severity) ?? 0) + SEVERITY_PENALTY[finding.severity]));
  }
  const score = Math.max(0, 100 - [...penalties.values()].reduce((sum, value) => sum + value, 0));
  return { score, label: authoringLabelFor(score), findings };
}

function authoringLabelFor(score: number): AuthoringLabel {
  if (score >= 90) return 'excellent';
  if (score >= 75) return 'good';
  if (score >= 60) return 'acceptable';
  if (score >= 30) return 'weak';
  return 'poor';
}

function assessInstructions(body: string): AuthoringFinding[] {
  const findings: AuthoringFinding[] = [];

  if (body.trim().length === 0) {
    findings.push({
      criterion: 'Substantive body',
      severity: 'major',
      message: 'Instruction body is empty.',
      suggestion: 'Write the instructions the agent should follow after the skill triggers.',
    });
    return findings; // every other body check is meaningless on an empty body
  }

  const lines = scanLines(body);
  const sections = parseSections(lines);
  const hasProse = lines.some((line) => !line.isHeading && line.text.trim().length > 0);

  if (!hasProse) {
    findings.push({
      criterion: 'Substantive body',
      severity: 'major',
      message: 'Body contains headings only, with no instruction content.',
      suggestion: 'Add concrete instructions under the headings.',
    });
  }

  const proseOutsideCode = lines
    .filter((line) => !line.inFence && !line.isHeading)
    .map((line) => line.text)
    .join('\n');
  if (/\bTODO\b|\bFIXME\b|<\s*(?:input|describe|placeholder)[^>]*>/i.test(proseOutsideCode)) {
    findings.push({
      criterion: 'Placeholders',
      severity: 'moderate',
      message: 'Template placeholder (TODO / FIXME / <describe ...>) found in the body.',
      suggestion: 'Replace placeholders with skill-specific guidance.',
    });
  }

  for (const section of sections) {
    if (!section.hasContent) {
      const isExamples = /^examples?$/i.test(section.title);
      findings.push({
        criterion: isExamples ? 'Examples' : 'Empty section',
        severity: isExamples ? 'moderate' : 'minor',
        message: `Section "${section.title}" has no content.`,
        suggestion: isExamples
          ? 'Add a representative input and expected outcome.'
          : 'Fill the section in or remove the heading.',
      });
    }
  }

  const duplicates = findDuplicateTitles(sections);
  if (duplicates.length > 0) {
    findings.push({
      criterion: 'Duplicate sections',
      severity: 'minor',
      message: `Duplicate section heading${duplicates.length > 1 ? 's' : ''}: ${duplicates.join(', ')}.`,
      suggestion: 'Merge duplicate sections so instructions are stated once.',
    });
  }

  if (lines.length > MAX_BODY_LINES) {
    findings.push({
      criterion: 'Length',
      severity: 'moderate',
      message: `Body exceeds ${MAX_BODY_LINES} lines, creating a maintainability risk.`,
      suggestion: 'Move detailed material into referenced resource files.',
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
          ? `${resource.relativePath} is a bundled script that SKILL.md never references or explains.`
          : `${resource.relativePath} is not referenced from SKILL.md.`,
        suggestion: isScript
          ? 'Document when the agent should run the script and what it does.'
          : 'Link it from surrounding explanatory text, or remove it.',
      });
    }
    if (resource.sizeBytes > LARGE_RESOURCE_BYTES) {
      findings.push({
        criterion: 'Large resource',
        severity: 'minor',
        message: `${resource.relativePath} exceeds 1 MiB.`,
        suggestion: 'Reduce the file, or document why the large resource is needed.',
      });
    }
  }
  return findings;
}

interface ScannedLine {
  text: string;
  /** Inside a ``` / ~~~ fenced code block (delimiters count as inside). */
  inFence: boolean;
  /** ATX heading OUTSIDE fenced code; `#` lines inside code are content. */
  isHeading: boolean;
  headingTitle?: string;
  headingDepth?: number;
}

/** Single pass that tags each line with fence state and heading info. */
function scanLines(body: string): ScannedLine[] {
  const result: ScannedLine[] = [];
  let inFence = false;
  for (const text of body.split('\n')) {
    const isDelimiter = /^\s*(```|~~~)/.test(text);
    if (isDelimiter && !inFence) {
      inFence = true;
      result.push({ text, inFence: true, isHeading: false });
      continue;
    }
    if (isDelimiter && inFence) {
      result.push({ text, inFence: true, isHeading: false });
      inFence = false;
      continue;
    }
    const heading = inFence ? null : /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/.exec(text);
    result.push({
      text,
      inFence,
      isHeading: Boolean(heading),
      ...(heading ? { headingTitle: heading[2], headingDepth: heading[1].length } : {}),
    });
  }
  return result;
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
