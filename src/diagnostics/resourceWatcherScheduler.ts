import { createKeyedDebouncer, type KeyedDebouncer } from '../ui/debounce';

export interface ResourceWatcherScheduler {
  /** Reports one filesystem event; ignored paths are dropped before scheduling. */
  notify(fsPath: string): void;
  /** Cancels any pending flush and drops collected paths. */
  dispose(): void;
}

/**
 * Coalesces resource file-watcher events into one batched flush per settled
 * burst. The watcher glob matches any `references/scripts/assets/templates`
 * directory anywhere in the workspace — a `node_modules` install or branch
 * switch fires hundreds of events, and each one used to trigger a full
 * synchronous workspace re-analysis plus a revalidation of every visible
 * editor, back to back, blocking the extension host (typing included).
 *
 * `ignore` filters events against the resource-exclusion globs before they
 * schedule anything; `flush` receives every distinct surviving path once the
 * burst settles (trailing debounce with a max-wait bound, so an endless event
 * stream still flushes periodically). No `vscode` dependency: both callbacks
 * are injected, so the batching behavior is unit-testable.
 */
export function createResourceWatcherScheduler(options: {
  debounceMs: number;
  maxWaitMs: number;
  ignore: (fsPath: string) => boolean;
  flush: (paths: readonly string[]) => void;
}): ResourceWatcherScheduler {
  const pending = new Set<string>();
  const debouncer: KeyedDebouncer = createKeyedDebouncer(options.debounceMs, options.maxWaitMs);
  return {
    notify(fsPath: string): void {
      if (options.ignore(fsPath)) {
        return;
      }
      pending.add(fsPath);
      debouncer.schedule('resource-events', () => {
        const paths = [...pending];
        pending.clear();
        options.flush(paths);
      });
    },
    dispose(): void {
      debouncer.dispose();
      pending.clear();
    },
  };
}
