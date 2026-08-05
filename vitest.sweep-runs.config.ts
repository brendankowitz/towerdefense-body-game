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
    // Two hours rather than the one this started at, measured before this sweep grew rather than
    // after it timed out. The whole hook is one `beforeAll`, so the deadline has to cover every
    // run *and* every enumeration in it: 200 seeds across six policy pairs took 959s on their own,
    // and the last stand and the re-fight block enumerate a 7776-board space each at about 95s a
    // context — which is what took the measured run to roughly half an hour, against an hour of
    // clock. The failure this guards is the one the maturation and arrivals configs record: a run
    // that hits the deadline prints its entire report and then reports `Tests 2 skipped`, so every
    // gate goes unrun in the shape of a pass. A margin of two, on a machine nobody has promised is
    // fast, is not a margin.
    testTimeout: 2 * 60 * 60_000,
    hookTimeout: 2 * 60 * 60_000,
  },
});
