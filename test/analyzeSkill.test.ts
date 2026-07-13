import { describe, it, expect } from 'vitest';
import { analyzeSkill } from '../src/analysis/analyzeSkill';
import { DiagnosticCode } from '../src/types/DiagnosticCode';
import { genericProfile } from '../src/profiles';

const CONTENT = [
  '---',
  'name: demo',
  'description: Format inspection reports cleanly. Use when needed. Do not use for x.',
  '---',
  '',
  '# Body',
  '',
  'See [missing](./references/nope.md).',
].join('\n');

describe('analyzeSkill modes (Tasks 57/58)', () => {
  it('text-only mode does no filesystem access and finds no link-existence diagnostics', () => {
    // A non-existent directory must not throw or trigger fs traversal.
    const analysis = analyzeSkill('/no/such/dir/SKILL.md', CONTENT, genericProfile, {
      mode: 'text-only',
    });
    expect(analysis.document.resources).toEqual([]);
    expect(analysis.diagnostics.some((d) => d.code === DiagnosticCode.LinkMissing)).toBe(false);
  });

  it('text-only mode does not call the resource discovery function', () => {
    let called = false;
    analyzeSkill('/no/such/dir/SKILL.md', CONTENT, genericProfile, {
      mode: 'text-only',
      discover: () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(false);
  });

  it('full mode reports the missing linked file', () => {
    const analysis = analyzeSkill('/no/such/dir/SKILL.md', CONTENT, genericProfile, {
      mode: 'full',
    });
    expect(analysis.diagnostics.some((d) => d.code === DiagnosticCode.LinkMissing)).toBe(true);
  });

  it('full mode uses the injected discovery function', () => {
    let called = false;
    analyzeSkill('/no/such/dir/SKILL.md', CONTENT, genericProfile, {
      mode: 'full',
      discover: () => {
        called = true;
        return [];
      },
    });
    expect(called).toBe(true);
  });
});
