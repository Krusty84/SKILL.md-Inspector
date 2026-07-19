import { describe, expect, it } from 'vitest';
import { parseSkillFile } from '../src/parser/parseSkillFile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import type { SkillTokenUsage } from '../src/types/SkillTokenUsage';
import { validateTokenBudgets } from '../src/validation/validateTokenBudgets';

const document = parseSkillFile(
  '/skills/example/SKILL.md',
  '---\nname: example\ndescription: Analyze content. Use when needed. Do not use otherwise.\n---\nbody',
);

describe('token-budget threshold policy', () => {
  it('uses strict body token and line boundaries', () => {
    expect(codes(metrics({ bodyTokens: 5_000, bodyLines: 500 }))).toEqual([]);
    expect(codes(metrics({ bodyTokens: 5_001, bodyLines: 500 }))).toEqual([
      DiagnosticCode.BodyTokenLimit,
    ]);
    expect(codes(metrics({ bodyTokens: 5_000, bodyLines: 501 }))).toEqual([
      DiagnosticCode.BodyLineLimit,
    ]);
    expect(codes(metrics({ bodyTokens: 5_001, bodyLines: 501 }))).toEqual([
      DiagnosticCode.BodyTokenLimit,
      DiagnosticCode.BodyLineLimit,
    ]);
    expect(
      validateTokenBudgets(document, metrics({ bodyTokens: 1_000_000 })).find(
        (diagnostic) => diagnostic.code === DiagnosticCode.BodyTokenLimit,
      )?.severity,
    ).toBe('warning');
  });

  it('uses strict per-reference boundaries and replaces warnings with errors', () => {
    expect(referenceDiagnostic(10_000)).toBeUndefined();
    expect(referenceDiagnostic(10_001)).toMatchObject({ severity: 'warning' });
    expect(referenceDiagnostic(25_000)).toMatchObject({ severity: 'warning' });
    const aboveError = validateTokenBudgets(
      document,
      metrics({ referenceFiles: [{ relativePath: 'references/guide.md', tokens: 25_001 }] }),
    ).filter((diagnostic) => diagnostic.code === DiagnosticCode.ReferenceFileTokenLimit);
    expect(aboveError).toHaveLength(1);
    expect(aboveError[0]).toMatchObject({ severity: 'error' });
    expect(aboveError[0]?.message).toContain('references/guide.md');
    expect(aboveError[0]?.message).toContain('25,001');
    expect(aboveError[0]?.message).toContain('25,000');
  });

  it('uses strict aggregate-reference boundaries', () => {
    expect(aggregateDiagnostic('references', 25_000)).toBeUndefined();
    expect(aggregateDiagnostic('references', 25_001)).toMatchObject({ severity: 'warning' });
    expect(aggregateDiagnostic('references', 50_000)).toMatchObject({ severity: 'warning' });
    expect(aggregateDiagnostic('references', 50_001)).toMatchObject({ severity: 'error' });
  });

  it('uses strict aggregate non-standard-file boundaries', () => {
    expect(aggregateDiagnostic('otherFiles', 25_000)).toBeUndefined();
    expect(aggregateDiagnostic('otherFiles', 25_001)).toMatchObject({ severity: 'warning' });
    expect(aggregateDiagnostic('otherFiles', 100_000)).toMatchObject({ severity: 'warning' });
    expect(aggregateDiagnostic('otherFiles', 100_001)).toMatchObject({ severity: 'error' });
  });
});

function metrics(
  values: {
    bodyTokens?: number;
    bodyLines?: number;
    referenceFiles?: SkillTokenUsage['references']['files'];
    referenceTotal?: number;
    otherTotal?: number;
  } = {},
): SkillTokenUsage {
  const referenceFiles = values.referenceFiles ?? [];
  return {
    encoding: 'o200k_base',
    body: { tokens: values.bodyTokens ?? 0, lines: values.bodyLines ?? 0 },
    references: {
      files: referenceFiles,
      totalTokens:
        values.referenceTotal ?? referenceFiles.reduce((total, entry) => total + entry.tokens, 0),
    },
    otherFiles: { files: [], totalTokens: values.otherTotal ?? 0 },
  };
}

function codes(usage: SkillTokenUsage): string[] {
  return validateTokenBudgets(document, usage).map((diagnostic) => diagnostic.code);
}

function referenceDiagnostic(tokens: number) {
  return validateTokenBudgets(
    document,
    metrics({ referenceFiles: [{ relativePath: 'references/guide.md', tokens }] }),
  ).find((diagnostic) => diagnostic.code === DiagnosticCode.ReferenceFileTokenLimit);
}

function aggregateDiagnostic(group: 'references' | 'otherFiles', totalTokens: number) {
  const usage =
    group === 'references'
      ? metrics({ referenceTotal: totalTokens })
      : metrics({ otherTotal: totalTokens });
  const code =
    group === 'references'
      ? DiagnosticCode.ReferencesTokenLimit
      : DiagnosticCode.OtherFilesTokenLimit;
  return validateTokenBudgets(document, usage).find((diagnostic) => diagnostic.code === code);
}
