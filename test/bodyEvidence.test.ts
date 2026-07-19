import { describe, expect, it } from 'vitest';
import { analyzeBodyEvidence, hasExampleEvidence } from '../src/validation/bodyEvidence';

describe('hasExampleEvidence', () => {
  it('rejects an empty Examples heading and records it as empty', () => {
    const evidence = analyzeBodyEvidence('## Examples');

    expect(evidence.hasExampleEvidence).toBe(false);
    expect(evidence.emptyExampleHeadings).toEqual(['Examples']);
    expect(evidence.nonConcreteExampleHeadings).toEqual([]);
  });

  it('rejects placeholder prose in an Examples section', () => {
    const evidence = analyzeBodyEvidence('## Examples\n\nExamples will be added later.');

    expect(evidence.hasExampleEvidence).toBe(false);
    expect(evidence.emptyExampleHeadings).toEqual([]);
    expect(evidence.nonConcreteExampleHeadings).toEqual(['Examples']);
  });

  it('rejects arbitrary prose under a Worked Example heading', () => {
    expect(hasExampleEvidence('## Worked Example\n\nDescribe the result.')).toBe(false);
  });

  it('accepts a Worked Example with explicit Input and Output', () => {
    expect(
      hasExampleEvidence('## Worked Example\n\nInput: raw notes.\n\nOutput: formatted report.'),
    ).toBe(true);
  });

  it('accepts a non-empty fenced block in an Examples section', () => {
    expect(hasExampleEvidence('## Examples\n\n```bash\nrun-tool input.csv\n```')).toBe(true);
  });

  it('rejects an empty fenced block in an Examples section', () => {
    expect(hasExampleEvidence('## Examples\n\n```\n```')).toBe(false);
  });

  it('associates nested concrete evidence with its parent Examples section', () => {
    expect(
      hasExampleEvidence(
        '## Examples\n\n### CSV input\n\nInput: raw.csv\n\nOutput: cleaned.csv',
      ),
    ).toBe(true);
  });

  it('accepts Quick start with fenced commands', () => {
    expect(hasExampleEvidence('## Quick start\n\n```bash\nrun-tool input.csv\n```')).toBe(true);
  });

  it('rejects Quick start without concrete commands', () => {
    expect(hasExampleEvidence('## Quick start\n\nRun the tool with the provided input.')).toBe(
      false,
    );
  });

  it('accepts Minimal reproduction with fails/passes evidence', () => {
    expect(
      hasExampleEvidence(
        '## Minimal reproduction\n\n```bash\n# fails\nrun bad.json\n# passes\nrun good.json\n```',
      ),
    ).toBe(true);
  });

  it('rejects an unrelated fenced workflow block', () => {
    expect(hasExampleEvidence('## Workflow\n\n```bash\nrun-tool input.csv\n```')).toBe(false);
  });

  it('accepts clearly paired input/output fences', () => {
    expect(
      hasExampleEvidence(
        [
          'Input:',
          '```json',
          '{"value": 1}',
          '```',
          '',
          'Output:',
          '```json',
          '{"value": 2}',
          '```',
        ].join('\n'),
      ),
    ).toBe(true);
  });
});
