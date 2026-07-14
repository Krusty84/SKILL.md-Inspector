import { describe, it, expect } from 'vitest';
import { sortDiagnostics } from '../src/validation/util';
import type { SkillDiagnostic, SkillDiagnosticRange } from '../src/types/SkillDiagnostic';

const R = (line: number, char: number): SkillDiagnosticRange => ({
  startLine: line,
  startCharacter: char,
  endLine: line,
  endCharacter: char,
});

function d(
  code: string,
  severity: SkillDiagnostic['severity'],
  range?: SkillDiagnosticRange,
): SkillDiagnostic {
  return { code, severity, kind: 'quality', message: code, range, source: 'SKILL.md Inspector' };
}

describe('sortDiagnostics (Task 82)', () => {
  it('orders by document range, then severity, then code', () => {
    const input = [
      d('b.code', 'warning', R(5, 0)),
      d('a.code', 'error', R(5, 0)),
      d('z.code', 'error', R(1, 0)),
      d('m.code', 'information'), // no range → sorts last
      d('k.code', 'error', R(1, 0)),
    ];
    expect(sortDiagnostics(input).map((x) => x.code)).toEqual([
      'k.code', // (1,0) error, code k < z
      'z.code', // (1,0) error
      'a.code', // (5,0) error before warning
      'b.code', // (5,0) warning
      'm.code', // no range last
    ]);
  });

  it('is a pure sort that does not mutate its input', () => {
    const input = [d('x', 'warning', R(2, 0)), d('y', 'error', R(1, 0))];
    const copy = [...input];
    sortDiagnostics(input);
    expect(input).toEqual(copy);
  });
});
