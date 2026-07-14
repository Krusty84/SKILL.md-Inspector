import { describe, it, expect } from 'vitest';
import { DiagnosticCode, KIND_BY_CODE } from '../src/types/DiagnosticCode';
import { diag } from '../src/validation/util';

describe('diagnostic kind classification (Task 86)', () => {
  it('every diagnostic code has a kind', () => {
    for (const code of Object.values(DiagnosticCode)) {
      expect(KIND_BY_CODE[code], `missing kind for ${code}`).toBeDefined();
    }
  });

  it('every kind is one of the four categories', () => {
    const kinds = new Set(['specification', 'compatibility', 'quality', 'security']);
    for (const kind of Object.values(KIND_BY_CODE)) {
      expect(kinds.has(kind)).toBe(true);
    }
  });

  it('diag() stamps the kind from the code', () => {
    expect(diag(DiagnosticCode.NameMissing, 'error', 'x').kind).toBe('specification');
    expect(diag(DiagnosticCode.DescriptionVague, 'warning', 'x').kind).toBe('quality');
    expect(diag(DiagnosticCode.LinkEscapesSkillRoot, 'error', 'x').kind).toBe('security');
    expect(diag(DiagnosticCode.LinkAbsolute, 'warning', 'x').kind).toBe('compatibility');
  });
});
