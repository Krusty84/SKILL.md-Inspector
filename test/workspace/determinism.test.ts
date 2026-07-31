import { describe, it, expect } from 'vitest';
import { compareInvariant } from '../../src/quality/textMatch';
import { createNonce } from '../../src/ui/webviewNonce';
import { createKeyedDebouncer } from '../../src/ui/debounce';

/**
 * Plan 17 Parts D, I and J. Three small pieces that each made an outcome depend
 * on something it should not: the host locale, a race between a close and a
 * pending debounce, and `Math.random()` for the value that gates `script-src`.
 */

describe('D — the comparator does not consult the host locale', () => {
  it('orders the pairs that Swedish and English disagree about the same way', () => {
    // In `sv-SE`, `ä` and `ö` sort after `z`; in `en-US` they sort with `a`/`o`.
    const names = ['zebra-tool', 'ähnlich-tool', 'öffnen-tool', 'apple-tool'];
    const invariant = [...names].sort(compareInvariant);
    expect(invariant).toEqual([...names].sort());
    // …and specifically not the locale-dependent answer.
    expect(invariant).toEqual(['apple-tool', 'zebra-tool', 'ähnlich-tool', 'öffnen-tool']);
  });
});

describe('I — closing a document cancels its pending validation', () => {
  it('drops the scheduled callback for that key only', async () => {
    const debouncer = createKeyedDebouncer(5, 20);
    const fired: string[] = [];
    debouncer.schedule('a', () => fired.push('a'));
    debouncer.schedule('b', () => fired.push('b'));
    debouncer.cancel('a');
    await new Promise((resolve) => setTimeout(resolve, 40));
    expect(fired).toEqual(['b']);
    debouncer.dispose();
  });

  it('is a no-op for a key with nothing pending', () => {
    const debouncer = createKeyedDebouncer(5, 20);
    expect(() => debouncer.cancel('missing')).not.toThrow();
    debouncer.dispose();
  });
});

describe('J — the CSP nonce is crypto-backed', () => {
  it('produces a distinct, long, url-safe value each time', () => {
    const values = new Set(Array.from({ length: 500 }, () => createNonce()));
    expect(values.size).toBe(500);
    for (const value of values) {
      expect(value.length).toBeGreaterThanOrEqual(32);
      expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
    }
  });
});
