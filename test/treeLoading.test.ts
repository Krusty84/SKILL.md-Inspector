import { describe, expect, it, vi } from 'vitest';

vi.mock('vscode', () => ({
  TreeItem: class {
    iconPath?: unknown;
    constructor(
      readonly label: string,
      readonly collapsibleState: number,
    ) {}
  },
  TreeItemCollapsibleState: { None: 0 },
  ThemeIcon: class {
    constructor(readonly id: string) {}
  },
}));

import { SingleFlight } from '../src/ui/treeLoading';

function deferred(): { promise: Promise<void>; resolve: () => void; reject: (e: unknown) => void } {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe('SingleFlight.run', () => {
  it('joins the active operation and drops the busy-time one', async () => {
    const flight = new SingleFlight();
    const gate = deferred();
    const first = vi.fn(() => gate.promise);
    const second = vi.fn();

    const a = flight.run(first);
    const b = flight.run(second);
    expect(b).toBe(a);
    gate.resolve();
    await a;
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });
});

describe('SingleFlight.runLatest', () => {
  it('runs immediately when idle', async () => {
    const flight = new SingleFlight();
    const operation = vi.fn();
    await flight.runLatest(operation);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(flight.isRunning).toBe(false);
  });

  it('coalesces busy-time requests into one trailing run where the latest wins', async () => {
    const flight = new SingleFlight();
    const gate = deferred();
    const order: string[] = [];
    const active = flight.runLatest(async () => {
      order.push('active');
      await gate.promise;
    });

    const dropped = vi.fn(() => {
      order.push('dropped');
    });
    const latest = vi.fn(() => {
      order.push('latest');
    });
    const queuedA = flight.runLatest(dropped);
    const queuedB = flight.runLatest(latest);
    // All busy-time requests share the one trailing completion.
    expect(queuedB).toBe(queuedA);

    gate.resolve();
    await active;
    await queuedA;
    expect(order).toEqual(['active', 'latest']);
    expect(dropped).not.toHaveBeenCalled();
    expect(flight.isRunning).toBe(false);
  });

  it('queues again when a request arrives during the trailing run', async () => {
    const flight = new SingleFlight();
    const firstGate = deferred();
    const trailingGate = deferred();
    const order: string[] = [];

    const first = flight.runLatest(async () => {
      order.push('first');
      await firstGate.promise;
    });
    let duringTrailing: Promise<void> | undefined;
    const trailing = flight.runLatest(async () => {
      order.push('trailing');
      // The trailing run is now the active one; a new request must queue a
      // third run rather than being dropped or recursing.
      duringTrailing = flight.runLatest(() => {
        order.push('third');
      });
      await trailingGate.promise;
    });

    firstGate.resolve();
    await first;
    trailingGate.resolve();
    await trailing;
    await duringTrailing;
    expect(order).toEqual(['first', 'trailing', 'third']);
  });

  it('propagates a trailing-run failure to its waiters', async () => {
    const flight = new SingleFlight();
    const gate = deferred();
    const active = flight.runLatest(() => gate.promise);
    const queued = flight.runLatest(() => {
      throw new Error('trailing failed');
    });

    gate.resolve();
    await active;
    await expect(queued).rejects.toThrow('trailing failed');
    expect(flight.isRunning).toBe(false);
  });
});
