import { describe, expect, it } from 'vitest';
import { hasExampleEvidence } from '../src/validation/bodyEvidence';

describe('hasExampleEvidence', () => {
  it('accepts an explicit Example heading', () => {
    expect(hasExampleEvidence('## Worked Example\n\nDescribe the result.')).toBe(true);
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
