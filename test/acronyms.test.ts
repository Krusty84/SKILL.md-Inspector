import { describe, it, expect } from 'vitest';
import { isKnownAcronym, KNOWN_ACRONYMS } from '../src/quality/acronyms';

describe('isKnownAcronym', () => {
  it('matches known acronyms and technologies case-insensitively', () => {
    expect(isKnownAcronym('PDF')).toBe(true);
    expect(isKnownAcronym('pdf')).toBe(true);
    expect(isKnownAcronym('Api')).toBe(true);
    expect(isKnownAcronym('sql')).toBe(true);
    expect(isKnownAcronym('JSON')).toBe(true);
    expect(isKnownAcronym('YAML')).toBe(true);
  });

  it('rejects ordinary uppercase words', () => {
    expect(isKnownAcronym('IMPORTANT')).toBe(false);
    expect(isKnownAcronym('GOOD')).toBe(false);
    expect(isKnownAcronym('THINGS')).toBe(false);
  });

  it('keeps the registry in one module', () => {
    expect(KNOWN_ACRONYMS.has('yaml')).toBe(true);
    expect(KNOWN_ACRONYMS.has('important')).toBe(false);
  });
});
