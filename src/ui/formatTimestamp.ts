import type { TimestampFormat } from '../types/TimestampFormat';

/** Formats a timestamp for display in reports per the configured clock style. */
export function formatTimestamp(date: Date, format: TimestampFormat): string {
  return format === 'usa'
    ? date.toLocaleString('en-US', { hour12: true })
    : date.toLocaleString('en-GB', { hour12: false });
}
