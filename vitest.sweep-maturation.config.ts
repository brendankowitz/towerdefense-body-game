import { defineConfig } from 'vitest/config';

/**
 * The maturation comparison, on its own config for the same reason the balance sweep has one and
 * then one step further: it plays the whole board space once per maturation policy, so it is
 * three times the sweep and roughly ten times the patience.
 *
 *   npm run sweep:maturation
 *
 * Settings are repeated rather than shared. Spreading the other config would need a cast — its
 * export type admits a function and a promise — and six lines of duplication is cheaper than a
 * cast in a file whose whole job is to be read.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sweep/maturation.sweep.ts'],
    disableConsoleIntercept: true,
    // Four hours rather than the one this started at, because one was never enough to finish:
    // measured at 4308s (hit the old deadline, `Tests 4 skipped`) and 4040s (a pass, under a
    // raised clock), both with logged artifacts. A run that hits the deadline prints its complete
    // per-case report above a `Test Files 1 failed` line with `Tests 4 skipped` — the whole
    // comparison measured and every gate silently unrun, in the shape of a report that reads like
    // a pass. The arrivals config carries six hours for the same reason and records the same
    // failure.
    testTimeout: 4 * 60 * 60_000,
    hookTimeout: 4 * 60 * 60_000,
  },
});
