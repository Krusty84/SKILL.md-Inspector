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

  it('supports single-level brace alternation', () => {
    expect(matchesAnyGlob('assets/logo.png', ['**/*.{png,jpg}'])).toBe(true);
    expect(matchesAnyGlob('assets/logo.jpg', ['**/*.{png,jpg}'])).toBe(true);
    expect(matchesAnyGlob('assets/logo.gif', ['**/*.{png,jpg}'])).toBe(false);
    expect(matchesAnyGlob('logo.png', ['*.{png,jpg}'])).toBe(true);
    expect(matchesAnyGlob('media/{png,jpg}', ['**/*.{png,jpg}'])).toBe(false);
  });

  it('compiles wildcards inside brace alternatives with glob semantics', () => {
    expect(matchesAnyGlob('cover.jpeg', ['*.{jp?g,png}'])).toBe(true);
    expect(matchesAnyGlob('dist/app.min.js', ['{**/*.min.js,*.map}'])).toBe(true);
    expect(matchesAnyGlob('bundle.map', ['{**/*.min.js,*.map}'])).toBe(true);
  });

  it('keeps single-star alternatives from crossing path separators', () => {
    expect(matchesAnyGlob('a/b.png', ['{*.png,*.jpg}'])).toBe(false);
    expect(matchesAnyGlob('b.png', ['{*.png,*.jpg}'])).toBe(true);
  });

  it('treats an unclosed brace as a literal and never throws', () => {
    expect(matchesAnyGlob('a{b', ['a{b'])).toBe(true);
    expect(matchesAnyGlob('ab', ['a{b'])).toBe(false);
    expect(matchesAnyGlob('a{b,c', ['a{b,c'])).toBe(true);
  });

  it('treats a nested outer brace as literal while the inner group still alternates', () => {
    // Documented single-level behavior: the outer '{' becomes a literal, scanning
    // continues, and the inner brace-free group compiles to an alternation.
    expect(matchesAnyGlob('a{b,c}', ['a{b,{c,d}}'])).toBe(true);
    expect(matchesAnyGlob('a{b,d}', ['a{b,{c,d}}'])).toBe(true);
    expect(matchesAnyGlob('a{b,e}', ['a{b,{c,d}}'])).toBe(false);
  });

  it('supports empty alternatives', () => {
    expect(matchesAnyGlob('file.txt', ['file.{txt,}'])).toBe(true);
    expect(matchesAnyGlob('file.', ['file.{txt,}'])).toBe(true);
    expect(matchesAnyGlob('file.md', ['file.{txt,}'])).toBe(false);
  });
});
