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
  'Follow these steps to format the report.',
  '',
  '## Examples',
  '',
  'Input: raw notes. Output: formatted report.',
].join('\n');

describe('assessAuthoringQuality instructions', () => {
  it('labels a substantive body as good with score 100', () => {
    const result = assessAuthoringQuality(doc(GOOD_BODY));
    expect(result.instructions.score).toBe(100);
    expect(result.instructions.label).toBe('excellent');
    expect(result.instructions.findings).toEqual([]);
  });

  it('reports an empty body as a single major finding', () => {
    const result = assessAuthoringQuality(doc('   \n  '));
    expect(result.instructions.findings).toHaveLength(1);
    expect(result.instructions.findings[0].severity).toBe('major');
    expect(result.instructions.score).toBe(20);
    expect(result.instructions.label).toBe('poor');
  });

  it('flags a headings-only body as major', () => {
    const result = assessAuthoringQuality(doc('# Title\n## Steps\n## Examples'));
    const criteria = result.instructions.findings.map((f) => f.criterion);
    expect(criteria).toContain('Substantive body');
    expect(
      result.instructions.findings.find((f) => f.criterion === 'Substantive body')?.severity,
    ).toBe('major');
  });

  it('flags TODO placeholders but not TODO inside code fences', () => {
    const withTodo = assessAuthoringQuality(doc('# T\n\nTODO: write this.\n'));
    expect(withTodo.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(true);

    const inCode = assessAuthoringQuality(
      doc('# T\n\nRun the linter.\n\n```js\n// TODO: sample code comment\n```\n'),
    );
    expect(inCode.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);
  });

  it('treats a mismatched fence marker inside an open fence as fence content', () => {
    // The ~~~ line must not close the backtick fence, so the TODO stays in code.
    const mixed = assessAuthoringQuality(doc('# T\n\nProse here.\n\n```\n~~~\nTODO: inside the fence\n```\n'));
    expect(mixed.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);

    const tilde = assessAuthoringQuality(doc('# T\n\nRun it.\n\n~~~\nTODO: sample\n~~~\n'));
    expect(tilde.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);
  });

  it('flags TODO placeholders in headings', () => {
    const result = assessAuthoringQuality(doc('# T\n\nReal intro.\n\n## TODO: fill this in\n\nBody text.\n'));
    expect(result.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(true);
  });

  it('does not mistake HTML tags with attributes for placeholders', () => {
    const html = assessAuthoringQuality(doc('# T\n\nRenders an <input type="text"> element.\n'));
    expect(html.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(false);

    const placeholder = assessAuthoringQuality(doc('# T\n\nWrite <input the file name> here.\n'));
    expect(placeholder.instructions.findings.some((f) => f.criterion === 'Placeholders')).toBe(true);
  });

  it('flags an Examples section with no content', () => {
    const result = assessAuthoringQuality(doc('# T\n\nDo the work.\n\n## Examples\n\n## Notes\n\nSome notes.'));
    const examples = result.instructions.findings.find((f) => f.criterion === 'Examples');
    expect(examples?.severity).toBe('moderate');
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

  it('flags a body longer than 500 lines as moderate', () => {
    const body = `# T\n\nIntro.\n${'line\n'.repeat(510)}`;
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.findings.some((f) => f.criterion === 'Length')).toBe(true);
  });

  it('never returns a negative score', () => {
    const body = '# A\n## Examples\n## B\n## B\nTODO <describe>\n';
    const result = assessAuthoringQuality(doc(body));
    expect(result.instructions.score).toBeGreaterThanOrEqual(0);
  });
});

describe('assessAuthoringQuality resources', () => {
  it('scores clean resources as good', () => {
    const result = assessAuthoringQuality(doc(GOOD_BODY, [resource({})]));
    expect(result.resources.score).toBe(100);
    expect(result.resources.label).toBe('excellent');
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
    const result = assessAuthoringQuality(
      doc('', [resource({ referenced: false })]),
    );
    expect(result.instructions.findings).toHaveLength(1);
    expect(result.resources.findings).toHaveLength(1);
  });
});
