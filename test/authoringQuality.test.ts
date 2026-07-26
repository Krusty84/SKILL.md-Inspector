import { describe, it, expect } from 'vitest';
import { assessAuthoringQuality } from '../src/authoring/authoringQuality';
import type { SkillDocument, SkillResource } from '../src/types/SkillDocument';

const doc = (body: string, resources: SkillResource[] = []): SkillDocument => ({
  uri: 'file:///skills/example/SKILL.md',
  directory: '/skills/example',
  fileName: 'SKILL.md',
  frontmatter: { name: 'example', description: 'Example skill.' },
  frontmatterRaw: 'name: example',
  body,
  bodyStartLine: 4,
  links: [],
  resources,
  parseErrors: [],
});

const resource = (overrides: Partial<SkillResource>): SkillResource => ({
  relativePath: 'references/notes.md',
  absolutePath: '/skills/example/references/notes.md',
  category: 'references',
  sizeBytes: 512,
  referenced: true,
  ...overrides,
});

const GOOD_BODY = [
  '# Example skill',
  '',
  'Follow these steps to format the report:',
  '',
  '1. Inspect the source notes.',
  '2. Format the report sections.',
  '3. Verify the final document.',
  '',
  '## Examples',
  '',
  'Input: raw notes. Output: formatted report.',
].join('\n');

describe('assessAuthoringQuality instructions', () => {
  it('labels a substantive body with no findings as clean at score 100', () => {
    const result = assessAuthoringQuality(doc(GOOD_BODY));
    expect(result.instructions.score).toBe(100);
    expect(result.instructions.label).toBe('clean');
    expect(result.instructions.findings).toEqual([]);
  });

  it('reports an empty body as a single major finding', () => {
    const result = assessAuthoringQuality(doc('   \n  '));
    expect(result.instructions.findings).toHaveLength(1);
    expect(result.instructions.findings[0].criterion).toBe('Substantive body');
    expect(result.instructions.findings[0].severity).toBe('major');
    expect(result.instructions.score).toBe(0);
    expect(result.instructions.label).toBe('defects');
  });

  it('flags a headings-only body as major', () => {
    const result = assessAuthoringQuality(doc('# Title\n## Steps\n## Examples'));
    const criteria = result.instructions.findings.map((f) => f.criterion);
    expect(criteria).toContain('Substantive body');
    expect(
      result.instructions.findings.find((f) => f.criterion === 'Substantive body')?.severity,
    ).toBe('major');
    expect(result.instructions.score).toBe(0);
    expect(result.instructions.label).toBe('defects');
  });

  it('flags TODO placeholders but not TODO inside code fences', () => {
    const withTodo = assessAuthoringQuality(doc('# T\n\nTODO: write this.\n'));
    expect(withTodo.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(true);

    const inCode = assessAuthoringQuality(
      doc('# T\n\nRun the linter.\n\n```js\n// TODO: sample code comment\n```\n'),
    );
    expect(inCode.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);
  });

  it('reports a fence left open at EOF and identifies its opening line', () => {
    const result = assessAuthoringQuality(
      doc(
        '# T\n\n1. Inspect the input.\n2. Run the check.\n3. Record the output.\n\n```js\nrun();\n',
      ),
    );
    const finding = result.instructions.findings.find(
      (item) => item.criterion === 'Unclosed code fence',
    );
    expect(finding?.severity).toBe('major');
    expect(finding?.message).toContain('line 11');
    expect(finding?.suggestion).toContain('```');
  });

  it('does not close a four-backtick fence with three backticks', () => {
    const result = assessAuthoringQuality(
      doc(
        '# T\n\n1. Inspect the input.\n2. Run the check.\n3. Record the output.\n\n````js\nrun();\n```\n',
      ),
    );
    const finding = result.instructions.findings.find(
      (item) => item.criterion === 'Unclosed code fence',
    );
    expect(finding?.suggestion).toContain('````');
  });

  it('does not close tilde and backtick fences with one another', () => {
    const result = assessAuthoringQuality(
      doc(
        '# T\n\n1. Inspect the input.\n2. Run the check.\n3. Record the output.\n\n~~~~\nvalue\n````\n',
      ),
    );
    const finding = result.instructions.findings.find(
      (item) => item.criterion === 'Unclosed code fence',
    );
    expect(finding?.suggestion).toContain('~~~~');
  });

  it('treats a mismatched fence marker inside an open fence as fence content', () => {
    // The ~~~ line must not close the backtick fence, so the TODO stays in code.
    const mixed = assessAuthoringQuality(
      doc('# T\n\nProse here.\n\n```\n~~~\nTODO: inside the fence\n```\n'),
    );
    expect(mixed.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);

    const tilde = assessAuthoringQuality(doc('# T\n\nRun it.\n\n~~~\nTODO: sample\n~~~\n'));
    expect(tilde.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);
  });

  it('flags TODO placeholders in headings', () => {
    const result = assessAuthoringQuality(
      doc('# T\n\nReal intro.\n\n## TODO: fill this in\n\nBody text.\n'),
    );
    expect(result.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(true);
  });

  it('does not mistake HTML tags with attributes for placeholders', () => {
    const html = assessAuthoringQuality(doc('# T\n\nRenders an <input type="text"> element.\n'));
    expect(html.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);

    const placeholder = assessAuthoringQuality(doc('# T\n\nWrite <input the file name> here.\n'));
    expect(placeholder.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(
      true,
    );
  });

  it('flags an Examples section with no content', () => {
    const result = assessAuthoringQuality(
      doc('# T\n\nDo the work.\n\n## Examples\n\n## Notes\n\nSome notes.'),
    );
    const examples = result.instructions.findings.find((f) => f.criterion === 'Examples');
    expect(examples?.severity).toBe('moderate');
    expect(result.instructions.findings.filter((f) => f.criterion === 'Examples')).toHaveLength(1);
  });

  it('reports missing concrete evidence for non-empty placeholder Examples prose', () => {
    const result = assessAuthoringQuality(
      doc('# T\n\nDo the work.\n\n## Examples\n\nExamples will be added later.'),
    );

    expect(result.instructions.findings).toContainEqual(
      expect.objectContaining({
        criterion: 'Examples',
        severity: 'minor',
        message: 'Body has no concrete example evidence.',
      }),
    );
  });

  it('adds one minor finding and deducts 10 when example evidence is missing', () => {
    const body = [
      '# Tool',
      '',
      'Follow these steps to process the report safely and consistently:',
      '',
      '1. Inspect the source report.',
      '2. Format every required section.',
      '3. Verify the completed report.',
      '',
      '## Workflow',
      '',
      '```bash',
      'run-tool report.md',
      '```',
    ].join('\n');
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.findings).toEqual([
      expect.objectContaining({ criterion: 'Examples', severity: 'minor' }),
    ]);
    expect(result.instructions.score).toBe(90);
  });

  it('uses the same Quick start evidence as body diagnostics', () => {
    const body = [
      '# Tool',
      '',
      'Follow these steps to process the report safely and consistently:',
      '',
      '1. Inspect the source report.',
      '2. Format every required section.',
      '3. Verify the completed report.',
      '',
      '## Quick start',
      '',
      '```bash',
      'run-tool report.md',
      '```',
    ].join('\n');
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.findings.some((f) => f.criterion === 'Examples')).toBe(false);
    expect(result.instructions.score).toBe(100);
  });

  it('flags a pointer-only body as non-substantive', () => {
    const result = assessAuthoringQuality(
      doc('# Webhook Debugger\n\nFollow the steps in the description above.'),
    );
    const finding = result.instructions.findings.find(
      (item) => item.criterion === 'Substantive instructions',
    );
    expect(finding?.severity).toBe('moderate');
  });

  it('accepts a concise three-step workflow as substantive', () => {
    const result = assessAuthoringQuality(
      doc('# Workflow\n\n1. Inspect input.\n2. Run checks.\n3. Report results.'),
    );
    expect(
      result.instructions.findings.some((item) => item.criterion === 'Substantive instructions'),
    ).toBe(false);
  });

  it('counts fenced command lines as concrete instruction steps', () => {
    // A concise command-centric skill: two numbered steps, each backed by a
    // bash command. The commands are the substance and must count.
    const result = assessAuthoringQuality(
      doc(
        [
          '# Commit Helper',
          '',
          '1. Inspect what is staged:',
          '',
          '```bash',
          'git diff --cached --stat',
          '```',
          '',
          '2. Commit with a conventional message:',
          '',
          '```bash',
          'git commit -m "feat(parser): support CRLF"',
          '```',
        ].join('\n'),
      ),
    );

    expect(result.instructions.findings).not.toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions' }),
    );
  });

  it('does not treat arbitrary fenced lines as substantive instructions', () => {
    const result = assessAuthoringQuality(
      doc('# Instructions\n\n```text\nalpha\nbeta\ngamma\n```'),
    );

    expect(result.instructions.findings).toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions' }),
    );
    expect(result.instructions.score).toBeLessThanOrEqual(80);
    expect(result.instructions.label).not.toBe('clean');
  });

  it('does not let example detection hide a fenced-only instruction body', () => {
    const result = assessAuthoringQuality(
      doc('# Instructions\n\n## Examples\n\n```text\nalpha\nbeta\ngamma\n```'),
    );

    expect(result.instructions.findings).toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions' }),
    );
    expect(result.instructions.findings.some((finding) => finding.criterion === 'Examples')).toBe(
      false,
    );
  });

  it('excludes fenced content from the substantive prose word count', () => {
    const result = assessAuthoringQuality(
      doc(
        '# Instructions\n\n```text\nThese arbitrary words fill a fenced line without documenting any workflow that an agent should follow for a request.\nMore arbitrary words make the block longer than thirty words while still providing no prose instructions outside the fence for the agent.\n```',
      ),
    );

    expect(result.instructions.findings).toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions' }),
    );
  });

  it('accepts at least 30 substantive prose words', () => {
    const result = assessAuthoringQuality(
      doc(
        [
          '# Instructions',
          '',
          'Review the supplied report carefully before editing any values, preserve the original section order, compare every changed field with the source records, and summarize the verified result for the requester after completing the final consistency check.',
        ].join('\n'),
      ),
    );

    expect(
      result.instructions.findings.some(
        (finding) => finding.criterion === 'Substantive instructions',
      ),
    ).toBe(false);
  });

  it('keeps explanatory Quick start prose substantive when followed by a fenced command', () => {
    const result = assessAuthoringQuality(
      doc(
        [
          '# Instructions',
          '',
          'Review the source report before running this command, confirm the selected path belongs to the current request, preserve the original file, inspect the generated output carefully, and report any unexpected differences to the requester.',
          '',
          '## Quick start',
          '',
          '```bash',
          'run-tool report.md',
          '```',
        ].join('\n'),
      ),
    );

    expect(result.instructions.findings).toEqual([]);
  });

  it('does not count placeholder-only fenced content as substantive', () => {
    const result = assessAuthoringQuality(
      doc(
        '# Instructions\n\n```text\nTODO: add the first step\nFIXME: add the second step\n<describe the third step>\n```',
      ),
    );

    expect(result.instructions.findings).toContainEqual(
      expect.objectContaining({ criterion: 'Substantive instructions' }),
    );
  });

  it('accepts an Examples section whose only content is a code block', () => {
    const body = '# T\n\nDo the work.\n\n## Examples\n\n```\ninput -> output\n```\n';
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.findings.some((f) => f.criterion === 'Examples')).toBe(false);
  });

  it('does not report a parent heading whose content lives in subsections as empty', () => {
    const body = '# T\n\nIntro.\n\n## Workflow\n\n### Step 1\n\nDo the step.\n';
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.findings.some((f) => f.criterion === 'Empty section')).toBe(false);
  });

  it('reports duplicate section headings', () => {
    const body = '# T\n\nIntro.\n\n## Steps\n\nOne.\n\n## Steps\n\nTwo.\n';
    const result = assessAuthoringQuality(doc(body));
    const dup = result.instructions.findings.find((f) => f.criterion === 'Duplicate sections');
    expect(dup?.severity).toBe('minor');
    expect(dup?.message).toContain('"steps"');
  });

  it('uses the strict shared 500-line boundary for the moderate length finding', () => {
    const atLimit = Array.from({ length: 500 }, (_, index) => `Instruction line ${index}.`).join(
      '\n',
    );
    const aboveLimit = `${atLimit}\nOne more instruction.`;

    expect(
      assessAuthoringQuality(doc(atLimit)).instructions.findings.some(
        (finding) => finding.criterion === 'Length',
      ),
    ).toBe(false);
    const result = assessAuthoringQuality(doc(aboveLimit));
    expect(result.instructions.findings.some((finding) => finding.criterion === 'Length')).toBe(
      true,
    );
    expect(result.instructions.score).toBeGreaterThan(0);
  });

  it('ignores repeated Markdown table separators', () => {
    const tables = Array.from(
      { length: 40 },
      (_, index) =>
        `### Result ${index + 1}\n\n| Input | Output |\n|---|---|\n| value token${(index + 10).toString(36)} | unique result token${(index + 50).toString(36)} |`,
    ).join('\n\n');
    const result = assessAuthoringQuality(doc(`# Results\n\n${tables}`));
    expect(
      result.instructions.findings.some((item) => item.criterion === 'Repetitive instructions'),
    ).toBe(false);
  });

  it('never returns a negative score', () => {
    const body = '# A\n## Examples\n## B\n## B\nTODO <describe>\n';
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.score).toBeGreaterThanOrEqual(0);
  });
});

describe('assessAuthoringQuality resources', () => {
  it('does not penalize a skill with no bundled resources', () => {
    const result = assessAuthoringQuality(doc(GOOD_BODY));
    expect(result.resources.score).toBe(100);
    expect(result.resources.label).toBe('clean');
    expect(result.resources.findings).toEqual([]);
  });

  it('labels referenced, right-sized resources clean', () => {
    const result = assessAuthoringQuality(doc(GOOD_BODY, [resource({})]));
    expect(result.resources.score).toBe(100);
    expect(result.resources.label).toBe('clean');
  });

  it('penalizes an unreferenced script more than an unreferenced reference file', () => {
    const script = assessAuthoringQuality(
      doc(GOOD_BODY, [
        resource({ relativePath: 'scripts/run.sh', category: 'scripts', referenced: false }),
      ]),
    ).resources;
    const note = assessAuthoringQuality(
      doc(GOOD_BODY, [resource({ referenced: false })]),
    ).resources;
    expect(script.findings[0].criterion).toBe('Undocumented script');
    expect(script.score).toBeLessThan(note.score);
  });

  it('flags resources larger than 1 MiB', () => {
    const result = assessAuthoringQuality(
      doc(GOOD_BODY, [resource({ sizeBytes: 2 * 1024 * 1024 })]),
    );
    expect(result.resources.findings.some((f) => f.criterion === 'Large resource')).toBe(true);
  });

  it('keeps instruction and resource findings separate', () => {
    const result = assessAuthoringQuality(doc('', [resource({ referenced: false })]));
    expect(result.instructions.findings).toHaveLength(1);
    expect(result.resources.findings).toHaveLength(1);
  });
});
