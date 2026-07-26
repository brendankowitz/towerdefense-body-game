// A deliberate violation of every rule the `src/game/**/*.ts` block in eslint.config.js applies.
//
// It lives under src/game/ because that is the only path where those rules apply. The previous
// fixtures sat under tests/lint/, where a *different* no-restricted-imports block reached them,
// so the boundary test passed with the whole src/game block deleted from the config.
//
// Excluded from both tsconfig projects (so `tsc` never compiles a module that imports Pixi into
// the DOM-free game layer) and from the repo-wide lint; reached only by tests/lint/boundaries.
import { Application } from 'pixi.js';
import { palette } from '@theme/tokens';

export const renderer = Application;
export const token = palette;
export const width = window.innerWidth;
export const roll = Math.random();
export const stamp = Date.now();
