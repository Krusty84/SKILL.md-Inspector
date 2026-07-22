import { describe, it, expect } from 'vitest';
import { resolveProfile } from '../src/profiles';

describe('resolveProfile description.language', () => {
  it('applies the "en" override', () => {
    expect(resolveProfile({ descriptionLanguage: 'en' }).description.language).toBe('en');
  });

  it('applies the "auto" override', () => {
    expect(resolveProfile({ descriptionLanguage: 'auto' }).description.language).toBe('auto');
  });

  it('leaves language undefined when unset (the scorer then defaults to auto)', () => {
    expect(resolveProfile().description.language).toBeUndefined();
  });
});
