import { describe, it, expect } from 'vitest';
import { isProbablyNonEnglish } from '../src/quality/language';

describe('isProbablyNonEnglish', () => {
  it('does not flag English or accented-Latin descriptions', () => {
    expect(isProbablyNonEnglish('Format inspection reports. Use when needed.')).toBe(false);
    expect(isProbablyNonEnglish('Générer des rapports résumés')).toBe(false); // French, Latin script
  });

  it('flags clearly Cyrillic and CJK descriptions', () => {
    expect(isProbablyNonEnglish('Форматировать отчёты для инспекции')).toBe(true);
    expect(isProbablyNonEnglish('レポートを生成する')).toBe(true);
  });

  it('does not flag text without letters', () => {
    expect(isProbablyNonEnglish('12345 --- ...')).toBe(false);
    expect(isProbablyNonEnglish('')).toBe(false);
  });
});
