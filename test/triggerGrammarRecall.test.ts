/**
 * Regression suite for plan 7 Part D
 * (docs/remediation/plan-7-concrete-defects.md): the trigger grammar has to
 * recognize the phrasings production skills actually use, without giving back
 * the precision plan 5 bought.
 */
import { describe, expect, it } from 'vitest';
import {
  analyzeDescription,
  analyzeOverbroadTrigger,
  assessScopeClause,
} from '../src/quality/descriptionHeuristics';
import { computeStaticDescriptionQuality } from '../src/quality/staticDescriptionQuality';

/**
 * Verbatim `description` of the shipped `xlsx` skill, and its opening sentence
 * on its own. The full text also says "Trigger especially when the user
 * references a spreadsheet file", which the old grammar did recognize; the
 * opening `any time` clause — the skill's primary trigger statement — it did
 * not (plan 7 Part D).
 */
const XLSX_DESCRIPTION =
  'Use this skill any time a spreadsheet file is the primary input or output. This means any task where the user wants to: open, read, edit, or fix an existing .xlsx, .xlsm, .xltx, .csv, or .tsv file (e.g., adding columns, computing formulas, formatting, charting, cleaning messy data); create a new spreadsheet from scratch or from other data sources; or convert between tabular file formats. Trigger especially when the user references a spreadsheet file by name or path \u2014 even casually (like "the xlsx in my downloads") \u2014 and wants something done to it or produced from it. Also trigger for cleaning or restructuring messy tabular data files (malformed rows, misplaced headers, junk data) into proper spreadsheets. The deliverable must be a spreadsheet file. Do NOT trigger when the primary deliverable is a Word document, HTML report, standalone Python script, database pipeline, or Google Sheets API integration, even if tabular data is involved.';

const XLSX_OPENING_SENTENCE =
  'Use this skill any time a spreadsheet file is the primary input or output.';

describe('trigger grammar recognizes real usage phrasings', () => {
  it.each([
    'Use this skill when the user edits a spreadsheet.',
    'Use this skill whenever the user edits a spreadsheet.',
    'Use this skill any time a spreadsheet is the input.',
    'Use this skill anytime a spreadsheet is the input.',
    'Use this skill in cases where the user edits a spreadsheet.',
    'Use this skill in case where a spreadsheet is involved.',
    'Use this skill wherever a spreadsheet is involved.',
    'Reach for this skill when the user edits a spreadsheet.',
    'Consult this skill when the user edits a spreadsheet.',
    'Refer to this skill when the user edits a spreadsheet.',
  ])('finds a trigger in: %s', (description) => {
    expect(assessScopeClause(description, 'trigger').contentFound).toBe(true);
  });

  it('leaves bare "on" unrecognized', () => {
    // Deliberate: bare `on` would fire on "Operates on large files". Only the
    // narrower `on any` is a scope conjunction.
    expect(
      assessScopeClause('Trigger on spreadsheet editing requests.', 'trigger').markerFound,
    ).toBe(false);
    expect(assessScopeClause('Use on any spreadsheet workbook.', 'trigger').contentFound).toBe(
      true,
    );
  });
});

describe('precision guards still hold', () => {
  it.each([
    'Runs for 10 minutes on large files.',
    'Applies fixes if the linter reports an error.',
    'The tool crashes when the user provides malformed frames.',
    'Should not be used when the input is encrypted.',
    'Operates on large binary files.',
    'Cleans stale build caches from CI runners. Runs for 10 minutes on large repos.',
  ])('earns no trigger for: %s', (description) => {
    expect(assessScopeClause(description, 'trigger').contentFound).toBe(false);
  });
});

describe('overbroad detection follows the widened lead-in', () => {
  it('flags an overbroad claim introduced by a newly recognized lead-in', () => {
    // Widening the usage-context family widens overbroad detection too, which is
    // correct: an overbroad claim is overbroad however it is introduced.
    expect(
      analyzeOverbroadTrigger('Reach for this skill for anything involving spreadsheets.').found,
    ).toBe(true);
    expect(
      computeStaticDescriptionQuality(
        'Format spreadsheet workbooks. Reach for this skill for anything involving spreadsheets.',
      ).gradeLimitations.map((limitation) => limitation.code),
    ).toContain('overbroad-usage-scope');
  });

  it('does not flag an ordinary sentence that merely mentions the phrase', () => {
    expect(analyzeOverbroadTrigger('Formats anything in the report directory.').found).toBe(false);
  });
});

describe('the shipped xlsx description earns its trigger', () => {
  it('reads the opening "any time" sentence as a usage trigger on its own', () => {
    expect(assessScopeClause(XLSX_OPENING_SENTENCE, 'trigger').contentFound).toBe(true);
    const opening = computeStaticDescriptionQuality(XLSX_OPENING_SENTENCE);
    expect(opening.gradeLimitations.map((limitation) => limitation.code)).not.toContain(
      'missing-usage-trigger',
    );
  });

  it('scores the verbatim description without a missing-trigger ceiling', () => {
    const result = computeStaticDescriptionQuality(XLSX_DESCRIPTION);
    expect(analyzeDescription(XLSX_DESCRIPTION).triggerClause.contentFound).toBe(true);
    expect(result.gradeLimitations.map((limitation) => limitation.code)).not.toContain(
      'missing-usage-trigger',
    );
  });
});
