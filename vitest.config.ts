import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    // The security suite asserts wall-clock budgets on regex patterns. Without
    // an explicit ceiling a catastrophically backtracking pattern hangs the run
    // instead of failing it, which is the failure mode those budgets exist to
    // catch. Generous enough that a slow machine does not flake.
    testTimeout: 30000,
  },
});
