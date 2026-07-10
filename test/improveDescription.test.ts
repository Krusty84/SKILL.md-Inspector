import { describe, it, expect } from 'vitest';
import {
  buildImprovedDescription,
  buildDescriptionSuggestions,
  REWRITE_TEMPLATE,
} from '../src/quality/improveDescription';

describe('buildImprovedDescription', () => {
  it('returns the template for an empty description', () => {
    expect(buildImprovedDescription('')).toBe(REWRITE_TEMPLATE);
  });

  it('returns the template for a poor description', () => {
    expect(buildImprovedDescription('Helps with documents.')).toBe(REWRITE_TEMPLATE);
  });

  it('keeps a decent description and appends missing trigger and boundary clauses', () => {
    const improved = buildImprovedDescription(
      'Format inspection reports using company layout rules',
    );
    expect(improved).toContain('Format inspection reports using company layout rules.');
    expect(improved).toContain('Use when <trigger context>.');
    expect(improved).toContain('Do not use when <boundary>.');
  });

  it('only appends the boundary when a trigger is already present', () => {
    const improved = buildImprovedDescription('Format reports. Use when standardizing engineering docs.');
    expect(improved).toContain('Do not use when <boundary>.');
    expect(improved).not.toContain('Use when <trigger context>.');
  });
});

describe('buildDescriptionSuggestions', () => {
  it('returns actionable suggestions for weak criteria', () => {
    const suggestions = buildDescriptionSuggestions('Helps with documents.');
    expect(suggestions.length).toBeGreaterThan(0);
    expect(suggestions).toContain('Add "Use when <context>".');
  });

  it('returns no suggestions for a complete description', () => {
    const suggestions = buildDescriptionSuggestions(
      'Format inspection reports using standard rules. Use when standardizing reports. Do not use when handling invoices.',
    );
    expect(suggestions).toEqual([]);
  });
});
