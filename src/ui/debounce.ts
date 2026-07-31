export interface KeyedDebouncer {
  /** Coalesces calls per key; the latest callback wins when one fires. */
  schedule(key: string, fn: () => void): void;
  /**
   * Drops the pending call for one key without firing it. Needed when the thing
   * the callback would act on has gone away: closing a document ran
   * `provider.clear`, and ~250 ms later the pending callback re-published its
   * diagnostics, so the Problems panel showed errors for a file that was not
   * open.
   */
  cancel(key: string): void;
  /** Cancels every pending call. */
  dispose(): void;
}

/**
 * Trailing-edge debouncer with a max-wait bound, independent per key.
 *
 * A plain trailing debounce never fires while events keep arriving — during
 * continuous typing, diagnostics would not refresh at all until the user
 * pauses. The max-wait bound guarantees the coalesced call fires no later
 * than `maxWaitMs` after the first event of a burst, so feedback keeps
 * flowing at a bounded staleness. There is deliberately no leading edge:
 * analyzing the first intermediate keystroke wastes a pipeline run on text
 * that is immediately stale.
 *
 * No `vscode` dependency, so the timing behavior is unit-testable.
 */
export function createKeyedDebouncer(delayMs: number, maxWaitMs: number): KeyedDebouncer {
  interface Pending {
    timer: ReturnType<typeof setTimeout>;
    maxWaitTimer: ReturnType<typeof setTimeout>;
    fn: () => void;
  }
  const pending = new Map<string, Pending>();

  const fire = (key: string): void => {
    const entry = pending.get(key);
    if (!entry) return;
    pending.delete(key);
    clearTimeout(entry.timer);
    clearTimeout(entry.maxWaitTimer);
    entry.fn();
  };

  return {
    schedule(key: string, fn: () => void): void {
      const existing = pending.get(key);
      if (existing) {
        existing.fn = fn;
        clearTimeout(existing.timer);
        existing.timer = setTimeout(() => fire(key), delayMs);
        return;
      }
      pending.set(key, {
        fn,
        timer: setTimeout(() => fire(key), delayMs),
        maxWaitTimer: setTimeout(() => fire(key), maxWaitMs),
      });
    },
    cancel(key: string): void {
      const entry = pending.get(key);
      if (!entry) return;
      pending.delete(key);
      clearTimeout(entry.timer);
      clearTimeout(entry.maxWaitTimer);
    },
    dispose(): void {
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        clearTimeout(entry.maxWaitTimer);
      }
      pending.clear();
    },
  };
}
