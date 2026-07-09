import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { parseSkillFile, withResources } from '../src/parser/parseSkillFile';
import { discoverResources } from '../src/parser/discoverResources';
import { runAllValidations } from '../src/validation';
import { genericProfile } from '../src/profiles/genericProfile';
import { DiagnosticCode } from '../src/types/DiagnosticCode';

const VALID_SKILL = `---
name: pdf-report-formatter
description: Format technical PDF reports using company layout rules. Use when asked to clean up, standardize, or prepare inspection reports, equipment manuals, or engineering reports. Do not use for legal contracts or general writing.
---

# PDF Report Formatter

## When to use

Use this skill when the user needs to format, standardize, or clean up technical PDF reports.

## Workflow

1. Inspect the input document.

## Examples

Given a raw report, return a formatted report.

## Constraints

Do not invent measurements.

## References

See [company report style guide](./references/report-style-guide.md).
`;

const INVALID_SKILL = `---
name: PDF Helper
description: Helps with documents.
---

# Helper

This is useful for many things.
`;

let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-inspector-'));
});

afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
});

function analyze(content: string) {
  const doc = withResources(parseSkillFile(path.join(dir, 'SKILL.md'), content), discoverResources(dir));
  return runAllValidations(doc, genericProfile);
}

describe('end-to-end validation pipeline', () => {
  it('produces no errors for a well-formed skill (brief §22)', () => {
    fs.mkdirSync(path.join(dir, 'references'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'references', 'report-style-guide.md'), '# Guide');

    const errors = analyze(VALID_SKILL).filter((d) => d.severity === 'error');
    expect(errors).toEqual([]);
  });

  it('produces the expected diagnostics for the invalid example (brief §23)', () => {
    const codes = analyze(INVALID_SKILL).map((d) => d.code);
    expect(codes).toContain(DiagnosticCode.NameFormat);
    expect(codes).toContain(DiagnosticCode.DescriptionTooShort);
    expect(codes).toContain(DiagnosticCode.DescriptionVague);
    expect(codes).toContain(DiagnosticCode.DescriptionNoVerb);
    expect(codes).toContain(DiagnosticCode.DescriptionNoTrigger);
    expect(codes).toContain(DiagnosticCode.BodyNoExamples);
    expect(codes).toContain(DiagnosticCode.BodyNoWhenToUse);
  });
});
