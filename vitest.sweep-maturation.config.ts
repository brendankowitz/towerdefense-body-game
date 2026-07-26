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
    testTimeout: 60 * 60_000,
    hookTimeout: 60 * 60_000,
  },
});
