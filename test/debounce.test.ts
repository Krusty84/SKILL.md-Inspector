import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createKeyedDebouncer } from '../src/ui/debounce';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('createKeyedDebouncer', () => {
  it('fires once on the trailing edge after the delay', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const fn = vi.fn();
    debouncer.schedule('a', fn);
    vi.advanceTimersByTime(249);
    expect(fn).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(fn).toHaveBeenCalledTimes(1);
    // The max-wait timer must not produce a second, late call.
    vi.advanceTimersByTime(2000);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('coalesces re-schedules and runs the latest callback', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const first = vi.fn();
    const second = vi.fn();
    debouncer.schedule('a', first);
    vi.advanceTimersByTime(200);
    debouncer.schedule('a', second);
    vi.advanceTimersByTime(250);
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('fires by the max-wait bound under continuous re-scheduling', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const fn = vi.fn();
    // Re-schedule every 100ms: a pure trailing debounce would never fire.
    for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
      debouncer.schedule('a', fn);
      vi.advanceTimersByTime(100);
    }
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('starts a fresh window (including max-wait) after each fire', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const fn = vi.fn();
    debouncer.schedule('a', fn);
    vi.advanceTimersByTime(250);
    expect(fn).toHaveBeenCalledTimes(1);

    for (let elapsed = 0; elapsed < 1000; elapsed += 100) {
      debouncer.schedule('a', fn);
      vi.advanceTimersByTime(100);
    }
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('debounces keys independently', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const a = vi.fn();
    const b = vi.fn();
    debouncer.schedule('a', a);
    vi.advanceTimersByTime(150);
    debouncer.schedule('b', b);
    vi.advanceTimersByTime(100);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).not.toHaveBeenCalled();
    vi.advanceTimersByTime(150);
    expect(b).toHaveBeenCalledTimes(1);
  });

  it('dispose cancels all pending calls', () => {
    const debouncer = createKeyedDebouncer(250, 1000);
    const fn = vi.fn();
    debouncer.schedule('a', fn);
    debouncer.schedule('b', fn);
    debouncer.dispose();
    vi.advanceTimersByTime(5000);
    expect(fn).not.toHaveBeenCalled();
  });
});
