import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import { defineConfig, globalIgnores } from 'eslint/config';

const BROWSER_GLOBALS = [
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location',
  'history', 'screen', 'performance', 'fetch', 'alert',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval',
];

export default defineConfig([
  // The boundary fixtures are deliberate violations. They are excluded from the repo-wide
  // lint and reached only by tests/lint/boundaries.test.ts, which lints them with
  // `ignore: false` precisely to assert that they are rejected.
  globalIgnores([
    'dist', 'build', 'coverage', 'playwright-report', 'test-results', 'ios', 'android', 'design',
    'src/game/__fixtures__/**',
  ]),

  {
    files: ['**/*.js'],
    extends: [js.configs.recommended],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module' },
  },

  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.strictTypeChecked,
      reactHooks.configs.flat['recommended-latest'],
    ],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },

  // The simulation is pure. It may not reach for the renderer, the shell, persistence,
  // theming, any framework, any browser global, or any source of nondeterminism.
  {
    files: ['src/game/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [
          {
            group: ['@render/*', '@app/*', '@progress/*', '@theme/*',
                    '**/render/**', '**/app/**', '**/progress/**', '**/theme/**'],
            message: 'src/game is the pure simulation. It must not depend on rendering, UI, persistence or theming.',
          },
          {
            group: ['react', 'react-dom', 'react-router', 'react-router-dom',
                    '@ionic/*', 'pixi.js', 'pixi.js/*', '@capacitor/*'],
            message: 'src/game must not depend on React, Ionic, Pixi or Capacitor.',
          },
        ],
      }],
      'no-restricted-globals': ['error', ...BROWSER_GLOBALS.map((name) => ({
        name,
        message: 'src/game must not touch browser globals. Pass what you need in as an argument.',
      }))],
      'no-restricted-properties': ['error',
        { object: 'Math', property: 'random', message: 'Use createRng from @game/rng. Determinism is a requirement.' },
        { object: 'Math', property: 'hypot', message: 'Math.hypot is implementation-approximated. Use distance() from @game/state.' },
        { object: 'Date', property: 'now', message: 'The simulation never reads wall-clock time. dt is passed in.' },
        { object: 'globalThis', property: 'window', message: 'src/game must not touch browser globals.' },
      ],
    },
  },

  {
    files: ['src/render/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['@app/*', '**/app/**'], message: 'src/render must not depend on the React shell.' }],
      }],
    },
  },

  // The boundary fixtures sit under src/game/ so the block above reaches them: they are what
  // tests/lint/boundaries.test.ts lints, and the point of that test is to prove the real rules
  // fire rather than a copy of them kept in step by hand. Nothing here restates a restriction —
  // this block only takes away the type information, since the fixtures are deliberately
  // outside both tsconfig projects and `projectService` would refuse to parse them otherwise.
  {
    files: ['src/game/__fixtures__/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: false } },
    rules: {
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
]);
