/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';
import { visualizer } from 'rollup-plugin-visualizer';

// react/react-dom and the react-router family change far less often than app
// code and don't share internals with it, so splitting them into their own
// vendor chunks lets browsers cache them across deploys at no size cost
// (measured: identical total bytes to the unsplit build).
//
// @ionic/core is deliberately left out of this scheme. Measuring it showed
// that pinning @ionic/react (and therefore its statically-reached @ionic/core
// modules) into a manual chunk inflates the total by ~270 kB minified: the two
// packages share enough internal, per-component surface that forcing a chunk
// boundary between them defeats scope-hoisting and forces otherwise-manglable
// exports to keep stable names. @ionic/core's own lazy-element loader already
// splits most component implementations into on-demand chunks for free
// (the p-*.js files); a manual chunk here would also swallow those.
//
// Once src/game imports pixi.js, it will only ever be reached through the
// lazy route below, so Rollup's default async-chunk splitting already gives
// it an on-demand chunk — no entry needs to be added here for that to work.
const vendorChunks: ReadonlyArray<readonly [string, RegExp]> = [
  ['vendor-react', /\/node_modules\/(react|react-dom|scheduler)\//],
  ['vendor-router', /\/node_modules\/(react-router|react-router-dom|history|path-to-regexp|resolve-pathname|value-equal|tiny-invariant|isarray|prop-types|react-is|hoist-non-react-statics)\//],
];

function manualChunks(id: string): string | undefined {
  const normalized = id.replace(/\\/g, '/');
  if (!normalized.includes('/node_modules/')) return undefined;
  const match = vendorChunks.find(([, pattern]) => pattern.test(normalized));
  return match ? match[0] : undefined;
}

/**
 * GitHub Pages serves a project site from `/<repo>/`, so the build needs that prefix on every
 * asset URL. It is opt-in rather than unconditional because `npm run preview` and the Playwright
 * suite both drive the built output at the site root; making the prefix permanent would move the
 * app out from under them for the sake of one deploy target.
 */
const base = process.env.GITHUB_PAGES === 'true' ? '/towerdefense-body-game/' : '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    tsconfigPaths(),
    ...(process.env.ANALYZE
      ? [visualizer({ filename: 'dist/stats.html', gzipSize: true, template: 'treemap' })]
      : []),
  ],
  build: {
    sourcemap: process.env.ANALYZE ? true : false,
    rollupOptions: {
      output: { manualChunks },
    },
    // The remaining warning is the index chunk, which is almost entirely
    // @ionic/core (measured ~780 kB of it pre-minify) plus react-dom's share
    // that couldn't be split further without growing the total (see above).
    // Raised just past the current ~830 kB so real regressions still warn.
    chunkSizeWarningLimit: 900,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    // `tests/sweep/**/*.test.ts` is the sweep harness's own tests, not a sweep: the sweeps are
    // `*.sweep.ts` and run under their own configs. The harness decides what a player buys and
    // grows, which is a behaviour like any other and belongs in the suite that runs on every
    // change — the minutes-long runs on top of it are no place to find out it stopped growing.
    include: ['src/**/*.test.{ts,tsx}', 'tests/lint/**/*.test.ts', 'tests/sweep/**/*.test.ts'],
  },
});
