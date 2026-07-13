import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { toKebabCase, NAME_PATTERN } from '../src/validation/validateName';

// A generator that only ever emits NAME_PATTERN-valid names: lowercase
// letters/digits in single-hyphen-separated segments, capped at 64 chars.
const alnum = fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789'.split(''));
const segment = fc.array(alnum, { minLength: 1, maxLength: 10 }).map((cs) => cs.join(''));
const kebabName = fc
  .array(segment, { minLength: 1, maxLength: 6 })
  .map((segs) => segs.join('-'))
  .filter((name) => name.length <= 64);

describe('toKebabCase idempotence (Task 66)', () => {
  it('leaves every NAME_PATTERN-valid name unchanged', () => {
    fc.assert(
      fc.property(kebabName, (name) => {
        expect(NAME_PATTERN.test(name)).toBe(true); // generator sanity
        expect(toKebabCase(name)).toBe(name);
      }),
    );
  });

  it('is idempotent at the boundary lengths (1 and 64)', () => {
    const shortest = 'a';
    const longest = 'a'.repeat(64);
    expect(NAME_PATTERN.test(shortest)).toBe(true);
    expect(NAME_PATTERN.test(longest)).toBe(true);
    expect(toKebabCase(shortest)).toBe(shortest);
    expect(toKebabCase(longest)).toBe(longest);
  });

  it('applying toKebabCase twice equals applying it once for any input', () => {
    fc.assert(
      fc.property(fc.string(), (s) => {
        const once = toKebabCase(s);
        expect(toKebabCase(once)).toBe(once);
      }),
    );
  });
});
