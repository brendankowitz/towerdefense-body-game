import { defineConfig, devices } from '@playwright/test';

const isCi = process.env['CI'] !== undefined;

/**
 * The suite runs against the production bundle served by `vite preview`, never the dev
 * server. Two of the criteria it walks — the tuning panel's absence (spec §13.10) and the
 * lazy route chunks loading at all — are properties of the built output and cannot be
 * observed through Vite's dev transform.
 *
 * One phone project. `devices['iPhone 13']` supplies the 390x844 viewport, touch and the
 * mobile flag; `browserName` is set back to chromium on purpose, because the device entry
 * defaults to WebKit and CI installs chromium only.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: isCi,
  retries: isCi ? 1 : 0,
  /**
   * Capped rather than left at "half the cores". Every spec puts a live WebGL context on
   * screen, and at the default width on a 28-thread machine a worker died with an access
   * violation (0xC0000005) inside the browser process — a driver falling over under the
   * contention, not a bug in anything under test. Four is enough to keep the suite quick.
   */
  workers: isCi ? 2 : 4,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'phone',
      use: { ...devices['iPhone 13'], browserName: 'chromium' },
    },
  ],
  /**
   * Always builds, never reuses. An already-running preview on this port is serving whatever
   * `dist/` held when it started, so reusing it silently tests stale output — during this
   * suite's own failure-injection pass a deliberately broken route came back green that way.
   * A rebuild costs a few seconds; a suite that cannot fail costs much more.
   */
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: false,
    timeout: 180_000,
  },
});
