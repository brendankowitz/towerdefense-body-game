import { defineConfig } from 'vitest/config';

/**
 * The memory comparison, on its own config for the same reason the other three have one: it plays
 * the whole board space once per memory arm and takes minutes.
 *
 *   npm run sweep:arrivals
 *
 * It is also the one sweep meant to be run twice — once with `ARRIVALS_ENABLED` off, which
 * measures what the three strain vaccines are worth on their own, and once with it on. The file's
 * own docstring says why the second reading cannot be had without the first.
 *
 * Settings are repeated rather than shared, which is what the maturation config says and why.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/sweep/arrivals.sweep.ts'],
    disableConsoleIntercept: true,
    // Six hours rather than the one the other three configs give, because this run is four plays
    // of the whole board space and the first pass of it measured a wall time of over two on a
    // loaded machine. The hook is where the whole comparison happens, so a hook that times out
    // prints the entire report and then skips every assertion in the file — a run that looks like
    // it measured everything and gated nothing. That happened, on all twenty-five runs of the
    // first spread; the numbers survived it and the gates did not.
    testTimeout: 6 * 60 * 60_000,
    hookTimeout: 6 * 60 * 60_000,
  },
});
