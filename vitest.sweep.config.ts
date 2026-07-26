import { defineConfig } from 'vitest/config';

/**
 * The balance sweep runs on its own config so it stays out of `npm test`: it plays tens of
 * thousands of full cases through the real simulation and takes minutes, which is fine for a
 * deliberate `npm run sweep` and not fine for the suite that runs on every change.
 *
 * No jsdom, no setup file — the simulation is pure and has never needed either.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sweep/**/*.sweep.ts'],
    // The report is the point of the run, so it goes straight to the terminal. Intercepted
    // console output is attributed to a task and only printed for the ones that failed, which
    // hides the table on exactly the runs where the tuning is fine and you wanted the numbers.
    disableConsoleIntercept: true,
    testTimeout: 30 * 60_000,
    hookTimeout: 30 * 60_000,
  },
});
