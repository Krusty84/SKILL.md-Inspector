import { describe, it, expect } from 'vitest';
import { parseSessionExport } from '../../src/opencode/parseSessionExport';
import { normalizeSession } from '../../src/opencode/buildTrajectory';
import { preview } from '../../src/opencode/util';

/**
 * Plan 13 Part E. Three OpenCode paths broke well under the 25 MB file-size
 * limit the loader enforces: a spread-push into `Array.push` blew the call stack
 * at 469 KB, `JSON.stringify` threw on a deeply nested value, and
 * `deriveParentTime` scanned every node per node.
 */

function elapsed(fn: () => void): number {
  const started = performance.now();
  fn();
  return performance.now() - started;
}

/** An export with `parts` parts in a single assistant message. */
function exportWithParts(parts: number): unknown {
  return {
    info: { id: 'session-1', title: 'Big', time: { created: 1, updated: 2 } },
    messages: [
      {
        info: { id: 'message-1', role: 'assistant', time: { created: 1 } },
        parts: Array.from({ length: parts }, (_, i) => ({
          id: `part-${i}`,
          type: 'text',
          text: `chunk ${i}`,
        })),
      },
    ],
  };
}

/** A value nested `depth` objects deep. */
function deeplyNested(depth: number): unknown {
  let value: unknown = 'leaf';
  for (let i = 0; i < depth; i++) {
    value = { next: value };
  }
  return value;
}

describe('OpenCode input bounds', () => {
  it('parses a 30,000-part export without a RangeError', () => {
    // `diagnostics.push(...validateSessionCompatibility(value))` spreads one
    // argument per diagnostic, and compatibility reports several per part, so
    // the stack limit is reached long before the loader's 25 MB file cap.
    const result = parseSessionExport(exportWithParts(30_000));
    expect(result.fatal).toBe(false);
    expect(result.session?.messages[0].parts).toHaveLength(30_000);
  });

  it('parses a 90,000-part export without a RangeError', () => {
    const result = parseSessionExport(exportWithParts(90_000));
    expect(result.fatal).toBe(false);
    expect(result.session?.messages[0].parts).toHaveLength(90_000);
  });

  it('caps the diagnostic list and says how many were suppressed', () => {
    // Every part here is missing a `type`, so each one produces a diagnostic.
    const many = {
      info: { id: 'session-1' },
      messages: [
        {
          info: { id: 'message-1', role: 'assistant' },
          parts: Array.from({ length: 30_000 }, () => ({})),
        },
      ],
    };
    const result = parseSessionExport(many);
    expect(result.diagnostics.length).toBeLessThanOrEqual(5_001);
    expect(result.diagnostics.some((d) => d.code === 'opencode.diagnostics.truncated')).toBe(true);
  });

  it('previews a 20,000-deep value without throwing', () => {
    expect(() => preview(deeplyNested(20_000))).not.toThrow();
    expect(preview(deeplyNested(20_000))).toBeDefined();
  });

  it('normalizes 64,000 parts in under 5 s', () => {
    const parsed = parseSessionExport(exportWithParts(64_000));
    expect(parsed.session).toBeDefined();
    const ms = elapsed(() => normalizeSession(parsed.session!, parsed.diagnostics));
    expect(ms).toBeLessThan(5_000);
  });
});
