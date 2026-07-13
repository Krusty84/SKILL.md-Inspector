import { describe, it, expect } from 'vitest';
import { EXAMPLES_SECTION, IO_SECTION, matchesSection } from '../src/validation/bodySections';

describe('matchesSection (Task 54)', () => {
  it('matches whole-token and alias headings', () => {
    expect(matchesSection('Examples', EXAMPLES_SECTION)).toBe(true);
    expect(matchesSection('Example usage', EXAMPLES_SECTION)).toBe(true);
    expect(matchesSection('Sample', EXAMPLES_SECTION)).toBe(true);
  });

  it('does not match a keyword embedded in a larger token (no substring match)', () => {
    // "example" is a substring of "counterexamples" but not a whole token.
    expect(matchesSection('Counterexamples', EXAMPLES_SECTION)).toBe(false);
    // The classic false positive: "Formatting" must not match the I/O "format" keyword.
    expect(matchesSection('Formatting guide', IO_SECTION)).toBe(false);
  });
});
