import { measureBodyTokenUsage } from '../analysis/tokenUsage';
import { DiagnosticCode } from '../types/DiagnosticCode';
import type { SkillDocument } from '../types/SkillDocument';
import type { AnalyzedSkillTokenUsage, TokenUsageGroup } from '../types/SkillTokenUsage';
import { hasResourceTokenUsage } from '../types/SkillTokenUsage';
import type { SkillDiagnostic } from '../types/SkillDiagnostic';
import { bodyTopRange, diag } from './util';

// The body numbers are the published Agent Skills guidance (under 5k tokens /
// 500 lines). The resource thresholds below are this tool's advisory numbers:
// the spec sets NO limit on bundled resources — they load on demand — so
// resource findings are never errors and their messages say the threshold is
// advisory rather than claiming an official limit.
const BODY_TOKEN_WARNING = 5_000;
const BODY_LINE_WARNING = 500;
const REFERENCE_FILE_WARNING = 10_000;
const REFERENCES_TOTAL_WARNING = 25_000;
const OTHER_FILES_TOTAL_WARNING = 25_000;

export function validateTokenBudgets(
  doc: SkillDocument,
  usage: AnalyzedSkillTokenUsage = measureBodyTokenUsage(doc.body),
): SkillDiagnostic[] {
  const diagnostics: SkillDiagnostic[] = [];
  const range = bodyTopRange(doc);

  if (usage.body.tokens > BODY_TOKEN_WARNING) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodyTokenLimit,
        'warning',
        `SKILL.md body has ${format(usage.body.tokens)} o200k_base tokens, exceeding the ${format(BODY_TOKEN_WARNING)}-token limit.`,
        range,
      ),
    );
  }
  if (usage.body.lines > BODY_LINE_WARNING) {
    diagnostics.push(
      diag(
        DiagnosticCode.BodyLineLimit,
        'warning',
        `SKILL.md body has ${format(usage.body.lines)} lines, exceeding the ${format(BODY_LINE_WARNING)}-line limit.`,
        range,
      ),
    );
  }

  if (!hasResourceTokenUsage(usage)) {
    return diagnostics;
  }

  for (const entry of usage.references.files) {
    if (entry.tokens > REFERENCE_FILE_WARNING) {
      diagnostics.push(
        diag(
          DiagnosticCode.ReferenceFileTokenLimit,
          'warning',
          `Reference file ${JSON.stringify(entry.relativePath)} has ${format(entry.tokens)} o200k_base tokens (advisory threshold: ${format(REFERENCE_FILE_WARNING)}). The Agent Skills spec sets no limit on bundled resources, but a file this large costs significant context whenever the agent reads it.`,
          range,
        ),
      );
    }
  }

  addAggregateDiagnostic(
    diagnostics,
    usage.references,
    DiagnosticCode.ReferencesTokenLimit,
    '`references/` files',
    REFERENCES_TOTAL_WARNING,
    range,
  );
  addAggregateDiagnostic(
    diagnostics,
    usage.otherFiles,
    DiagnosticCode.OtherFilesTokenLimit,
    'Text files outside `SKILL.md`, `references/`, `scripts/`, and `assets/`',
    OTHER_FILES_TOTAL_WARNING,
    range,
  );
  return diagnostics;
}

function addAggregateDiagnostic(
  diagnostics: SkillDiagnostic[],
  group: TokenUsageGroup,
  code: string,
  label: string,
  warning: number,
  range: ReturnType<typeof bodyTopRange>,
): void {
  if (group.totalTokens <= warning) return;
  diagnostics.push(
    diag(
      code,
      'warning',
      `${label} total ${format(group.totalTokens)} o200k_base tokens (advisory threshold: ${format(warning)}). Bundled resources load on demand and have no spec limit; consider splitting very large files so the agent can read only what it needs.`,
      range,
    ),
  );
}

function format(value: number): string {
  return value.toLocaleString('en-US');
}
