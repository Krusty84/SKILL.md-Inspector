import { describe, it, expect } from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { assessAuthoringQuality } from '../src/authoring/authoringQuality';
import { genericProfile } from '../src/profiles/genericProfile';
import { buildReportModel } from '../src/ui/reportModel';
import { renderReportHtml } from '../src/ui/renderReport';
import { renderWorkspaceReportHtml } from '../src/ui/renderWorkspaceReport';
import {
  AUTHORING_HYGIENE_DEFINITION,
  DESCRIPTION_COMPLETENESS_DEFINITION,
  LOW_TEXT_COVERAGE_DEFINITION,
} from '../src/ui/metricDefinitions';
import { detectCollisions } from '../src/workspace/detectSkillCollisions';
import type { SkillDocument } from '../src/types/SkillDocument';
import type { WorkspaceAnalysis } from '../src/types/Workspace';

const doc = (body: string): SkillDocument => ({
  uri: 'file:///skills/example/SKILL.md',
  directory: '/skills/example',
  fileName: 'SKILL.md',
  frontmatter: { name: 'example', description: 'Example skill.' },
  frontmatterRaw: 'name: example',
  body,
  bodyStartLine: 4,
  links: [],
  resources: [],
  parseErrors: [],
});

/** No findings at all — the only body shape allowed to read as `clean`. */
const CLEAN_BODY = [
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

/** 30 words of prose that clear the substantive-body bar and say nothing. */
const LOREM_BODY = [
  '# Example skill',
  '',
  'Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor',
  'incididunt ut labore et dolore magna aliqua ut enim ad minim veniam quis',
  'nostrud exercitation ullamco laboris nisi.',
].join('\n');

const FRONTMATTER = [
  '---',
  'name: example',
  'description: Format inspection reports using company rules. Use when asked to standardize reports. Do not use for contracts.',
  '---',
  '',
].join('\n');

function renderSkillReport(body: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-inspector-labels-'));
  try {
    const skillPath = path.join(dir, 'SKILL.md');
    const content = FRONTMATTER + body;
    fs.writeFileSync(skillPath, content);
    const { document, diagnostics, tokenUsage } = analyzeSkill(skillPath, content, genericProfile);
    const model = buildReportModel(document, diagnostics, genericProfile, tokenUsage);
    return renderReportHtml(model, { nonce: 'n', cspSource: 'x' });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

describe('authoring labels describe hygiene, not merit', () => {
  it('labels a body with no findings clean', () => {
    const result = assessAuthoringQuality(doc(CLEAN_BODY));
    expect(result.instructions.score).toBe(100);
    expect(result.instructions.findings).toEqual([]);
    expect(result.instructions.label).toBe('clean');
  });

  it('labels 30 words of lorem ipsum minor-issues rather than top marks', () => {
    const result = assessAuthoringQuality(doc(LOREM_BODY));
    expect(result.instructions.findings.length).toBeGreaterThan(0);
    expect(result.instructions.label).toBe('minor-issues');
  });

  it('labels an empty body defects', () => {
    const result = assessAuthoringQuality(doc('   \n  '));
    expect(result.instructions.score).toBe(0);
    expect(result.instructions.label).toBe('defects');
  });

  it('never labels a body carrying any finding clean', () => {
    const bodies = [
      LOREM_BODY,
      '   \n  ',
      '# Title\n## Steps\n## Examples',
      '# T\n\nTODO: write this.\n',
      `${CLEAN_BODY}\n\n## Notes\n`,
      '# T\n\nRun the linter and inspect the output.\n\n```js\nconst x = 1;\n',
    ];
    for (const body of bodies) {
      const result = assessAuthoringQuality(doc(body));
      if (result.instructions.findings.length > 0) {
        expect(result.instructions.label, body.slice(0, 24)).not.toBe('clean');
      }
    }
  });

  it('reports resource findings on the same non-evaluative vocabulary', () => {
    const result = assessAuthoringQuality(doc(CLEAN_BODY));
    expect(result.resources.label).toBe('clean');
  });
});

describe('skill report headings say what they measure', () => {
  const html = renderSkillReport(CLEAN_BODY);

  it('names the hygiene sections honestly', () => {
    expect(html).toContain('Authoring hygiene (instructions)');
    expect(html).toContain('Authoring hygiene (resources)');
    expect(html).not.toContain('Instruction authoring quality');
    expect(html).not.toContain('Resource authoring quality');
  });

  it('keeps the section anchors stable for existing links', () => {
    expect(html).toContain('id="instruction-authoring-quality"');
    expect(html).toContain('id="resource-authoring-quality"');
  });

  it('names the description metric after what it counts', () => {
    expect(html).toContain('Description completeness');
    expect(html).not.toContain('Heuristic Static Description Quality');
  });

  it('carries the verbatim metric definitions as tooltips', () => {
    expect(html).toContain(DESCRIPTION_COMPLETENESS_DEFINITION);
    expect(html).toContain(AUTHORING_HYGIENE_DEFINITION);
  });
});

const CYRILLIC_PAIR = [
  { name: 'otchet-formatter', description: 'Форматирует технические отчёты по правилам.' },
  { name: 'otchet-generator', description: 'Создаёт технические отчёты из журналов.' },
];

const LATIN_PAIR = [
  {
    name: 'pdf-report-formatter',
    description:
      'Format technical PDF reports using company layout rules. Use when asked to standardize inspection reports.',
  },
  {
    name: 'engineering-report-formatter',
    description:
      'Format technical engineering reports using company layout rules. Use when asked to standardize inspection reports.',
  },
];

/** 0.17 for a Cyrillic pair sits below the default threshold, which would drop the row entirely. */
const LOW_THRESHOLD = { threshold: 0.05 };

describe('workspace report columns say what they measure', () => {
  function render(collisions: WorkspaceAnalysis['collisions']): string {
    const value: WorkspaceAnalysis = {
      skills: [],
      collisions,
      nameConflicts: [],
      similarNames: [],
      cancelled: false,
    };
    return renderWorkspaceReportHtml(value, {
      nonce: 'n',
      cspSource: 'x',
      scope: { kind: 'workspace', folderPath: '/ws' },
    });
  }

  it('renames the score columns and defines them in a tooltip', () => {
    const html = render([]);
    expect(html).toContain('>Hygiene</th>');
    expect(html).toContain('>Completeness</th>');
    expect(html).not.toContain('Instruction authoring quality');
    expect(html).not.toContain('Adjusted description quality');
    expect(html).toContain(DESCRIPTION_COMPLETENESS_DEFINITION);
    expect(html).toContain(AUTHORING_HYGIENE_DEFINITION);
  });

  it('marks a Cyrillic-only pair whose similarity is really name similarity', () => {
    const collisions = detectCollisions(CYRILLIC_PAIR, LOW_THRESHOLD);
    const html = render(collisions);
    expect(html).toContain('text coverage: low');
    expect(html).toContain(LOW_TEXT_COVERAGE_DEFINITION);
  });

  it('leaves a pair the text metrics could actually read unmarked', () => {
    const html = render(detectCollisions(LATIN_PAIR, LOW_THRESHOLD));
    expect(html).not.toContain('text coverage: low');
  });
});

describe('detectCollisions reports its own text coverage', () => {
  it('flags low coverage when neither description yields comparable tokens', () => {
    const [collision] = detectCollisions(CYRILLIC_PAIR, LOW_THRESHOLD);
    // All three text metrics returned 0; the composite is name similarity alone.
    expect(collision.metrics).toMatchObject({ cosine: 0, jaccard: 0, charNgram: 0 });
    expect(collision.textCoverage).toBe('low');
  });

  it('reports full coverage for descriptions with comparable tokens', () => {
    const [collision] = detectCollisions(LATIN_PAIR, LOW_THRESHOLD);
    expect(collision.textCoverage).toBe('full');
  });
});
