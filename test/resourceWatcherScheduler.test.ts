import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createResourceWatcherScheduler } from '../src/diagnostics/resourceWatcherScheduler';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

function scheduler(overrides?: { ignore?: (fsPath: string) => boolean }) {
  const flush = vi.fn();
  const created = createResourceWatcherScheduler({
    debounceMs: 250,
    maxWaitMs: 2000,
    ignore: overrides?.ignore ?? (() => false),
    flush,
  });
  return { scheduler: created, flush };
}

describe('createResourceWatcherScheduler', () => {
  it('coalesces a burst into one flush with every distinct path', () => {
    const { scheduler: watcher, flush } = scheduler();
    watcher.notify('/ws/skill/references/a.md');
    watcher.notify('/ws/skill/references/b.md');
    watcher.notify('/ws/skill/references/a.md');
    vi.advanceTimersByTime(249);
    expect(flush).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush).toHaveBeenCalledWith(['/ws/skill/references/a.md', '/ws/skill/references/b.md']);
  });

  it('drops ignored paths before scheduling anything', () => {
    const { scheduler: watcher, flush } = scheduler({
      ignore: (fsPath) => fsPath.includes('node_modules'),
    });
    watcher.notify('/ws/node_modules/pkg/templates/card.txt');
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();

    // A mixed burst flushes only the surviving path.
    watcher.notify('/ws/node_modules/pkg/templates/other.txt');
    watcher.notify('/ws/skill/references/a.md');
    vi.advanceTimersByTime(250);
    expect(flush).toHaveBeenCalledWith(['/ws/skill/references/a.md']);
  });

  it('merges events arriving during the pending window and restarts after a flush', () => {
    const { scheduler: watcher, flush } = scheduler();
    watcher.notify('/ws/skill/references/a.md');
    vi.advanceTimersByTime(200);
    watcher.notify('/ws/skill/references/b.md');
    vi.advanceTimersByTime(250);
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(2);

    watcher.notify('/ws/skill/references/c.md');
    vi.advanceTimersByTime(250);
    expect(flush).toHaveBeenCalledTimes(2);
    expect(flush.mock.calls[1]?.[0]).toEqual(['/ws/skill/references/c.md']);
  });

  it('flushes by the max-wait bound under a continuous event stream', () => {
    const { scheduler: watcher, flush } = scheduler();
    // An event every 100ms (an npm install): trailing-only would never flush.
    for (let elapsed = 0; elapsed < 2000; elapsed += 100) {
      watcher.notify(`/ws/skill/references/file-${elapsed}.md`);
      vi.advanceTimersByTime(100);
    }
    expect(flush).toHaveBeenCalledTimes(1);
    expect(flush.mock.calls[0]?.[0]).toHaveLength(20);
  });

  it('dispose cancels the pending flush', () => {
    const { scheduler: watcher, flush } = scheduler();
    watcher.notify('/ws/skill/references/a.md');
    watcher.dispose();
    vi.advanceTimersByTime(5000);
    expect(flush).not.toHaveBeenCalled();
  });
});
