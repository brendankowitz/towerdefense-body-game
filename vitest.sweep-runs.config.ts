import { defineConfig } from 'vitest/config';

/**
 * The whole-run sweep, on its own config for the same reason the other two have one: it plays
 * hundreds of runs end to end on the real simulation and takes minutes, which is fine for a
 * deliberate `npm run sweep:runs` and not fine for the suite that runs on every change.
 *
 *   npm run sweep:runs
 *
 * `tests/sweep/playRun.test.ts` is the harness's own tests and is *not* here — it belongs to
 * `npm test`, the same way `playBoard.test.ts` does. The sweeps are the files that are not tests.
 *
 * Settings are repeated rather than shared, which is what the maturation config says and why.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sweep/runSweep.ts'],
    disableConsoleIntercept: true,
    testTimeout: 60 * 60_000,
    hookTimeout: 60 * 60_000,
  },
});
