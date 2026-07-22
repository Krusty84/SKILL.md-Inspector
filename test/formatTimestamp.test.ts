import { describe, it, expect } from 'vitest';
import { formatTimestamp } from '../src/ui/formatTimestamp';

describe('formatTimestamp', () => {
  // A fixed afternoon instant; the AM/PM assertions below hold regardless of
  // the host time zone, so the test is deterministic across machines.
  const date = new Date(Date.UTC(2026, 0, 15, 14, 30, 45));

  it('uses a 12-hour AM/PM clock for the USA format', () => {
    expect(formatTimestamp(date, 'usa')).toMatch(/\b(AM|PM)\b/i);
  });

  it('uses a 24-hour clock (no AM/PM) for the European format', () => {
    expect(formatTimestamp(date, 'european')).not.toMatch(/\b(AM|PM)\b/i);
  });
});
