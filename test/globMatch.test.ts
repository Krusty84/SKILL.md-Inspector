import { describe, it, expect } from 'vitest';
import { matchesAnyGlob } from '../src/parser/globMatch';

const DEFAULTS = ['**/node_modules/**', '**/.git/**', '**/dist/**', '**/out/**'];

describe('matchesAnyGlob', () => {
  it('matches an excluded folder at the root, nested, and as a bare directory', () => {
    expect(matchesAnyGlob('node_modules/a.js', DEFAULTS)).toBe(true);
    expect(matchesAnyGlob('pkg/node_modules/a.js', DEFAULTS)).toBe(true);
    expect(matchesAnyGlob('node_modules', DEFAULTS)).toBe(true);
    expect(matchesAnyGlob('.git', DEFAULTS)).toBe(true);
  });

  it('does not match ordinary resource files', () => {
    expect(matchesAnyGlob('references/guide.md', DEFAULTS)).toBe(false);
    expect(matchesAnyGlob('scripts/run.js', DEFAULTS)).toBe(false);
    expect(matchesAnyGlob('examples/example.md', DEFAULTS)).toBe(false);
  });

  it('supports single-segment wildcards', () => {
    expect(matchesAnyGlob('a.log', ['*.log'])).toBe(true);
    expect(matchesAnyGlob('a.txt', ['*.log'])).toBe(false);
  });
});
