import { measureBodyTokenUsage } from '../analysis/tokenUsage';
import { DiagnosticCode } from '../types/DiagnosticCode';
import type { SkillDocument } from '../types/SkillDocument';
import type { AnalyzedSkillTokenUsage, TokenUsageGroup } from '../types/SkillTokenUsage';
import { hasResourceTokenUsage } from '../types/SkillTokenUsage';
import type { SkillDiagnostic, SkillDiagnosticSeverity } from '../types/SkillDiagnostic';
import { bodyTopRange, diag } from './util';

const BODY_TOKEN_WARNING = 5_000;
const BODY_LINE_WARNING = 500;
const REFERENCE_FILE_WARNING = 10_000;
const REFERENCE_FILE_ERROR = 25_000;
const REFERENCES_TOTAL_WARNING = 25_000;
const REFERENCES_TOTAL_ERROR = 50_000;
const OTHER_FILES_TOTAL_WARNING = 25_000;
const OTHER_FILES_TOTAL_ERROR = 100_000;

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
    const threshold = highestThreshold(entry.tokens, REFERENCE_FILE_WARNING, REFERENCE_FILE_ERROR);
    if (threshold) {
      diagnostics.push(
        diag(
          DiagnosticCode.ReferenceFileTokenLimit,
          threshold.severity,
          `Reference file ${JSON.stringify(entry.relativePath)} has ${format(entry.tokens)} o200k_base tokens, exceeding the ${format(threshold.limit)}-token limit.`,
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
    REFERENCES_TOTAL_ERROR,
    range,
  );
  addAggregateDiagnostic(
    diagnostics,
    usage.otherFiles,
    DiagnosticCode.OtherFilesTokenLimit,
    'Non-standard files outside `SKILL.md`, `references/`, `scripts/`, and `assets/`',
    OTHER_FILES_TOTAL_WARNING,
    OTHER_FILES_TOTAL_ERROR,
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
  error: number,
  range: ReturnType<typeof bodyTopRange>,
): void {
  const threshold = highestThreshold(group.totalTokens, warning, error);
  if (!threshold) return;
  diagnostics.push(
    diag(
      code,
      threshold.severity,
      `${label} total ${format(group.totalTokens)} o200k_base tokens, exceeding the combined ${format(threshold.limit)}-token limit.`,
      range,
    ),
  );
}

function highestThreshold(
  value: number,
  warning: number,
  error: number,
): { severity: SkillDiagnosticSeverity; limit: number } | undefined {
  if (value > error) return { severity: 'error', limit: error };
  if (value > warning) return { severity: 'warning', limit: warning };
  return undefined;
}

function format(value: number): string {
  return value.toLocaleString('en-US');
}
