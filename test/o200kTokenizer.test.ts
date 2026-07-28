/**
 * The tokenizer is a lazily built singleton whose construction is the single
 * biggest one-off stall on the validation path. warmUpO200kTokenizer moves
 * that construction to an idle moment; these tests pin that warm-up and the
 * subsequent counts share one instance.
 */
import { describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({ constructed: 0 }));

vi.mock('js-tiktoken/lite', () => ({
  Tiktoken: class {
    constructor() {
      hoisted.constructed += 1;
    }
    encode(text: string): number[] {
      return Array.from({ length: text.split(/\s+/).filter(Boolean).length }, (_, i) => i);
    }
  },
}));

import { countO200kTokens, warmUpO200kTokenizer } from '../src/analysis/o200kTokenizer';

describe('warmUpO200kTokenizer', () => {
  it('constructs the tokenizer once; counts and repeat warm-ups reuse it', () => {
    expect(hoisted.constructed).toBe(0);
    warmUpO200kTokenizer();
    expect(hoisted.constructed).toBe(1);

    warmUpO200kTokenizer();
    expect(countO200kTokens('alpha beta gamma')).toBe(3);
    expect(hoisted.constructed).toBe(1);
  });
});
