# Body Defense Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build Body Defense as a production Ionic React 8 + React 19 + PixiJS v8 game — three cases perfected, mechanics corrected where the prototype is wrong, every gameplay number tunable, a dev tuning panel driving a live simulation — with a fully runnable web target and a committed (Mac-completable) Capacitor 7 iOS target.

**The prototype is a reference, not a specification.** `design/Body Defense Prototype.dc.html` showcases sample gameplay. Its mechanics vocabulary, art direction, palette and copy rules are the design and carry forward faithfully. Its numbers seed `content/` as a considered starting point that playtesting will move. Its behavioural quirks are judged on whether they make a better game (spec §5.1); each judgement is recorded in the Decisions table below.

**Architecture:** Four layers with one-way dependencies — `src/game/` is a pure TypeScript simulation with no DOM, React, Pixi or browser globals; `src/render/` drives Pixi imperatively and reads sim state; `src/app/` is the Ionic React shell whose tree stops at the `<canvas>`; `src/progress/` is a persistence port with localStorage and Capacitor Preferences adapters. The simulation runs on a fixed 1/60 s timestep accumulator with a seeded mulberry32 PRNG, so a run is reproducible and behaviour is identical at 60 Hz and 120 Hz.

**Tech Stack:** React 19.2 · @ionic/react 8.8 · @ionic/react-router 8.8 (requires react-router-dom 5.3) · TypeScript 5.9 · Vite 7.3 · PixiJS 8.19 · Vitest 4.1 · Playwright 1.62 · Capacitor 7.6 · ESLint 10 + typescript-eslint 8.65

---

## Global Constraints

Every task's requirements implicitly include this section.

**Layering**
- `src/game/` must not import from `render/`, `app/`, `progress/` or `theme/`, and must not reference React, Pixi, Ionic, Capacitor or any browser global. Enforced by an ESLint config block **and** by `tsconfig.game.json`, which compiles `src/game/` with `"lib": ["ES2022"]` (no DOM) and `"types": []`.
- `src/render/` must not import from `app/`.
- Dependency direction: `app → render → game`, `app → progress → game`, `theme → game` (for the `PaletteToken` vocabulary only).

**Simulation**
- Fixed timestep. `STEP_SECONDS = 1 / 60`. Never a variable `dt`. Never `Date.now()`, never `performance.now()` inside `src/game/`.
- Seeded PRNG only. `Math.random()` is banned in `src/game/` by lint rule.
- `Math.hypot` is banned in `src/game/` — the ECMAScript spec permits implementation-defined approximation, which breaks the golden-run test. Use `distance()` from `src/game/state.ts`, which is `Math.sqrt(dx * dx + dy * dy)`.
- Gameplay numbers live in `content/` and are **tunable**. The prototype's values seed them; playtesting moves them. No magic number in a system — every rate, radius, cost and threshold is a named content constant.
- Entity iteration order is load-bearing for determinism. Towers iterate in placement order, enemies in spawn order, split children are appended. Never sort, never iterate a `Map`/`Set` where order affects gameplay.

**Testing doctrine (spec §9)**
- **Tests assert behaviour, not balance.** "A tagged biofilm takes full damage while an untagged one takes reduced damage" is a mechanic — test it. "A biofilm has 120 hp" is tuning — never assert it as a literal. Test expectations that depend on a gameplay number **derive it from the content constant** (`PATHOGENS.film.hp - DEFENDERS.phago.dps` , never `120 - 15`), so a balance pass moves every number in `content/` without turning the suite red.
- The golden-run hash is the one exception: a reproducibility net stored as a Vitest snapshot, re-blessed with one command (`npx vitest run src/game/golden.test.ts -u`) whenever tuning deliberately changes the run. The snapshot diff is reviewed like any other change.
- Content is validated for **structure, never values**: references resolve, wave tables are non-empty, paths have ≥2 points, spots lie on the board. There is deliberately no test that fails when a gameplay number changes.

**Rendering**
- PixiJS driven imperatively. React renders one `<div>` host; Pixi owns everything inside. Not `@pixi/react`.
- Board at 60 Hz reading sim state directly. HUD at ~10 Hz via `useSyncExternalStore` over a throttled snapshot.
- Procedural flat vector shapes from `src/render/shapes.ts`. No sprite atlas, no binary art assets.

**Design system**
- Palette in oklch as CSS custom properties named by role. The five spec roles are `--threat oklch(.66 .15 25)`, `--frontline oklch(.66 .15 195)`, `--support oklch(.7 .14 145)`, `--control oklch(.45 .14 320)`, `--energy oklch(.78 .13 80)`. Neutrals: desk paper `#F4EFE6`, screen paper `#FBF7F0`, tissue field `oklch(.95 .012 40)`, ink `#2C2A28`. Night set defined and unused.
- Type: Outfit for words, DM Mono for every number and all-caps label. Self-hosted via `@fontsource-variable/outfit` and `@fontsource/dm-mono` — no Google Fonts request, no committed font binaries.
- Motion: sheets rise 14 px over 250 ms; nothing slides sideways; nothing bounces; only threats pulse; kills are instant with no death animation; the simulation pauses when the page is hidden.
- Copy: no exclamation marks, no emoji, never scold the player. Headlines physical, not clinical.

**Content naming policy — carried over verbatim**
- Tier 1 everyday illnesses, freely named. Tier 2 named only because the mechanic *is* the real mechanic. Tier 3 invented strains, never a real outbreak. No real outbreak is ever framed as an attack. No bioterror framing anywhere.

**Platform**
- `npx cap add ios` requires macOS and Xcode. It cannot run on this Windows machine. Commit everything that does not require Xcode; document the single Mac command.

---

## Decisions On The Prototype's Quirks

Read this before starting. The rule (spec §5.1): quirks that are *surprising but good* are kept and made deliberate; quirks that are *merely broken* are repaired. Nothing is preserved for fidelity's own sake. Every §5.1 fix gets a test proving the old behaviour is gone (spec success criterion 4).

| # | Prototype behaviour | Judgement |
|---|---|---|
| D1 | `soft(e, def)` (line 669) declares a `def` parameter it never uses. | Dead parameter, drop it: `armourMultiplier(state, enemy)` — state because the Biofilm serum effect (D22) reads immunity. |
| D2 | Tetanus shield keys off `this.spawnFirst`, an instance field never reset in `startCase` (lines 609–610). Replaying a case silently loses the shield. | **Fix (spec §5.1).** `shieldedWave: number \| null` in sim state, reset with the case. Test: the shield still bounces after a case restart. |
| D3 | Bleed is `if (energy > 0) energy -= 2` (line 619), so energy can settle at −1; only the display clamps. | **Fix (spec §5.1).** Clamp at the source: `energy = Math.max(0, energy - BLEED_AMOUNT)`. A currency that goes negative is a bug wearing a display workaround. Test: energy at 1 bleeds to exactly 0. |
| D4 | `cleared` is `cleared.concat([c.id])` — a repeat clear would duplicate. | **Fix (spec §5.1).** Ordered unique list; append only if absent. |
| D5 | Result sheet always shows `+50`, including on case clear where +180 is banked (lines 571, 1101). | **Fix (spec §5.1).** Report what was actually awarded: `+WAVE_CLEAR_ENERGY` on a held wave, `+CASE_CLEAR_BANK` on a clear, `0` on a loss. |
| D6 | `film` immunity is never incremented — the strain bump is a two-way `illness === 'virus' ? 'virus' : 'staph'` branch (line 569) — so Biofilm serum permanently shows 0/3. | **Fix (spec §5.1).** A visible goal the player cannot reach is a broken promise. Each case declares `credits: StrainKey` in its content entry; `clearCase` increments that strain. Seed assignment: forearm → `staph`, throat → `virus`, stomach → `film` (its waves are the biofilm-heavy ones). A structural test asserts every displayed strain vaccine is credited by at least one case (spec criterion 6). **The stomach → film assignment is my call — flag to the user.** |
| D7 | First run is day 4 / bank 520 / staph 1 (line 466); "Start a new body" is day 1 / 240 / zero (line 580). | **Ruled by the user:** day-4 was demo staging. One fresh profile — day 1, bank 240, no immunity — defined once (`FRESH_PROFILE` in `rules.ts` → `createFreshProfile()`), used by both first run and reset. Applied throughout. |
| D8 | Poison damages every non-clot tower including memory cells (line 660), while toxin stun exempts clot **and** mem (line 655). | **Keep, on merit.** The asymmetry is coherent: stun resistance is the memory cell's stated perk ("Toxins cannot stun it"), while the poison case rule harms every living cell — only the inert clot is exempt. Full poison immunity would make Learn strictly dominant in the stomach case. |
| D9 | The `held` list is built before movement but a grab lands mid-defender-pass, so a newly engulfed enemy is not frozen until the next step (lines 626–630, 687). | **Fix (spec §5.1).** Invisible at 60 Hz, indefensible at any other rate. A dedicated `acquireHolds` pass runs before movement: phagocytes grab first, movement then freezes what was grabbed, the defender pass only digests. Test: an enemy does not advance on the step it is engulfed. |
| D10 | Clot wear is applied once per enemy inside the zone, so N bodies wear it N × faster. | **Keep, and make it deliberate (spec §5.1).** Load-proportional wear is the more interesting mechanic — a clot buckling under pressure reads well. It is a stated rule (asset sheet line 330 "13 / sec per body"), a named tunable (`DEFENDERS.clot.wear`, per body), a documented intent comment in `movement.ts`, and player-visible copy: the clot's brief blurb says the busier the lane, the faster it fails. |
| D11 | Enemies that leak are pushed to `dead` before the death pass, so they yield no energy and no kill count. | **Keep, on merit.** A pathogen that got through is a failure; paying a bounty for it would mute the sting of a leak. Now stated in a test name rather than emergent. |
| D12 | `2×` speed multiplies `dt`. | The accumulator input is multiplied by 2; `STEP_SECONDS` never changes. Determinism preserved. |
| D13 | `beams` and `tower.flash` are render-only timers living in sim state. | Keep them in sim state — plain numbers, no DOM, and the golden hash then covers visual feedback. Colour is **not** in sim state; `Beam.source` is a defender kind and the renderer resolves the colour. |
| D14 | Wave tables are object literals; `Object.keys` order feeds the shuffle. | Model waves as `readonly WaveEntry[]`. Determinism requires a defined order; the array preserves the prototype's literal order as the seed composition. Wave tables are tuning data — the panel edits them. |
| D15 | Both boards are SVG. The spec names Pixi only for the fight board. | The body map is React + inline SVG (static, no per-frame animation). Pixi is instantiated only on `/play/:caseId`. |
| D16 | Toxin stun radius 40, poison radius 42, poison DPS 5/10 are inline literals (lines 656, 662). | Promote to named constants in `src/game/content/rules.ts` with values verbatim. |
| D17 | Spec §4 lists six content files. | A seventh, `rules.ts`, holds the run-level and hazard constants that belong to no single entity table. **Flagged.** |
| D18 | Defender colours for `nk`, `mast`, `mem` and all six pathogen colours fall outside the five role tokens. | Extend the role vocabulary with verb/role names — `--execute`, `--burst`, `--learn`, `--armoured`, `--splitter`, `--fungal`, `--chemical`, `--resistant`. Still named by role, never by decoration. |
| D19 | Pixi needs numeric colours; the palette is oklch, which Pixi's colour parser does not accept. | `src/theme/oklch.ts` implements `oklchToSrgbHex()` (Ottosson matrices). Every colour is written once, as oklch, in `src/theme/tokens.ts`. |
| D20 | Vite 8 shipped recently. | Use Vite 7.3 + `@vitejs/plugin-react` 5.2 + Vitest 4.1. Vitest 4 supports Vite 6/7/8; Vite 7 is the mature choice and carries no downside here. **Flagged.** |
| D21 | `@ionic/react-router` 8.8 peer-depends on `react-router-dom@^5.0.1`, which predates React 19. | Use `react-router-dom@5.3.4` + `@types/react-router-dom@5.3.3`. Phase 1 explicitly verifies routing and a clean console under React 19. If it breaks, the documented fallback is pinning `react@18.3.1` / `react-dom@18.3.1` — record which was used in the README. |
| D22 | The Biofilm serum's stated effect — "Armour drops — phagocytes bite properly" — is never implemented; earning it (once D6 makes it earnable) would change nothing. | **Fix — consequence of D6.** An earned vaccine with no effect is the same broken promise. `armourMultiplier(state, enemy)` treats biofilm as unarmoured when `immunity.film >= IMMUNITY_MAX`, mirroring how the Flu B vaccine already suppresses splitting. Test: a maxed film immunity makes an untagged biofilm take full damage. |
| D23 | The brief's shield line and the case-clear immunity credit both derived from the same two-way illness branch. | The brief's shield/progress line now reads the case's `credits` strain and looks its display copy up from `STRAIN_ROWS` — data-driven, no per-strain branch in the page. |
| D24 | An earlier draft froze the golden hash as an inline constant that must "never change". | **Superseded by spec §9.** The hash is a Vitest snapshot: `toMatchSnapshot()`. Re-bless is one command — `npx vitest run src/game/golden.test.ts -u` — and the snapshot diff is reviewed like any other change. Presentation phases must still never change it; tuning changes it deliberately and re-blesses. |

---

## File Structure

```
towerdefense-body-game/
├── .github/workflows/ci.yml
├── design/                          # existing reference artifacts, untouched
├── docs/superpowers/{specs,plans}/
├── public/
├── index.html
├── package.json  vite.config.ts  eslint.config.js  playwright.config.ts
├── tsconfig.json  tsconfig.app.json  tsconfig.node.json  tsconfig.game.json
├── capacitor.config.ts
├── src/
│   ├── main.tsx
│   ├── game/                        # pure TypeScript — no DOM lib
│   │   ├── types.ts                 # every sim type; the union vocabulary
│   │   ├── rng.ts                   # createRng, waveSeed
│   │   ├── path.ts                  # compilePath, positionAt
│   │   ├── state.ts                 # createSimState, distance
│   │   ├── step.ts                  # one fixed step; system ordering
│   │   ├── loop.ts                  # GameLoop: accumulator + HUD snapshot store
│   │   ├── commands.ts              # player intents as pure state transitions
│   │   ├── progression.ts           # Profile transitions and derived rows
│   │   ├── hash.ts                  # hashState for the golden run
│   │   ├── content/
│   │   │   ├── defenders.ts pathogens.ts cases.ts vaccines.ts body.ts later.ts rules.ts index.ts
│   │   │   └── tuning.ts            # dev-only mutation + export of live content values
│   │   └── systems/
│   │       ├── spawn.ts movement.ts hazards.ts targeting.ts damage.ts economy.ts deaths.ts
│   ├── render/
│   │   ├── BoardRenderer.ts shapes.ts viewport.ts colors.ts
│   │   └── layers/ PathLayer.ts TowerLayer.ts EnemyLayer.ts BeamLayer.ts
│   ├── progress/
│   │   ├── ProgressRepository.ts parseProfile.ts
│   │   ├── LocalStorageProgressRepository.ts PreferencesProgressRepository.ts
│   │   └── createProgressRepository.ts
│   ├── theme/
│   │   ├── tokens.ts oklch.ts variables.css typography.css
│   └── app/
│       ├── App.tsx
│       ├── pages/ MapPage.tsx BriefPage.tsx FightPage.tsx ImmunityPage.tsx SeasonPage.tsx
│       ├── components/ BoardCanvas.tsx EnergyPill.tsx TissuePips.tsx DefenderDock.tsx
│       │               FeverButton.tsx ResultSheet.tsx RiseSheet.tsx BodyMap.tsx
│       │               SaveErrorBanner.tsx
│       ├── state/ ProfileProvider.tsx useGameLoop.ts useHud.ts
│       └── dev/ TuningPanel.tsx     # dev-only; dynamically imported, absent from production
└── tests/
    ├── lint/boundaries.test.ts  lint/fixtures/game-clean.ts  lint/fixtures/game-violation.ts
    └── e2e/play.spec.ts
```

Unit tests live beside their subject as `*.test.ts` (Vitest default discovery). `tests/` holds only the two things that are not unit tests of a module: the lint-boundary meta-test and Playwright specs.

---

## Phase List

| Phase | Deliverable |
|---|---|
| 0 | Toolchain, layer enforcement (lint + no-DOM tsconfig), CI |
| 1 | Ionic shell, theme tokens, fonts, five routes, safe areas |
| 2 | Content data modules (prototype values as seeds) + structural invariants test |
| 3 | Sim foundations: types, RNG, path, state, fixed-step loop, spawn and movement |
| 4 | Pixi board renderer walking skeleton |
| 5 | Defenders: engulf, block, tag, execute |
| 6 | Defenders: burst, learn; pathogen rules |
| 7 | Case rules: wound bleed, tetanus shield, poison |
| 8 | Run flow: waves, fever, tissue, results, clear — golden snapshot blessed |
| 9 | Fight screen: HUD store, dock, placement, sheets |
| 10 | Tuning panel: live content editing, module export, tree-shaken from production |
| 11 | Persistence port and adapters |
| 12 | Map, Brief, Immunity, Season screens |
| 13 | Capacitor iOS target and safe areas |
| 14 | E2E, final gates |

After Phase 8, the golden snapshot changes only for a deliberate simulation change, re-blessed with `npx vitest run src/game/golden.test.ts -u` and reviewed as part of the diff. A presentation phase (9, 11–14) that changes it has leaked into the simulation — that is a bug, not a re-bless.

---

## Phase 0 — Toolchain, layer enforcement, CI

> **BUILT AND COMMITTED.** This phase shipped; the listings below are updated to match what is actually in the repo where reality differed from the draft (exact versions, ESLint flat-config details, and `rng.ts` landing here early). Read it as a record, not a to-do.

**Why first:** the layer boundary is the constraint the whole architecture rests on. Building it before there is any code to violate means it is never retrofitted.

**Files:**
- Create: `package.json`, `vite.config.ts`, `index.html`, `src/main.tsx`, `src/app/App.tsx`
- Create: `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, `tsconfig.game.json`
- Create: `eslint.config.js`, `vitest.setup.ts`
- Create: `tests/lint/boundaries.test.ts`, `tests/lint/fixtures/game-clean.ts`, `tests/lint/fixtures/game-violation.ts`
- Create: `.github/workflows/ci.yml`
- Create: `src/game/rng.ts` + `rng.test.ts` (landed here as-built; Phase 3 consumes it)

**Interfaces:**
- Consumes: nothing.
- Produces: npm scripts `dev`, `build`, `lint`, `typecheck`, `typecheck:game`, `test`, `test:e2e`, `verify`. Path aliases `@game/*`, `@render/*`, `@app/*`, `@progress/*`, `@theme/*`.

- [ ] **Step 1: Scaffold Vite + React + TypeScript**

```bash
npm create vite@latest . -- --template react-ts
```

Answer "Ignore files and continue" if prompted about the existing `design/` and `docs/` directories. Then remove the template demo content:

```bash
rm -f src/App.css src/index.css src/App.tsx src/assets/react.svg public/vite.svg
```

- [ ] **Step 2: Install dependencies at the exact versions this plan was validated against**

```bash
npm i react@19.2.8 react-dom@19.2.8 \
      @ionic/react@8.8.15 @ionic/react-router@8.8.15 \
      react-router@5.3.4 react-router-dom@5.3.4 \
      pixi.js@8.19.0 \
      @capacitor/core@7.6.8 @capacitor/preferences@7.0.4 \
      @fontsource-variable/outfit@5.3.0 @fontsource/dm-mono@5.3.0

npm i -D typescript@5.9.3 vite@7.3.6 @vitejs/plugin-react@5.2.0 vite-tsconfig-paths@6.1.1 \
         vitest@4.1.10 jsdom@29.1.1 @testing-library/react@16.3.2 @testing-library/jest-dom@6.6.3 \
         @playwright/test@1.62.0 \
         eslint@10.8.0 typescript-eslint@8.65.0 @eslint/js@10.0.1 eslint-plugin-react-hooks@7.1.1 \
         @types/react@19.2.2 @types/react-dom@19.2.1 @types/react-router-dom@5.3.3 @types/node@24.10.1 \
         @capacitor/cli@7.6.8 @capacitor/ios@7.6.8
```

TypeScript is pinned to 5.9 rather than 7.x because `typescript-eslint@8.65` declares `typescript: ">=4.8.4 <6.1.0"`. As-built corrections to the draft: `@eslint/js` has no 10.8.0 — its latest 10.x is 10.0.1; `eslint-plugin-react-hooks` needs 7.1.1 because 6.x caps its eslint peer at 9.

- [ ] **Step 3: Write `vite.config.ts` and `vitest.setup.ts`**

```ts
/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'tests/lint/**/*.test.ts'],
  },
});
```

```ts
import '@testing-library/jest-dom/vitest';
```

- [ ] **Step 4: Write the four tsconfigs**

`tsconfig.json`:

```json
{
  "files": [],
  "references": [{ "path": "./tsconfig.app.json" }, { "path": "./tsconfig.node.json" }]
}
```

`tsconfig.app.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "composite": true,
    "tsBuildInfoFile": "./node_modules/.tmp/tsconfig.app.tsbuildinfo",
    "baseUrl": ".",
    "paths": {
      "@game/*": ["src/game/*"],
      "@render/*": ["src/render/*"],
      "@app/*": ["src/app/*"],
      "@progress/*": ["src/progress/*"],
      "@theme/*": ["src/theme/*"]
    }
  },
  "include": ["src", "tests"]
}
```

`tsconfig.node.json` keeps the Vite template defaults, with `"include": ["vite.config.ts", "vitest.setup.ts", "playwright.config.ts", "capacitor.config.ts"]`.

`tsconfig.game.json` is the compiler-level layer enforcement. `lib` has no DOM and `types` is empty, so `document`, `window`, `localStorage` and `process` become type errors inside `src/game/`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "exactOptionalPropertyTypes": true,
    "verbatimModuleSyntax": true,
    "skipLibCheck": true,
    "noEmit": true,
    "types": [],
    "baseUrl": ".",
    "paths": { "@game/*": ["src/game/*"] }
  },
  "include": ["src/game/**/*.ts"]
}
```

`skipLibCheck` is required here (as-built): without it the compiler type-checks dependency `.d.ts` files that assume DOM lib types, and the no-DOM gate drowns in third-party errors. Note `src/game/**/*.test.ts` is included here too, so a test that reaches for `document` also fails this gate. Vitest globals are unavailable under `"types": []`, so sim tests must use explicit `import { describe, expect, it } from 'vitest'`. That is the house style for every test in this plan.

- [ ] **Step 5: Write `eslint.config.js` with the layer boundary**

As-built: `defineConfig` from `eslint/config` (the `tseslint.config` helper is deprecated under eslint 10), `eslint-plugin-react-hooks` 7.x exposes its flat config at `configs.flat['recommended-latest']`, and the fixtures are globally ignored so normal lint runs skip them — the meta-test lints them explicitly with `ignore: false`.

```js
import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

const BROWSER_GLOBALS = [
  'window', 'document', 'localStorage', 'sessionStorage', 'navigator', 'location',
  'history', 'screen', 'performance', 'fetch', 'alert',
  'requestAnimationFrame', 'cancelAnimationFrame', 'setTimeout', 'setInterval',
];

export default defineConfig(
  {
    ignores: [
      'dist', 'coverage', 'playwright-report', 'test-results', 'ios', 'android', 'design',
      'tests/lint/fixtures',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  reactHooks.configs.flat['recommended-latest'],

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

  {
    files: ['tests/lint/fixtures/**/*.ts'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { parserOptions: { projectService: false, project: false } },
    rules: {
      'no-restricted-imports': ['error', {
        patterns: [{ group: ['pixi.js', 'react', '@render/*'], message: 'boundary' }],
      }],
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
    },
  },
);
```

The fixture block uses `extends: [tseslint.configs.disableTypeChecked]` rather than an object spread — a spread's `rules` key would be clobbered by the block's own `rules`, silently re-enabling type-checked linting on the untyped fixtures. It deliberately mirrors the `src/game` restriction rather than sharing it, because the fixtures must lint without type information. If you change the `src/game` import rule, change the fixture rule too — the meta-test in Step 7 is what tells you the mechanism still works, not that the two lists agree.

- [ ] **Step 6: Write the boundary fixtures**

`tests/lint/fixtures/game-violation.ts`:

```ts
import { Application } from 'pixi.js';

export const forbidden = Application;
```

`tests/lint/fixtures/game-clean.ts`:

```ts
export const allowed = (a: number, b: number): number => a + b;
```

- [ ] **Step 7: Write the failing test that proves the rule fires**

`tests/lint/boundaries.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { ESLint } from 'eslint';

// ignore: false — the fixtures are globally ignored so `npm run lint` skips them;
// this test lints them anyway to prove the boundary rule fires.
const eslint = new ESLint({ cwd: process.cwd(), ignore: false });

describe('layer boundary lint rule', () => {
  it('rejects a game-layer module importing Pixi', async () => {
    const [result] = await eslint.lintFiles(['tests/lint/fixtures/game-violation.ts']);
    expect(result?.errorCount).toBeGreaterThan(0);
    expect(result?.messages.map((m) => m.ruleId)).toContain('no-restricted-imports');
  });

  it('accepts a game-layer module with no cross-layer import', async () => {
    const [result] = await eslint.lintFiles(['tests/lint/fixtures/game-clean.ts']);
    expect(result?.errorCount).toBe(0);
  });
});
```

- [ ] **Step 8: Run the test to verify it fails for the right reason**

Temporarily comment out the `no-restricted-imports` rule in the fixtures config block, then run:

Run: `npx vitest run tests/lint/boundaries.test.ts`
Expected: FAIL on the first test — `expected 0 to be greater than 0`. This is the evidence that the rule, not the file's existence, is what makes the test pass. Restore the rule.

- [ ] **Step 9: Run the test to verify it passes**

Run: `npx vitest run tests/lint/boundaries.test.ts`
Expected: PASS, 2 tests.

- [ ] **Step 10: Write a minimal `index.html`, `src/main.tsx` and `src/app/App.tsx`**

`index.html`:

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="viewport-fit=cover, width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>Body Defense</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

`src/main.tsx`:

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@app/App';

const host = document.getElementById('root');
if (!host) throw new Error('Root element #root is missing from index.html');
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

`src/app/App.tsx`, a placeholder replaced in Phase 1:

```tsx
export function App() {
  return <main>Body Defense</main>;
}
```

- [ ] **Step 11: Add npm scripts to `package.json`**

```json
{
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "tsc -b && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "typecheck": "tsc -b",
    "typecheck:game": "tsc -p tsconfig.game.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:e2e": "playwright test",
    "verify": "npm run lint && npm run typecheck && npm run typecheck:game && npm run test && npm run build"
  }
}
```

- [ ] **Step 12: Run the full gate**

Run: `npm run verify`
Expected: zero eslint problems, zero TypeScript errors from both projects, 2 passing tests, `dist/` produced.

- [ ] **Step 13: Write CI**

`.github/workflows/ci.yml`:

```yaml
name: CI
on:
  push:
    branches: ['**']
  pull_request:

jobs:
  verify:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '24'
          cache: npm
      - run: npm ci
      - run: npm run lint
      - run: npm run typecheck
      - run: npm run typecheck:game
      - run: npm run test
      - run: npm run build
      # enabled in Phase 14
      # - run: npx playwright install --with-deps chromium
      # - run: npm run test:e2e
```

- [ ] **Step 14: Commit**

```bash
git add -A
git commit -m "chore: scaffold Vite/React/TS toolchain with enforced layer boundaries"
```

**Verification command:** `npm run verify`
**Passing looks like:** zero eslint problems, zero TypeScript errors from both projects, 2 passing tests, a successful production build.

---

## Phase 1 — Ionic shell, theme tokens, fonts, five routes

**Files:**
- Create: `src/theme/oklch.ts`, `src/theme/oklch.test.ts`, `src/theme/tokens.ts`, `src/theme/tokens.test.ts`, `src/theme/variables.css`, `src/theme/typography.css`
- Create: `src/app/pages/MapPage.tsx`, `BriefPage.tsx`, `FightPage.tsx`, `ImmunityPage.tsx`, `SeasonPage.tsx`
- Modify: `src/app/App.tsx`, `src/main.tsx`
- Port from: asset sheet lines 30–105 (palette), 107–204 (type and radius ladder); prototype lines 14–20 (keyframes), 367–372 and 426–431 and 457–461 (colour values)

**Interfaces:**
- Produces: `PaletteToken` (string union), `palette: Record<PaletteToken, { css: string; hex: number }>`, `NEUTRALS`, `NIGHT`, `oklchToSrgbHex(css: string): number`. Phase 4's renderer consumes `palette[token].hex`.

- [ ] **Step 1: Write the failing test for oklch → sRGB conversion**

`src/theme/oklch.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { oklchToSrgbHex } from './oklch';

describe('oklchToSrgbHex', () => {
  it('maps the white anchor', () => {
    expect(oklchToSrgbHex('oklch(1 0 0)')).toBe(0xffffff);
  });

  it('maps the black anchor', () => {
    expect(oklchToSrgbHex('oklch(0 0 0)')).toBe(0x000000);
  });

  it('maps the sRGB red anchor', () => {
    expect(oklchToSrgbHex('oklch(0.62796 0.25768 29.234)')).toBe(0xff0000);
  });

  it('ignores a trailing alpha component', () => {
    expect(oklchToSrgbHex('oklch(1 0 0 / 0.5)')).toBe(0xffffff);
  });

  it('rejects a string that is not oklch', () => {
    expect(() => oklchToSrgbHex('#ff0000')).toThrow(/oklch/i);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/theme/oklch.test.ts`
Expected: FAIL — `Failed to resolve import "./oklch"`.

- [ ] **Step 3: Implement `src/theme/oklch.ts`**

```ts
const OKLCH = /^oklch\(\s*([\d.]+%?)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*[\d.]+\s*)?\)$/i;

function gamma(channel: number): number {
  const c = Math.min(1, Math.max(0, channel));
  return c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
}

export function oklchToSrgbHex(value: string): number {
  const match = OKLCH.exec(value.trim());
  if (!match) throw new Error(`Not an oklch colour: ${value}`);
  const [, rawL = '0', rawC = '0', rawH = '0'] = match;

  const lightness = rawL.endsWith('%') ? Number.parseFloat(rawL) / 100 : Number.parseFloat(rawL);
  const chroma = Number.parseFloat(rawC);
  const hue = (Number.parseFloat(rawH) * Math.PI) / 180;

  const a = chroma * Math.cos(hue);
  const b = chroma * Math.sin(hue);

  const l = (lightness + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (lightness - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (lightness - 0.0894841775 * a - 1.291485548 * b) ** 3;

  const red = gamma(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const green = gamma(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const blue = gamma(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);

  return (Math.round(red * 255) << 16) | (Math.round(green * 255) << 8) | Math.round(blue * 255);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/theme/oklch.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Write `src/theme/tokens.ts`**

Every colour in the application is written exactly once, here, as oklch. Values transcribed from asset sheet lines 38–74 (roles), 82–85 (neutrals), 94–97 (night set), and prototype lines 367–372 (defenders), 426–431 (pathogens), 457–461 and 832–833 (map and vessel).

```ts
import { oklchToSrgbHex } from './oklch';

export type PaletteToken =
  | 'threat' | 'frontline' | 'support' | 'control' | 'energy'
  | 'execute' | 'burst' | 'learn'
  | 'armoured' | 'splitter' | 'fungal' | 'chemical' | 'resistant'
  | 'fever' | 'notReached' | 'vesselCasing' | 'vesselLumen' | 'tissueField' | 'core';

const OKLCH: Record<PaletteToken, string> = {
  threat: 'oklch(0.66 0.15 25)',
  frontline: 'oklch(0.66 0.15 195)',
  support: 'oklch(0.7 0.14 145)',
  control: 'oklch(0.45 0.14 320)',
  energy: 'oklch(0.78 0.13 80)',
  execute: 'oklch(0.55 0.16 265)',
  burst: 'oklch(0.62 0.16 350)',
  learn: 'oklch(0.5 0.1 210)',
  armoured: 'oklch(0.58 0.16 15)',
  splitter: 'oklch(0.62 0.15 300)',
  fungal: 'oklch(0.6 0.11 115)',
  chemical: 'oklch(0.52 0.13 45)',
  resistant: 'oklch(0.42 0.13 10)',
  fever: 'oklch(0.58 0.16 15)',
  notReached: 'oklch(0.9 0.014 60)',
  vesselCasing: 'oklch(0.87 0.05 20)',
  vesselLumen: 'oklch(0.93 0.03 20)',
  tissueField: 'oklch(0.95 0.012 40)',
  core: 'oklch(0.78 0.13 80)',
};

export const NEUTRALS = {
  deskPaper: '#F4EFE6',
  screenPaper: '#FBF7F0',
  ink: '#2C2A28',
} as const;

/** Reserved for the Lymph Lines direction. Defined so nobody reinvents it; used nowhere. */
export const NIGHT = {
  base: '#20232B',
  raised: 'oklch(0.24 0.012 260)',
  line: 'oklch(0.34 0.02 260)',
  ink: '#F2F4F8',
} as const;

export const palette = Object.fromEntries(
  Object.entries(OKLCH).map(([token, css]) => [token, { css, hex: oklchToSrgbHex(css) }]),
) as Record<PaletteToken, { readonly css: string; readonly hex: number }>;
```

- [ ] **Step 6: Write `src/theme/variables.css`**

```css
:root {
  --threat: oklch(0.66 0.15 25);
  --frontline: oklch(0.66 0.15 195);
  --support: oklch(0.7 0.14 145);
  --control: oklch(0.45 0.14 320);
  --energy: oklch(0.78 0.13 80);
  --execute: oklch(0.55 0.16 265);
  --burst: oklch(0.62 0.16 350);
  --learn: oklch(0.5 0.1 210);
  --armoured: oklch(0.58 0.16 15);
  --splitter: oklch(0.62 0.15 300);
  --fungal: oklch(0.6 0.11 115);
  --chemical: oklch(0.52 0.13 45);
  --resistant: oklch(0.42 0.13 10);
  --fever: oklch(0.58 0.16 15);
  --not-reached: oklch(0.9 0.014 60);
  --vessel-casing: oklch(0.87 0.05 20);
  --vessel-lumen: oklch(0.93 0.03 20);
  --tissue-field: oklch(0.95 0.012 40);
  --core: oklch(0.78 0.13 80);

  --desk-paper: #F4EFE6;
  --screen-paper: #FBF7F0;
  --ink: #2C2A28;
  --muted: oklch(0.5 0.01 60);
  --label: oklch(0.58 0.01 60);
  --surface: oklch(0.95 0.008 70);
  --surface-strong: oklch(0.93 0.008 70);

  --radius-tile: 9px;
  --radius-chip: 14px;
  --radius-control: 18px;
  --radius-card: 22px;
  --radius-sheet: 30px;

  --rise-distance: 14px;
  --rise-duration: 250ms;

  --safe-top: env(safe-area-inset-top, 0px);
  --safe-bottom: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 7: Write the test that keeps `tokens.ts` and `variables.css` in agreement**

`src/theme/tokens.test.ts`:

```ts
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { palette, type PaletteToken } from './tokens';

const css = readFileSync(new URL('./variables.css', import.meta.url), 'utf8');

function cssVariableName(token: string): string {
  return `--${token.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
}

describe('palette', () => {
  it('declares every token as a CSS custom property with an identical value', () => {
    for (const [token, { css: value }] of Object.entries(palette)) {
      const declaration = `${cssVariableName(token)}: ${value};`;
      expect(css, `variables.css is missing "${declaration}"`).toContain(declaration);
    }
  });

  it('resolves the five spec role tokens to the documented values', () => {
    const roles: Record<string, string> = {
      threat: 'oklch(0.66 0.15 25)',
      frontline: 'oklch(0.66 0.15 195)',
      support: 'oklch(0.7 0.14 145)',
      control: 'oklch(0.45 0.14 320)',
      energy: 'oklch(0.78 0.13 80)',
    };
    for (const [token, value] of Object.entries(roles)) {
      expect(palette[token as PaletteToken].css).toBe(value);
    }
  });
});
```

- [ ] **Step 8: Run the palette tests**

Run: `npx vitest run src/theme/tokens.test.ts`
Expected: PASS, 2 tests. If a token name does not round-trip through `cssVariableName`, fix the CSS custom-property name, not the test.

- [ ] **Step 9: Write `src/theme/typography.css`**

The two keyframes are ported verbatim from prototype lines 18–19. Motion rule: sheets rise 14 px over 250 ms; only threats pulse.

```css
:root {
  --font-words: 'Outfit Variable', system-ui, sans-serif;
  --font-numbers: 'DM Mono', ui-monospace, monospace;
}

body {
  margin: 0;
  font-family: var(--font-words);
  color: var(--ink);
  background: var(--screen-paper);
  -webkit-font-smoothing: antialiased;
}

.mono {
  font-family: var(--font-numbers);
  font-variant-numeric: tabular-nums;
}

@keyframes rise {
  from { opacity: 0; transform: translateY(var(--rise-distance)); }
  to { opacity: 1; transform: translateY(0); }
}

@keyframes pulse {
  0%, 100% { opacity: 0.9; transform: scale(1); }
  50% { opacity: 0.45; transform: scale(1.08); }
}

.rise { animation: rise var(--rise-duration) ease-out; }
.pulse { animation: pulse 1.1s ease-in-out infinite; }

@media (prefers-reduced-motion: reduce) {
  .rise, .pulse { animation: none; }
}
```

- [ ] **Step 10: Write the five pages as named stubs**

`src/app/pages/MapPage.tsx`:

```tsx
import { IonContent, IonPage } from '@ionic/react';

export function MapPage() {
  return (
    <IonPage>
      <IonContent fullscreen>
        <h1>The body</h1>
      </IonContent>
    </IonPage>
  );
}
```

Write the same shape for `BriefPage` (`<h1>Brief</h1>`), `FightPage` (`<h1>Fight</h1>`), `ImmunityPage` (`<h1>Immunity</h1>`) and `SeasonPage` (`<h1>What's coming</h1>`). One file each, so routing can code-split later without restructuring.

- [ ] **Step 11: Write `src/app/App.tsx` with the five routes**

```tsx
import { IonApp, IonRouterOutlet, setupIonicReact } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { Redirect, Route } from 'react-router-dom';

import { MapPage } from './pages/MapPage';
import { BriefPage } from './pages/BriefPage';
import { FightPage } from './pages/FightPage';
import { ImmunityPage } from './pages/ImmunityPage';
import { SeasonPage } from './pages/SeasonPage';

setupIonicReact({ mode: 'ios' });

export function App() {
  return (
    <IonApp>
      <IonReactRouter>
        <IonRouterOutlet>
          <Route exact path="/" component={MapPage} />
          <Route exact path="/brief/:caseId" component={BriefPage} />
          <Route exact path="/play/:caseId" component={FightPage} />
          <Route exact path="/immunity" component={ImmunityPage} />
          <Route exact path="/season" component={SeasonPage} />
          <Route><Redirect to="/" /></Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  );
}
```

- [ ] **Step 12: Wire fonts and CSS in `src/main.tsx`**

```tsx
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@fontsource-variable/outfit';
import '@fontsource/dm-mono/400.css';
import '@fontsource/dm-mono/500.css';

import '@ionic/react/css/core.css';
import '@ionic/react/css/normalize.css';
import '@ionic/react/css/structure.css';
import '@ionic/react/css/typography.css';

import '@theme/variables.css';
import '@theme/typography.css';

import { App } from '@app/App';

const host = document.getElementById('root');
if (!host) throw new Error('Root element #root is missing from index.html');
createRoot(host).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 13: Verify routing under React 19 — this is the D21 risk gate**

Run `npm run dev`, then visit `/`, `/season`, `/immunity`, `/brief/forearm`, `/play/forearm`, and a nonsense path such as `/nope`.
Expected: each renders its heading; `/nope` redirects to `/`; the DevTools console shows no errors and no `defaultProps` warnings originating from `react-router`.

If react-router 5 breaks under React 19, apply the documented fallback: `npm i react@18.3.1 react-dom@18.3.1 @types/react@18.3.12 @types/react-dom@18.3.1`, re-run this step, and record the downgrade and its reason in `README.md`. Do not attempt to move `@ionic/react-router` onto react-router 6 — it does not support it.

- [ ] **Step 14: Verify no network font request**

In DevTools Network, filter for `fonts.googleapis.com` and `fonts.gstatic.com`.
Expected: zero requests. Fonts resolve from `@fontsource*` in dev and from the bundle in production.

- [ ] **Step 15: Run the full gate**

Run: `npm run verify`
Expected: clean lint, clean typechecks, 9 passing tests, successful build.

- [ ] **Step 16: Commit**

```bash
git add -A
git commit -m "feat: Ionic shell with five routes, oklch palette and self-hosted type"
```

**Verification command:** `npm run verify`, plus the manual browser checks in Steps 13–14.
**Passing looks like:** all five routes render, no console errors, no Google Fonts request, all gates green.

---

## Phase 2 — Content data modules and the structural invariants test

**Why now:** every later phase reads these tables. Getting the numbers in, verbatim, with a test that fails when the published asset sheet and the code disagree, means no later phase can quietly drift the balance.

**Files:**
- Create: `src/game/types.ts` (the shared vocabulary only; the sim state types land in Phase 3)
- Create: `src/game/content/defenders.ts`, `pathogens.ts`, `cases.ts`, `vaccines.ts`, `body.ts`, `later.ts`, `rules.ts`, `index.ts`
- Create: `src/game/content/content.invariants.test.ts`
- Modify: `src/theme/tokens.ts` — re-export `PaletteToken` from `@game/types` instead of declaring it
- Port from: prototype lines 366–374 (CELLS, ORDER), 376–404 (CASES), 410–413 (LATER), 416–423 (VACCINES), 425–432 (KINDS), 434–450 (NODES), 452–455 (LINKS); asset sheet lines 206–451 (defenders), 453–625 (pathogens), 627–681 (case types), 828–982 (progression)

**Interfaces:**
- Produces: `DefenderKind`, `PathogenKind`, `CaseId`, `CaseRuleKind`, `StrainKey`, `BodyNodeId`, `PaletteToken`, `DEFENDERS`, `DEFENDER_ORDER`, `PATHOGENS`, `CASES`, `CASE_BY_ID`, `VACCINES`, `BODY_NODES`, `BODY_LINKS`, `LATER`, and the constants in `RULES`.

- [ ] **Step 1: Write `src/game/types.ts` — the shared vocabulary**

This file holds only unions and small shared shapes. Sim state types are added in Phase 3. The unions are hand-written rather than derived from the content tables so that `types.ts` has no dependency on `content/` and exhaustive `switch` narrowing works everywhere.

```ts
export type DefenderKind = 'phago' | 'clot' | 'anti' | 'nk' | 'mast' | 'mem';
export type PathogenKind = 'staph' | 'film' | 'virus' | 'spore' | 'toxin' | 'mrsa';
export type CaseId = 'forearm' | 'throat' | 'stomach';
export type CaseRuleKind = 'wound' | 'virus' | 'poison';
export type StrainKey = 'staph' | 'film' | 'virus';
export type Tier = 1 | 2 | 3;

export type BodyNodeId =
  | 'sinus' | 'throat' | 'lungL' | 'lungR' | 'heart' | 'stomach' | 'gut'
  | 'shoulder' | 'forearm' | 'shoulderR' | 'handR'
  | 'kneeL' | 'kneeR' | 'footL' | 'footR';

export type PaletteToken =
  | 'threat' | 'frontline' | 'support' | 'control' | 'energy'
  | 'execute' | 'burst' | 'learn'
  | 'armoured' | 'splitter' | 'fungal' | 'chemical' | 'resistant'
  | 'fever' | 'notReached' | 'vesselCasing' | 'vesselLumen' | 'tissueField' | 'core';

export type Point = readonly [x: number, y: number];
```

- [ ] **Step 2: Point `src/theme/tokens.ts` at the shared union**

Replace the local `PaletteToken` declaration with a re-export, so the vocabulary has exactly one definition and the dependency runs theme → game:

```ts
import type { PaletteToken } from '@game/types';
export type { PaletteToken };
```

Run: `npm run typecheck && npm run test`
Expected: still green — the union is byte-identical to the one Phase 1 declared.

- [ ] **Step 3: Write `src/game/content/defenders.ts`**

A discriminated union per defender, so `DEFENDERS.phago.dps` type-checks and `DEFENDERS.clot.dps` is a compile error. Seed values transcribed from prototype lines 367–372; labels and unlock tiers from asset sheet lines 214–223. These are starting points for tuning, not commitments — no test may assert them as literals.

```ts
import type { DefenderKind, PaletteToken } from '../types';

interface DefenderBase {
  readonly cost: number;
  readonly range: number;
  readonly label: string;
  readonly unlock: number;
  readonly token: PaletteToken;
}

export type DefenderStats =
  | (DefenderBase & { readonly kind: 'phago'; readonly dps: number; readonly gap: number; readonly streak: number; readonly rest: number })
  | (DefenderBase & { readonly kind: 'clot'; readonly slow: number; readonly wear: number })
  | (DefenderBase & { readonly kind: 'anti'; readonly rate: number; readonly tag: number; readonly dot: number })
  | (DefenderBase & { readonly kind: 'nk'; readonly rate: number; readonly dmg: number; readonly execute: number })
  | (DefenderBase & { readonly kind: 'mast'; readonly rate: number; readonly dmg: number })
  | (DefenderBase & { readonly kind: 'mem'; readonly rate: number; readonly dmg: number; readonly learn: number; readonly cap: number });

export const DEFENDERS: { readonly [K in DefenderKind]: Extract<DefenderStats, { kind: K }> } = {
  phago: { kind: 'phago', cost: 40, range: 56, dps: 15, gap: 0.7, streak: 4, rest: 3.4, label: 'Engulf', unlock: 0, token: 'frontline' },
  clot: { kind: 'clot', cost: 70, range: 62, slow: 0.28, wear: 13, label: 'Block', unlock: 0, token: 'control' },
  anti: { kind: 'anti', cost: 95, range: 94, rate: 1.5, tag: 6, dot: 4, label: 'Tag', unlock: 0, token: 'support' },
  nk: { kind: 'nk', cost: 130, range: 78, rate: 2.4, dmg: 58, execute: 0.35, label: 'Execute', unlock: 0, token: 'execute' },
  mast: { kind: 'mast', cost: 150, range: 54, rate: 1.1, dmg: 11, label: 'Burst', unlock: 1, token: 'burst' },
  mem: { kind: 'mem', cost: 175, range: 82, rate: 1.3, dmg: 12, learn: 2.5, cap: 46, label: 'Learn', unlock: 2, token: 'learn' },
};

/** Dock order, left to right. Prototype line 374. */
export const DEFENDER_ORDER: readonly DefenderKind[] = ['phago', 'clot', 'anti', 'nk', 'mast', 'mem'];

/** Brief-screen copy. Prototype lines 1074–1081. */
export const DEFENDER_BLURBS: { readonly [K in DefenderKind]: { readonly name: string; readonly text: string } } = {
  phago: { name: 'Phagocyte · engulf', text: 'Digests one at a time, then tires — four and it rests.' },
  clot: { name: 'Clot · block', text: 'Everything crawls through, and every body inside wears it down — a crowd destroys it fast. Stops bleeding.' },
  anti: { name: 'Antibody · tag', text: 'Kills little. Marked: no armour, slow burn, +50% energy.' },
  nk: { name: 'Killer cell · execute', text: 'Slow, heavy hit on the most wounded thing. Finishes anything under 35%.' },
  mast: { name: 'Mast cell · burst', text: 'Hits everything close at once — double damage on tagged. Clear one case to unlock.' },
  mem: { name: 'Memory cell · learn', text: 'Weak, then permanently stronger with every kill nearby. Immune to toxin. Clear two cases.' },
};
```

- [ ] **Step 4: Write `src/game/content/pathogens.ts`**

Values verbatim from prototype lines 426–431. `radius` is the prototype's `r`. `shape` replaces the prototype's CSS `radius` string plus its implicit "rotate if it stuns" rule (prototype line 900) with an explicit value drawn from asset sheet lines 174–201.

```ts
import type { PaletteToken, PathogenKind } from '../types';

export interface PathogenStats {
  readonly kind: PathogenKind;
  readonly name: string;
  readonly note: string;
  readonly hp: number;
  readonly speed: number;
  readonly reward: number;
  readonly radius: number;
  readonly shape: 'circle' | 'square' | 'diamond';
  readonly token: PaletteToken;
  readonly armour?: number;
  readonly splits?: true;
  readonly regen?: number;
  readonly stun?: number;
  readonly noTag?: true;
}

export const PATHOGENS: { readonly [K in PathogenKind]: PathogenStats } = {
  staph: { kind: 'staph', name: 'Staph', note: 'Fast, weak, endless', hp: 26, speed: 50, reward: 6, radius: 8, shape: 'circle', token: 'threat' },
  film: { kind: 'film', name: 'Biofilm', note: 'Armoured — tag it first', hp: 120, speed: 28, reward: 16, radius: 12, shape: 'square', token: 'armoured', armour: 0.25 },
  virus: { kind: 'virus', name: 'Flu virus', note: 'Splits when it dies', hp: 34, speed: 58, reward: 8, radius: 9, shape: 'circle', token: 'splitter', splits: true },
  spore: { kind: 'spore', name: 'Spore', note: 'Heals itself unless tagged', hp: 60, speed: 34, reward: 12, radius: 10, shape: 'circle', token: 'fungal', regen: 7 },
  toxin: { kind: 'toxin', name: 'Toxin', note: 'Stuns the cells it passes', hp: 44, speed: 40, reward: 14, radius: 11, shape: 'diamond', token: 'chemical', stun: 1.6 },
  mrsa: { kind: 'mrsa', name: 'Resistant', note: 'Tags do nothing — engulf it', hp: 150, speed: 36, reward: 24, radius: 12, shape: 'circle', token: 'resistant', armour: 0.6, noTag: true },
};
```

- [ ] **Step 5: Write `src/game/content/cases.ts`**

Wave tables are ordered arrays because the shuffle's output depends on its input order (decision D14); the seed order below is the prototype's literal key order at lines 382, 391 and 400. Wave composition is tuning data — the panel edits it.

`credits` is decision D6: the strain a clear counts toward. Every strain vaccine on the immunity screen must be reachable, so every `StrainKey` must appear as some case's `credits` — the invariants test enforces it. The stomach → `film` assignment makes Biofilm serum earnable and fits its biofilm-heavy waves.

Adding a case is authoring one more entry here (plus its id in the `CaseId` union): no system code branches on a specific case id, only on `rule` and `credits`.

```ts
import type { CaseId, CaseRuleKind, BodyNodeId, PathogenKind, Point, StrainKey } from '../types';

export interface WaveEntry {
  readonly kind: PathogenKind;
  readonly count: number;
}

export interface CaseDefinition {
  readonly id: CaseId;
  readonly node: BodyNodeId;
  readonly region: string;
  readonly title: string;
  readonly rule: CaseRuleKind;
  /** The strain this case's clears count toward. Decision D6. */
  readonly credits: StrainKey;
  readonly ruleLabel: string;
  readonly ruleSub: string;
  readonly story: string;
  readonly startingEnergy: number;
  readonly waves: readonly (readonly WaveEntry[])[];
  readonly path: readonly Point[];
  readonly spots: readonly Point[];
}

export const CASES: readonly CaseDefinition[] = [
  {
    id: 'forearm', node: 'forearm', region: 'FOREARM · CASE 04', title: 'Deep cut', rule: 'wound', credits: 'staph',
    story: 'Kitchen knife, two hours ago. The skin is open and bacteria are walking straight in.',
    ruleLabel: 'Bleeding', ruleSub: 'You lose energy every second until a clot is placed',
    startingEnergy: 170,
    waves: [
      [{ kind: 'staph', count: 8 }],
      [{ kind: 'staph', count: 13 }],
      [{ kind: 'staph', count: 12 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'film', count: 4 }, { kind: 'mrsa', count: 1 }],
      [{ kind: 'staph', count: 18 }, { kind: 'film', count: 5 }, { kind: 'mrsa', count: 3 }],
    ],
    path: [[-24, 46], [86, 58], [150, 116], [232, 146], [252, 238], [168, 298], [112, 342], [104, 430]],
    spots: [[70, 118], [206, 88], [292, 196], [58, 268], [206, 372]],
  },
  {
    id: 'throat', node: 'throat', region: 'THROAT · CASE 05', title: 'Flu', rule: 'virus', credits: 'virus',
    story: 'Someone coughed on the train. The virus is already copying itself in your throat.',
    ruleLabel: 'Multiplying', ruleSub: 'Every virus that dies splits into two smaller ones',
    startingEnergy: 215,
    waves: [
      [{ kind: 'virus', count: 6 }],
      [{ kind: 'virus', count: 9 }, { kind: 'spore', count: 2 }],
      [{ kind: 'virus', count: 11 }, { kind: 'spore', count: 4 }],
      [{ kind: 'virus', count: 13 }, { kind: 'spore', count: 5 }, { kind: 'film', count: 3 }],
      [{ kind: 'virus', count: 16 }, { kind: 'spore', count: 6 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 120], [90, 120], [150, 60], [240, 74], [268, 170], [180, 230], [180, 320], [96, 380], [104, 430]],
    spots: [[64, 62], [220, 148], [96, 216], [258, 286], [246, 386]],
  },
  {
    id: 'stomach', node: 'stomach', region: 'STOMACH · CASE 06', title: 'Food poisoning', rule: 'poison', credits: 'film',
    story: 'The shellfish. Toxins are going after your own cells instead of the tissue.',
    ruleLabel: 'Toxic', ruleSub: 'Pathogens damage your defenders — cells die, the region holds',
    startingEnergy: 250,
    waves: [
      [{ kind: 'staph', count: 10 }, { kind: 'toxin', count: 2 }],
      [{ kind: 'staph', count: 9 }, { kind: 'toxin', count: 4 }, { kind: 'film', count: 3 }],
      [{ kind: 'staph', count: 13 }, { kind: 'toxin', count: 5 }, { kind: 'spore', count: 3 }],
      [{ kind: 'staph', count: 15 }, { kind: 'toxin', count: 6 }, { kind: 'film', count: 5 }],
      [{ kind: 'staph', count: 18 }, { kind: 'toxin', count: 8 }, { kind: 'film', count: 6 }, { kind: 'mrsa', count: 2 }],
    ],
    path: [[-24, 70], [100, 90], [180, 62], [268, 120], [230, 214], [120, 250], [90, 330], [180, 392], [180, 430]],
    spots: [[74, 168], [212, 132], [292, 216], [46, 264], [246, 330]],
  },
];

export const CASE_BY_ID: Readonly<Record<CaseId, CaseDefinition>> = Object.fromEntries(
  CASES.map((c) => [c.id, c]),
) as Record<CaseId, CaseDefinition>;

export function isCaseId(value: string): value is CaseId {
  return value in CASE_BY_ID;
}
```

- [ ] **Step 6: Write `src/game/content/vaccines.ts`, `body.ts` and `later.ts`**

`vaccines.ts` — prototype lines 415–423. Note the apostrophe in the MMR cost string is a typographic apostrophe (U+2019), as in the prototype:

```ts
import type { StrainKey, Tier } from '../types';

export interface VaccineDefinition {
  readonly name: string;
  readonly tier: Tier;
  readonly effect: string;
  /** Earned by clearing this strain three times. Never purchasable. */
  readonly strain?: StrainKey;
  /** Becomes available once this many cases are cleared. */
  readonly gate?: number;
  readonly cost?: string;
}

export const VACCINES: readonly VaccineDefinition[] = [
  { name: 'Tetanus', strain: 'staph', tier: 1, effect: 'First Staph of every wave bounces off' },
  { name: 'Flu B', strain: 'virus', tier: 1, effect: 'Flu no longer splits when it dies' },
  { name: 'Biofilm serum', strain: 'film', tier: 1, effect: 'Armour drops — phagocytes bite properly' },
  { name: 'Measles, mumps, rubella', gate: 2, tier: 2, effect: 'Blocks the immune-amnesia wipe entirely', cost: 'Costs a day you don’t fight' },
  { name: 'Chickenpox', gate: 99, tier: 2, effect: 'Stops a cleared case reopening later', cost: 'Survive a dormancy case first' },
  { name: 'Strain Vesper', tier: 3, effect: 'No vaccine exists yet — this one you fight raw' },
];

/**
 * Immunity screen rows and the brief's shield copy. Prototype lines 1003–1006, 1027–1029.
 * heldCopy is what the brief shows once the strain's vaccine is earned (decision D23).
 */
export const STRAIN_ROWS: readonly {
  readonly key: StrainKey; readonly name: string; readonly effect: string; readonly heldCopy: string;
}[] = [
  { key: 'staph', name: 'Tetanus', effect: 'The first Staph of every wave bounces off', heldCopy: 'Tetanus vaccine held. The first Staph of every wave bounces off.' },
  { key: 'virus', name: 'Flu B', effect: 'Flu can no longer split when it dies', heldCopy: 'Flu B vaccine held. Nothing splits when it dies.' },
  { key: 'film', name: 'Biofilm', effect: 'Armour drops — phagocytes hurt it properly', heldCopy: 'Biofilm serum held. Armour is gone — phagocytes bite properly.' },
];
```

`body.ts` — prototype lines 434–455:

```ts
import type { BodyNodeId } from '../types';

export interface BodyNode {
  readonly id: BodyNodeId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly label?: string;
  readonly core?: true;
}

export const BODY_NODES: readonly BodyNode[] = [
  { id: 'sinus', x: 187, y: 56, r: 24, label: 'SINUS' },
  { id: 'throat', x: 187, y: 108, r: 19, label: 'THROAT' },
  { id: 'lungL', x: 128, y: 148, r: 21 },
  { id: 'lungR', x: 246, y: 148, r: 21 },
  { id: 'heart', x: 187, y: 176, r: 30, core: true, label: 'HEART · CORE' },
  { id: 'stomach', x: 187, y: 254, r: 23, label: 'STOMACH' },
  { id: 'gut', x: 187, y: 322, r: 19 },
  { id: 'shoulder', x: 104, y: 196, r: 15 },
  { id: 'forearm', x: 64, y: 252, r: 26, label: 'FOREARM' },
  { id: 'shoulderR', x: 270, y: 196, r: 15 },
  { id: 'handR', x: 310, y: 252, r: 22 },
  { id: 'kneeL', x: 146, y: 386, r: 15 },
  { id: 'kneeR', x: 228, y: 386, r: 15 },
  { id: 'footL', x: 146, y: 452, r: 21 },
  { id: 'footR', x: 228, y: 452, r: 21 },
];

export const BODY_LINKS: readonly (readonly [BodyNodeId, BodyNodeId])[] = [
  ['sinus', 'throat'], ['throat', 'heart'], ['heart', 'lungL'], ['heart', 'lungR'],
  ['heart', 'stomach'], ['stomach', 'gut'], ['heart', 'shoulder'], ['shoulder', 'forearm'],
  ['heart', 'shoulderR'], ['shoulderR', 'handR'], ['gut', 'kneeL'], ['gut', 'kneeR'],
  ['kneeL', 'footL'], ['kneeR', 'footR'],
];

export const BODY_MAP_VIEWBOX = { width: 374, height: 500 } as const;
```

`later.ts` — prototype lines 406–413. The naming-policy comment is a product constraint and is carried over verbatim:

```ts
import type { Tier } from '../types';

// Naming policy — tier 1: everyday, freely named. tier 2: named only because the mechanic is the
// real mechanic. tier 3: invented strains, never a real outbreak. No bioterror framing anywhere.
export interface LaterEntry {
  readonly offset: number;
  readonly name: string;
  readonly region: string;
  readonly tier: Tier;
  readonly note: string;
}

export const LATER: readonly LaterEntry[] = [
  { offset: 4, name: 'Measles', region: 'Whole body', tier: 2, note: 'Wipes one immunity you already earned' },
  { offset: 7, name: 'Strain Vesper', region: 'Lungs', tier: 3, note: 'Novel — nothing known about it yet' },
];
```

- [ ] **Step 7: Write `src/game/content/rules.ts`**

Every gameplay constant that belongs to no single entity table. The four inline literals called out in decision D16 get names here.

```ts
/** Board coordinate space. Prototype line 910: viewBox "0 0 374 430". */
export const BOARD_WIDTH = 374;
export const BOARD_HEIGHT = 430;

export const STEP_SECONDS = 1 / 60;
export const FAST_MULTIPLIER = 2;

export const TISSUE_MAX = 5;
export const IMMUNITY_MAX = 3;
export const TOWER_MAX_HP = 100;
export const BUILD_SPOT_RADIUS = 24;

export const WAVE_CLEAR_ENERGY = 50;
export const CASE_CLEAR_BANK = 180;

export const FEVER_SECONDS = 5;
export const FEVER_SLOW = 0.4;

export const SPAWN_FIRST_DELAY = 0.3;
export const SPAWN_BASE_INTERVAL = 0.72;
export const SPAWN_INTERVAL_PER_WAVE = 0.07;
export const SPAWN_MIN_INTERVAL = 0.4;

export const BLEED_INTERVAL = 1;
export const BLEED_AMOUNT = 2;

export const TOXIN_STUN_RADIUS = 40;
export const POISON_RADIUS = 42;
export const POISON_DPS_ANTIBODY = 5;
export const POISON_DPS_OTHER = 10;

export const TAG_REWARD_MULTIPLIER = 1.5;
export const TAGGED_BURST_MULTIPLIER = 2;

export const SPLIT_COUNT = 2;
export const SPLIT_HP_FRACTION = 0.5;
export const SPLIT_BACK_OFFSET = 14;
export const SPLIT_BACK_SPACING = 12;
export const SPLIT_SPEED_FACTOR = 0.85;
export const SPLIT_RADIUS_FACTOR = 0.75;

/**
 * A fresh body. Used by both first run and "Start a new body" — the prototype's
 * day-4 opening (line 466) was demo staging and is not shipped. Prototype line 580.
 */
export const FRESH_PROFILE = { day: 1, bank: 240 } as const;
```

`src/game/content/index.ts` re-exports all seven modules so consumers write one import.

- [ ] **Step 8: Write the failing structural invariants test**

Spec §4: content is validated for internal coherence — invariants, never values. There is deliberately no assertion that would fail when a cost, hp or rate is tuned. What this net catches is a broken reference, an empty wave, a spot off the board, or a vaccine no case can earn.

`src/game/content/content.invariants.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_ORDER } from './defenders';
import { PATHOGENS } from './pathogens';
import { CASES } from './cases';
import { STRAIN_ROWS, VACCINES } from './vaccines';
import { BODY_LINKS, BODY_NODES } from './body';
import { BOARD_HEIGHT, BOARD_WIDTH, IMMUNITY_MAX, TISSUE_MAX } from './rules';

describe('defender table coherence', () => {
  it('lists every defender in the dock order exactly once', () => {
    expect([...DEFENDER_ORDER].sort()).toEqual(Object.keys(DEFENDERS).sort());
    expect(new Set(DEFENDER_ORDER).size).toBe(DEFENDER_ORDER.length);
  });

  it('keeps every rate, range and cost positive', () => {
    for (const d of Object.values(DEFENDERS)) {
      expect(d.cost).toBeGreaterThan(0);
      expect(d.range).toBeGreaterThan(0);
      expect(d.unlock).toBeGreaterThanOrEqual(0);
    }
  });

  it('keeps every unlock tier reachable within the shipped cases', () => {
    for (const d of Object.values(DEFENDERS)) {
      expect(d.unlock).toBeLessThan(CASES.length);
    }
  });
});

describe('pathogen table coherence', () => {
  it('keeps hp, speed, reward and radius positive', () => {
    for (const p of Object.values(PATHOGENS)) {
      expect(p.hp).toBeGreaterThan(0);
      expect(p.speed).toBeGreaterThan(0);
      expect(p.reward).toBeGreaterThan(0);
      expect(p.radius).toBeGreaterThan(0);
    }
  });

  it('keeps armour a damage multiplier between 0 and 1 where present', () => {
    for (const p of Object.values(PATHOGENS)) {
      if (p.armour !== undefined) {
        expect(p.armour).toBeGreaterThan(0);
        expect(p.armour).toBeLessThan(1);
      }
    }
  });
});

describe('case coherence', () => {
  it('gives every case at least one non-empty wave of known pathogens', () => {
    for (const c of CASES) {
      expect(c.waves.length).toBeGreaterThan(0);
      for (const wave of c.waves) {
        expect(wave.length).toBeGreaterThan(0);
        for (const entry of wave) {
          expect(PATHOGENS[entry.kind]).toBeDefined();
          expect(entry.count).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every case a path of at least two points and at least one build spot', () => {
    for (const c of CASES) {
      expect(c.path.length).toBeGreaterThanOrEqual(2);
      expect(c.spots.length).toBeGreaterThan(0);
    }
  });

  it('keeps every build spot on the board', () => {
    for (const c of CASES) {
      for (const [x, y] of c.spots) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(BOARD_WIDTH);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(BOARD_HEIGHT);
      }
    }
  });

  it('anchors every case to a real body node', () => {
    const nodeIds = new Set(BODY_NODES.map((n) => n.id));
    for (const c of CASES) expect(nodeIds.has(c.node)).toBe(true);
  });

  it('gives every case a unique id', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });
});

describe('vaccine reachability — spec success criterion 6', () => {
  it('credits every displayed strain vaccine from at least one case', () => {
    const credited = new Set(CASES.map((c) => c.credits));
    for (const row of STRAIN_ROWS) {
      expect(credited, `no case credits ${row.key}; its vaccine can never be earned`).toContain(row.key);
    }
  });

  it('lists a strain for every earnable vaccine and a matching immunity row', () => {
    const strains = VACCINES.filter((v) => v.strain !== undefined).map((v) => v.strain);
    expect(strains.sort()).toEqual(STRAIN_ROWS.map((r) => r.key).sort());
  });
});

describe('body graph coherence', () => {
  it('links only nodes that exist', () => {
    const nodeIds = new Set(BODY_NODES.map((n) => n.id));
    for (const [from, to] of BODY_LINKS) {
      expect(nodeIds.has(from)).toBe(true);
      expect(nodeIds.has(to)).toBe(true);
    }
  });

  it('has exactly one core node', () => {
    expect(BODY_NODES.filter((n) => n.core === true)).toHaveLength(1);
  });
});

describe('run-level rule coherence', () => {
  it('keeps the run-level counters positive', () => {
    expect(TISSUE_MAX).toBeGreaterThan(0);
    expect(IMMUNITY_MAX).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 9: Run it to verify it fails, then verify it catches real breakage**

Run: `npx vitest run src/game/content/content.invariants.test.ts`
Expected: FAIL with unresolved imports if run before Steps 3–7; PASS once the content exists.

Then two deliberate mutations, to prove the net catches structure and ignores tuning:
1. Change the stomach case's `credits` to `'staph'`. Run. Expected: exactly one failure — `no case credits film`. Restore.
2. Change `DEFENDERS.phago.cost` to `55`. Run the whole suite: `npm run test`. Expected: **zero failures.** A tuning change must never turn the suite red (spec §9). Restore.

- [ ] **Step 10: Verify the discriminated union actually rejects bad access**

Add this line temporarily to any file under `src/game/`:

```ts
const bad = DEFENDERS.clot.dps;
```

Run: `npm run typecheck:game`
Expected: FAIL — `Property 'dps' does not exist on type ...`. Delete the line and re-run to confirm green. This proves the "make invalid state unrepresentable" claim rather than assuming it.

- [ ] **Step 11: Run the full gate**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat(content): defender, pathogen, case, vaccine and body tables with structural invariants"
```

**Verification command:** `npm run verify`
**Passing looks like:** the invariants suite passes; a deliberate tuning change leaves every test green; `npm run typecheck:game` is clean, proving the content modules compile with no DOM lib and no ambient types.

---

## Phase 3 — Simulation foundations: types, RNG, path, state, fixed-step loop, spawn and movement

**Why now:** the complete sim state types unblock both the renderer (Phase 4) and every system phase. Getting spawn and movement in first means an enemy can walk a path, which is the smallest end-to-end slice the renderer can draw.

**Files:**
- Modify: `src/game/types.ts` — add the sim state types
- Already built (Phase 0): `src/game/rng.ts` + `rng.test.ts`
- Create: `src/game/path.ts` + `path.test.ts`
- Create: `src/game/state.ts` + `state.test.ts`
- Create: `src/game/hash.ts`
- Create: `src/game/systems/spawn.ts` + `spawn.test.ts`
- Create: `src/game/systems/movement.ts` + `movement.test.ts`
- Create: `src/game/systems/targeting.ts` + `targeting.test.ts`
- Create: `src/game/step.ts`
- Create: `src/game/loop.ts` + `loop.test.ts`
- Create: `src/game/commands.ts`
- Port from: prototype lines 491–511 (geometry), 528–544 (case and wave start), 546–561 (commands), 584–596 (loop), 598–620 (spawn and bleed), 622–665 (movement)

**Interfaces:**
- Consumes: everything from `@game/content` and `@game/types`.
- Produces:
  - `createRng(seed: number): Rng` where `interface Rng { next(): number; readonly state: number }`
  - `waveSeed(caseId: string, waveIndex: number): number`
  - `compilePath(points: readonly Point[]): CompiledPath`, `positionAt(path: CompiledPath, distance: number): Point`
  - `createSimState(input: SimInput): SimState`, `distance(ax, ay, bx, by): number`
  - `step(state: SimState, dt: number): void`
  - `class GameLoop` with `advance(elapsedSeconds: number): void`, `readonly state: SimState`, `readonly stepsTaken: number`, `getSnapshot(): HudSnapshot`, `subscribe(listener: () => void): () => void`
  - `hashState(state: SimState): string`
  - commands: `selectDefender`, `placeDefender`, `startWave`, `triggerFever`, `toggleSpeed`, `advanceToNextWave`

- [ ] **Step 1: Add the sim state types to `src/game/types.ts`**

Towers are a discriminated union so no tower can carry a field its kind never uses. `Enemy` is one shape because every pathogen uses every field. `Beam` carries a defender kind, never a colour — colour belongs to the renderer.

```ts
export type Phase = 'build' | 'wave' | 'built' | 'done';
export type ResultKind = 'wave' | 'case' | 'lost';

export interface Segment {
  readonly ax: number; readonly ay: number;
  readonly bx: number; readonly by: number;
  readonly length: number;
  readonly start: number;
}

export interface CompiledPath {
  readonly segments: readonly Segment[];
  readonly total: number;
}

interface TowerBase {
  readonly spotIndex: number;
  readonly x: number;
  readonly y: number;
  hp: number;
  stun: number;
}

export interface PhagocyteTower extends TowerBase {
  readonly kind: 'phago';
  holdingEnemyId: number | null;
  eaten: number;
  rest: number;
}
export interface ClotTower extends TowerBase { readonly kind: 'clot' }
export interface AntibodyTower extends TowerBase { readonly kind: 'anti'; cooldown: number }
export interface NkTower extends TowerBase { readonly kind: 'nk'; cooldown: number }
export interface MastTower extends TowerBase { readonly kind: 'mast'; cooldown: number; flash: number }
export interface MemoryTower extends TowerBase { readonly kind: 'mem'; cooldown: number; xp: number }

export type Tower =
  | PhagocyteTower | ClotTower | AntibodyTower | NkTower | MastTower | MemoryTower;

export interface Enemy {
  readonly id: number;
  readonly kind: PathogenKind;
  /** Arc length travelled along the compiled path. */
  distance: number;
  x: number;
  y: number;
  hp: number;
  readonly maxHp: number;
  /** Seconds of tag remaining. Zero or less means untagged. */
  tag: number;
  /** 0 for an original, 1 for a split child. Children never split. */
  readonly generation: 0 | 1;
}

export interface Beam {
  readonly fromX: number; readonly fromY: number;
  readonly toX: number; readonly toY: number;
  life: number;
  readonly source: 'anti' | 'nk' | 'mem';
}

export interface SimState {
  readonly caseId: CaseId;
  readonly rule: CaseRuleKind;
  readonly path: CompiledPath;
  /** Profile facts the simulation reads but never writes. */
  readonly immunity: Readonly<Record<StrainKey, number>>;
  readonly clearedCount: number;

  phase: Phase;
  result: ResultKind | null;
  waveIndex: number;
  readonly waveCount: number;

  energy: number;
  tissue: number;
  selected: DefenderKind | null;
  fast: boolean;

  fever: number;
  feverUsed: boolean;

  queue: PathogenKind[];
  spawnTimer: number;
  /** The wave index whose tetanus bounce has already been spent. */
  shieldedWave: number | null;
  bleedTimer: number;

  towers: Tower[];
  enemies: Enemy[];
  beams: Beam[];
  nextEnemyId: number;
  rngState: number;

  waveKills: number;
  waveLeaks: number;
  totalKills: number;
}
```

- [ ] **Steps 2–5: superseded — the RNG landed in Phase 0**

`createRng` (mulberry32, 32-bit serialisable state) and `waveSeed` (FNV-1a over caseId mixed with the wave index) are already implemented and tested in `src/game/rng.ts` / `rng.test.ts` as part of the committed Phase 0. Confirm `npx vitest run src/game/rng.test.ts` is green and move on; the interfaces listed above are exactly what it exports.

- [ ] **Step 6: Write the failing path test**

`src/game/path.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { compilePath, positionAt } from './path';
import { CASE_BY_ID } from './content/cases';

describe('compilePath', () => {
  it('accumulates segment lengths into a total', () => {
    const path = compilePath([[0, 0], [3, 4], [3, 14]]);
    expect(path.segments).toHaveLength(2);
    expect(path.segments[0]?.length).toBe(5);
    expect(path.segments[1]?.length).toBe(10);
    expect(path.total).toBe(15);
  });

  it('records where each segment starts', () => {
    const path = compilePath([[0, 0], [3, 4], [3, 14]]);
    expect(path.segments[0]?.start).toBe(0);
    expect(path.segments[1]?.start).toBe(5);
  });

  it('rejects a path with fewer than two points', () => {
    expect(() => compilePath([[0, 0]])).toThrow(/at least two points/i);
  });
});

describe('positionAt', () => {
  const path = compilePath([[0, 0], [10, 0], [10, 10]]);

  it('returns the first point at distance zero', () => {
    expect(positionAt(path, 0)).toEqual([0, 0]);
  });

  it('interpolates within a segment', () => {
    expect(positionAt(path, 5)).toEqual([5, 0]);
  });

  it('crosses into the next segment', () => {
    expect(positionAt(path, 13)).toEqual([10, 3]);
  });

  it('clamps to the last point past the end', () => {
    expect(positionAt(path, 999)).toEqual([10, 10]);
  });

  it('clamps to the first point for a negative distance', () => {
    expect(positionAt(path, -5)).toEqual([0, 0]);
  });

  it('walks every shipped case path without producing NaN', () => {
    for (const c of Object.values(CASE_BY_ID)) {
      const compiled = compilePath(c.path);
      for (let d = 0; d <= compiled.total; d += 7) {
        const [x, y] = positionAt(compiled, d);
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
      }
    }
  });
});
```

- [ ] **Step 7: Run it to verify it fails, then implement `src/game/path.ts`**

Run: `npx vitest run src/game/path.test.ts` — Expected: FAIL, unresolved import.

```ts
import type { CompiledPath, Point, Segment } from './types';

export function compilePath(points: readonly Point[]): CompiledPath {
  if (points.length < 2) throw new Error('A vessel path needs at least two points');

  const segments: Segment[] = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i]!;
    const b = points[i + 1]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.sqrt(dx * dx + dy * dy);
    segments.push({ ax: a[0], ay: a[1], bx: b[0], by: b[1], length, start: total });
    total += length;
  }
  return { segments, total };
}

export function positionAt(path: CompiledPath, distance: number): Point {
  const first = path.segments[0]!;
  if (distance <= 0) return [first.ax, first.ay];

  for (const s of path.segments) {
    if (distance <= s.start + s.length) {
      const k = s.length === 0 ? 0 : (distance - s.start) / s.length;
      return [s.ax + (s.bx - s.ax) * k, s.ay + (s.by - s.ay) * k];
    }
  }

  const last = path.segments[path.segments.length - 1]!;
  return [last.bx, last.by];
}
```

The prototype's `posAt` (lines 501–511) has no negative-distance guard because nothing ever passes one. Split children are placed at `Math.max(0, ...)`, so the guard is defensive-but-free and makes the function total.

Run: `npx vitest run src/game/path.test.ts` — Expected: PASS, 9 tests.

- [ ] **Step 8: Write `src/game/state.ts`**

```ts
import { CASE_BY_ID } from './content/cases';
import { TISSUE_MAX } from './content/rules';
import { compilePath } from './path';
import type { CaseId, SimState, StrainKey } from './types';

export interface SimInput {
  readonly caseId: CaseId;
  readonly immunity: Readonly<Record<StrainKey, number>>;
  readonly clearedCount: number;
  readonly totalKills: number;
}

export function createSimState(input: SimInput): SimState {
  const definition = CASE_BY_ID[input.caseId];
  return {
    caseId: definition.id,
    rule: definition.rule,
    path: compilePath(definition.path),
    immunity: input.immunity,
    clearedCount: input.clearedCount,

    phase: 'build',
    result: null,
    waveIndex: 0,
    waveCount: definition.waves.length,

    energy: definition.startingEnergy,
    tissue: TISSUE_MAX,
    selected: 'phago',
    fast: false,

    fever: 0,
    feverUsed: false,

    queue: [],
    spawnTimer: 0,
    shieldedWave: null,
    bleedTimer: 0,

    towers: [],
    enemies: [],
    beams: [],
    nextEnemyId: 1,
    rngState: 0,

    waveKills: 0,
    waveLeaks: 0,
    totalKills: input.totalKills,
  };
}

/** Math.hypot is implementation-approximated and would break the golden run. */
export function distance(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.sqrt(dx * dx + dy * dy);
}
```

`src/game/state.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { createSimState, distance } from './state';
import { CASE_BY_ID } from './content/cases';
import { TISSUE_MAX } from './content/rules';

const input = { caseId: 'forearm', immunity: { staph: 0, film: 0, virus: 0 }, clearedCount: 0, totalKills: 0 } as const;

describe('createSimState', () => {
  it('starts in build phase with the case starting energy and full tissue', () => {
    const state = createSimState(input);
    expect(state.phase).toBe('build');
    expect(state.energy).toBe(CASE_BY_ID.forearm.startingEnergy);
    expect(state.tissue).toBe(TISSUE_MAX);
    expect(state.waveCount).toBe(CASE_BY_ID.forearm.waves.length);
  });

  it('preselects the phagocyte, as the prototype does on case start', () => {
    expect(createSimState(input).selected).toBe('phago');
  });

  it('starts with no shielded wave recorded', () => {
    expect(createSimState(input).shieldedWave).toBeNull();
  });
});

describe('distance', () => {
  it('measures a 3-4-5 triangle', () => {
    expect(distance(0, 0, 3, 4)).toBe(5);
  });

  it('is zero for coincident points', () => {
    expect(distance(7, 7, 7, 7)).toBe(0);
  });
});
```

Run: `npx vitest run src/game/state.test.ts` — Expected: PASS, 5 tests.

- [ ] **Step 9: Write `src/game/systems/spawn.ts`**

Ports prototype lines 603–614. The tetanus shield uses `state.shieldedWave` rather than the prototype's never-reset instance field (decision D2). `buildQueue` is exported so the wave-start command can call it.

```ts
import { CASE_BY_ID } from '../content/cases';
import { PATHOGENS } from '../content/pathogens';
import {
  IMMUNITY_MAX, SPAWN_BASE_INTERVAL, SPAWN_INTERVAL_PER_WAVE, SPAWN_MIN_INTERVAL,
} from '../content/rules';
import { positionAt } from '../path';
import { createRng, waveSeed } from '../rng';
import type { PathogenKind, SimState } from '../types';

/** Prototype line 540: entries are expanded in wave-table order, then shuffled. */
export function buildQueue(state: SimState): PathogenKind[] {
  const wave = CASE_BY_ID[state.caseId].waves[state.waveIndex] ?? [];
  const queue: PathogenKind[] = [];
  for (const entry of wave) {
    for (let i = 0; i < entry.count; i += 1) queue.push(entry.kind);
  }

  const rng = createRng(waveSeed(state.caseId, state.waveIndex));
  for (let i = queue.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng.next() * (i + 1));
    const swap = queue[i]!;
    queue[i] = queue[j]!;
    queue[j] = swap;
  }
  state.rngState = rng.state;
  return queue;
}

function spawnInterval(waveIndex: number): number {
  return Math.max(SPAWN_MIN_INTERVAL, SPAWN_BASE_INTERVAL - waveIndex * SPAWN_INTERVAL_PER_WAVE);
}

export function applySpawn(state: SimState, dt: number): void {
  if (state.queue.length === 0) return;

  state.spawnTimer -= dt;
  if (state.spawnTimer > 0) return;

  const kind = state.queue.shift()!;
  const bounced =
    state.rule === 'wound' &&
    kind === 'staph' &&
    state.immunity.staph >= IMMUNITY_MAX &&
    state.shieldedWave !== state.waveIndex;

  if (bounced) {
    state.shieldedWave = state.waveIndex;
  } else {
    const stats = PATHOGENS[kind];
    const [x, y] = positionAt(state.path, 0);
    state.enemies.push({
      id: state.nextEnemyId,
      kind,
      distance: 0,
      x,
      y,
      hp: stats.hp,
      maxHp: stats.hp,
      tag: 0,
      generation: 0,
    });
    state.nextEnemyId += 1;
  }

  state.spawnTimer = spawnInterval(state.waveIndex);
}
```

A shielded staph still consumes a queue entry and still resets the spawn timer — that is the prototype's behaviour and it is what makes the bounce feel like a beat rather than a skipped enemy.

- [ ] **Step 10: Write `src/game/systems/spawn.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { applySpawn, buildQueue } from './spawn';
import { createSimState } from '../state';
import { CASE_BY_ID } from '../content/cases';
import { PATHOGENS } from '../content/pathogens';
import { SPAWN_FIRST_DELAY } from '../content/rules';
import type { SimState, StrainKey } from '../types';

function waveSize(state: SimState): number {
  return CASE_BY_ID[state.caseId].waves[state.waveIndex]!
    .reduce((sum, entry) => sum + entry.count, 0);
}

function forearm(immunity: Partial<Record<StrainKey, number>> = {}) {
  const state = createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0, ...immunity },
    clearedCount: 0,
    totalKills: 0,
  });
  state.phase = 'wave';
  state.queue = buildQueue(state);
  state.spawnTimer = SPAWN_FIRST_DELAY;
  return state;
}

describe('buildQueue', () => {
  it('expands the wave table into one queue entry per pathogen', () => {
    const state = forearm();
    expect(state.queue).toHaveLength(waveSize(state));
  });

  it('is identical for the same case and wave', () => {
    expect(forearm().queue).toEqual(forearm().queue);
  });

  it('shuffles a mixed wave rather than leaving it grouped by kind', () => {
    const state = forearm();
    state.waveIndex = 3;
    const queue = buildQueue(state);
    expect(queue).toHaveLength(waveSize(state));
    const grouped = [...queue].sort().join(',');
    expect(queue.join(',')).not.toBe(grouped);
  });

  it('records the generator state so the run stays serialisable', () => {
    const state = forearm();
    expect(state.rngState).toBeGreaterThan(0);
  });
});

describe('applySpawn', () => {
  it('spawns nothing until the first delay elapses', () => {
    const state = forearm();
    applySpawn(state, 0.2);
    expect(state.enemies).toHaveLength(0);
  });

  it('spawns one enemy at the head of the path at its full health', () => {
    const state = forearm();
    applySpawn(state, 0.4);
    expect(state.enemies).toHaveLength(1);
    const spawned = state.enemies[0]!;
    expect(spawned.distance).toBe(0);
    expect(spawned.hp).toBe(PATHOGENS[spawned.kind].hp);
  });

  it('shortens the interval on later waves', () => {
    const early = forearm();
    applySpawn(early, 0.4);
    const late = forearm();
    late.waveIndex = 4;
    late.queue = buildQueue(late);
    late.spawnTimer = SPAWN_FIRST_DELAY;
    applySpawn(late, 0.4);
    expect(late.spawnTimer).toBeLessThan(early.spawnTimer);
  });

  it('bounces the first staph of a wave once tetanus immunity is complete', () => {
    const state = forearm({ staph: 3 });
    applySpawn(state, 0.4);
    expect(state.enemies).toHaveLength(0);
    expect(state.shieldedWave).toBe(0);

    state.spawnTimer = 0;
    applySpawn(state, 0.4);
    expect(state.enemies).toHaveLength(1);
  });

  it('bounces again on the next wave', () => {
    const state = forearm({ staph: 3 });
    applySpawn(state, 0.4);
    state.waveIndex = 1;
    state.spawnTimer = 0;
    applySpawn(state, 0.4);
    expect(state.enemies).toHaveLength(0);
    expect(state.shieldedWave).toBe(1);
  });

  it('does not bounce outside a wound case', () => {
    const state = createSimState({
      caseId: 'stomach', immunity: { staph: 3, film: 0, virus: 0 }, clearedCount: 0, totalKills: 0,
    });
    state.phase = 'wave';
    state.queue = ['staph'];
    state.spawnTimer = 0;
    applySpawn(state, 0.1);
    expect(state.enemies).toHaveLength(1);
  });
});
```

Run: `npx vitest run src/game/systems/spawn.test.ts` — Expected: PASS, 11 tests.

- [ ] **Step 11: Write `src/game/systems/targeting.ts`**

The shared selectors. Every defender picks differently, so this file owns the predicates rather than each defender re-deriving them.

```ts
import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX } from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState, Tower } from '../types';

export function isTagged(enemy: Enemy): boolean {
  return enemy.tag > 0;
}

/**
 * Armour applies unless the enemy is tagged and taggable (prototype line 669),
 * or the Biofilm serum is held — the earned vaccine strips biofilm armour
 * permanently (decision D22). Resistant strains are untaggable, so their
 * armour is otherwise permanent.
 */
export function armourMultiplier(state: SimState, enemy: Enemy): number {
  const stats = PATHOGENS[enemy.kind];
  if (stats.armour === undefined) return 1;
  if (enemy.kind === 'film' && state.immunity.film >= IMMUNITY_MAX) return 1;
  if (isTagged(enemy) && stats.noTag !== true) return 1;
  return stats.armour;
}

export function inRange(tower: Tower, enemy: Enemy, range: number): boolean {
  return distance(tower.x, tower.y, enemy.x, enemy.y) <= range;
}

export function isAlive(enemy: Enemy, dead: ReadonlySet<number>): boolean {
  return enemy.hp > 0 && !dead.has(enemy.id);
}

/** The enemy furthest along the vessel — what phagocytes and memory cells pick. */
export function pickLeader(
  state: SimState, tower: Tower, range: number, dead: ReadonlySet<number>,
  exclude?: ReadonlySet<number>,
): Enemy | null {
  let best: Enemy | null = null;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (exclude?.has(enemy.id) === true) continue;
    if (!inRange(tower, enemy, range)) continue;
    if (best === null || enemy.distance > best.distance) best = enemy;
  }
  return best;
}

/** The lowest health fraction in range — what the killer cell picks. Ties keep the first found. */
export function pickMostWounded(
  state: SimState, tower: Tower, range: number, dead: ReadonlySet<number>,
): Enemy | null {
  let best: Enemy | null = null;
  let bestFraction = 2;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, range)) continue;
    const fraction = enemy.hp / enemy.maxHp;
    if (fraction < bestFraction) {
      bestFraction = fraction;
      best = enemy;
    }
  }
  return best;
}
```

`src/game/systems/targeting.test.ts` covers the armour mechanic — the relationships, never the armour values themselves:

```ts
import { describe, expect, it } from 'vitest';
import { armourMultiplier } from './targeting';
import { PATHOGENS } from '../content/pathogens';
import { IMMUNITY_MAX } from '../content/rules';
import { createSimState } from '../state';
import type { Enemy, PathogenKind, SimState, StrainKey } from '../types';

function stateWith(immunity: Partial<Record<StrainKey, number>> = {}): SimState {
  return createSimState({
    caseId: 'forearm',
    immunity: { staph: 0, film: 0, virus: 0, ...immunity },
    clearedCount: 0,
    totalKills: 0,
  });
}

function enemy(kind: PathogenKind, tag = 0): Enemy {
  const stats = PATHOGENS[kind];
  return { id: 1, kind, distance: 0, x: 0, y: 0, hp: stats.hp, maxHp: stats.hp, tag, generation: 0 };
}

describe('armourMultiplier', () => {
  it('is 1 for an unarmoured pathogen', () => {
    expect(armourMultiplier(stateWith(), enemy('staph'))).toBe(1);
  });

  it('applies the biofilm armour value while untagged', () => {
    expect(armourMultiplier(stateWith(), enemy('film'))).toBe(PATHOGENS.film.armour);
  });

  it('drops armour entirely while the biofilm is tagged', () => {
    expect(armourMultiplier(stateWith(), enemy('film', 6))).toBe(1);
  });

  it('keeps resistant armour on even if a tag timer is somehow set', () => {
    expect(armourMultiplier(stateWith(), enemy('mrsa'))).toBe(PATHOGENS.mrsa.armour);
    expect(armourMultiplier(stateWith(), enemy('mrsa', 6))).toBe(PATHOGENS.mrsa.armour);
  });

  it('strips biofilm armour permanently once the serum is held — decision D22', () => {
    const state = stateWith({ film: IMMUNITY_MAX });
    expect(armourMultiplier(state, enemy('film'))).toBe(1);
  });

  it('does not let the serum touch resistant armour', () => {
    const state = stateWith({ film: IMMUNITY_MAX });
    expect(armourMultiplier(state, enemy('mrsa'))).toBe(PATHOGENS.mrsa.armour);
  });
});
```

Run: `npx vitest run src/game/systems/targeting.test.ts` — Expected: PASS, 6 tests.

- [ ] **Step 12: Write `src/game/systems/movement.ts`**

Ports prototype lines 632–665 in exactly that order. The toxin-stun and poison passes are invoked from here rather than from `step` because the prototype runs them inside the per-enemy movement loop, and moving them out would change what position they sample.

```ts
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { FEVER_SLOW, SPLIT_SPEED_FACTOR } from '../content/rules';
import { positionAt } from '../path';
import { distance } from '../state';
import type { SimState } from '../types';
import { applyPoison, applyToxinStun } from './hazards';

export function applyMovement(
  state: SimState, dt: number, held: ReadonlySet<number>, dead: Set<number>,
): void {
  const globalSlow = state.fever > 0 ? FEVER_SLOW : 1;

  for (const enemy of state.enemies) {
    const stats = PATHOGENS[enemy.kind];
    [enemy.x, enemy.y] = positionAt(state.path, enemy.distance);

    if (enemy.tag > 0) {
      enemy.tag -= dt;
      enemy.hp -= DEFENDERS.anti.dot * dt;
    }
    if (stats.regen !== undefined && enemy.tag <= 0) {
      enemy.hp = Math.min(enemy.maxHp, enemy.hp + stats.regen * dt);
    }

    let speedFactor = held.has(enemy.id) ? 0 : globalSlow;
    for (const tower of state.towers) {
      if (tower.kind !== 'clot') continue;
      if (distance(tower.x, tower.y, enemy.x, enemy.y) < DEFENDERS.clot.range) {
        speedFactor = Math.min(speedFactor, DEFENDERS.clot.slow);
        // Deliberate (D10): wear is per body, so a crowded clot buckles fast.
        tower.hp -= DEFENDERS.clot.wear * dt;
      }
    }

    const generationFactor = enemy.generation === 1 ? SPLIT_SPEED_FACTOR : 1;
    enemy.distance += stats.speed * generationFactor * speedFactor * dt;
    [enemy.x, enemy.y] = positionAt(state.path, enemy.distance);

    if (enemy.distance >= state.path.total) {
      dead.add(enemy.id);
      state.tissue -= 1;
      state.waveLeaks += 1;
    }

    applyToxinStun(state, enemy);
    applyPoison(state, enemy, dt);
  }
}
```

Two behaviours worth naming because they look like bugs and are not: the clot wear loop runs once per enemy inside the zone (decision D10), and a leaked enemy still stuns and still poisons on the step it leaks (decision D11).

- [ ] **Step 13: Write `src/game/systems/hazards.ts`**

Ports prototype lines 616–620 (bleed), 653–658 (toxin stun) and 659–664 (poison).

```ts
import { PATHOGENS } from '../content/pathogens';
import {
  BLEED_AMOUNT, BLEED_INTERVAL, POISON_DPS_ANTIBODY, POISON_DPS_OTHER, POISON_RADIUS,
  TOXIN_STUN_RADIUS,
} from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState } from '../types';

/**
 * Wound cases bleed energy every second until a clot exists. Prototype line 617,
 * clamped at the source rather than in the display (decision D3).
 */
export function applyWoundBleed(state: SimState, dt: number): void {
  if (state.rule !== 'wound') return;
  if (state.towers.some((tower) => tower.kind === 'clot')) return;

  state.bleedTimer += dt;
  if (state.bleedTimer < BLEED_INTERVAL) return;

  state.bleedTimer = 0;
  state.energy = Math.max(0, state.energy - BLEED_AMOUNT);
}

/** Clots and memory cells are unaffected. Asset sheet line 542. */
export function applyToxinStun(state: SimState, enemy: Enemy): void {
  const stun = PATHOGENS[enemy.kind].stun;
  if (stun === undefined) return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot' || tower.kind === 'mem') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < TOXIN_STUN_RADIUS) {
      tower.stun = Math.max(tower.stun, stun);
    }
  }
}

/** Poison cases damage defenders directly. Antibodies resist far better. Prototype line 662. */
export function applyPoison(state: SimState, enemy: Enemy, dt: number): void {
  if (state.rule !== 'poison') return;

  for (const tower of state.towers) {
    if (tower.kind === 'clot') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) < POISON_RADIUS) {
      tower.hp -= (tower.kind === 'anti' ? POISON_DPS_ANTIBODY : POISON_DPS_OTHER) * dt;
    }
  }
}
```

Phase 7 writes the tests for `applyWoundBleed`, `applyToxinStun` and `applyPoison`. They are implemented now because `applyMovement` calls two of them and the file must compile.

- [ ] **Step 14: Write `src/game/systems/movement.test.ts`**

Every expectation is derived from the content constants, never a literal — tuning a speed or a regen rate must not touch this file (spec §9).

```ts
import { describe, expect, it } from 'vitest';
import { applyMovement } from './movement';
import { createSimState } from '../state';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { FEVER_SLOW, SPLIT_SPEED_FACTOR, TISSUE_MAX, TOWER_MAX_HP } from '../content/rules';
import type { PathogenKind, SimState } from '../types';

function fresh(caseId: 'forearm' | 'throat' | 'stomach' = 'forearm'): SimState {
  const state = createSimState({
    caseId, immunity: { staph: 0, film: 0, virus: 0 }, clearedCount: 0, totalKills: 0,
  });
  state.phase = 'wave';
  return state;
}

function spawn(state: SimState, kind: PathogenKind, at = 0) {
  const stats = PATHOGENS[kind];
  const enemy = {
    id: state.nextEnemyId, kind, distance: at, x: 0, y: 0,
    hp: stats.hp, maxHp: stats.hp, tag: 0, generation: 0 as const,
  };
  state.nextEnemyId += 1;
  state.enemies.push(enemy);
  return enemy;
}

describe('applyMovement', () => {
  it('advances an enemy by speed x dt', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed, 6);
  });

  it('freezes an engulfed enemy in place', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set([enemy.id]), new Set());
    expect(enemy.distance).toBe(0);
  });

  it('slows everything by the fever factor while fever is active', () => {
    const state = fresh();
    state.fever = 5;
    const enemy = spawn(state, 'staph');
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed * FEVER_SLOW, 6);
  });

  it('moves split children slower than their parent', () => {
    const state = fresh('throat');
    const enemy = spawn(state, 'virus');
    state.enemies[0] = { ...enemy, generation: 1 };
    applyMovement(state, 1, new Set(), new Set());
    expect(state.enemies[0]?.distance).toBeCloseTo(PATHOGENS.virus.speed * SPLIT_SPEED_FACTOR, 6);
  });

  it('burns a tagged enemy at the tag damage rate and lets the tag expire', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    enemy.tag = 1;
    applyMovement(state, 0.5, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(PATHOGENS.staph.hp - DEFENDERS.anti.dot * 0.5, 6);
    expect(enemy.tag).toBeCloseTo(0.5, 6);
  });

  it('regenerates a spore that is not tagged, capped at full health', () => {
    const state = fresh('throat');
    const enemy = spawn(state, 'spore');
    const regen = PATHOGENS.spore.regen!;
    enemy.hp = enemy.maxHp - 2 * regen;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - regen, 6);

    enemy.hp = enemy.maxHp - regen / 2;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('stops a spore regenerating while it is tagged', () => {
    const state = fresh('throat');
    const enemy = spawn(state, 'spore');
    enemy.hp = enemy.maxHp - 10;
    enemy.tag = 6;
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.hp).toBeCloseTo(enemy.maxHp - 10 - DEFENDERS.anti.dot, 6);
  });

  it('slows anything inside a clot to the clot factor and wears the clot down', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph');
    state.towers.push({ kind: 'clot', spotIndex: 0, x: 0, y: 46, hp: TOWER_MAX_HP, stun: 0 });
    applyMovement(state, 1, new Set(), new Set());
    expect(enemy.distance).toBeCloseTo(PATHOGENS.staph.speed * DEFENDERS.clot.slow, 6);
    expect(state.towers[0]?.hp).toBeCloseTo(TOWER_MAX_HP - DEFENDERS.clot.wear, 6);
  });

  it('wears a clot once per body inside it — deliberate, decision D10', () => {
    const state = fresh();
    spawn(state, 'staph');
    spawn(state, 'staph');
    state.towers.push({ kind: 'clot', spotIndex: 0, x: 0, y: 46, hp: TOWER_MAX_HP, stun: 0 });
    applyMovement(state, 1, new Set(), new Set());
    expect(state.towers[0]?.hp).toBeCloseTo(TOWER_MAX_HP - 2 * DEFENDERS.clot.wear, 6);
  });

  it('costs one tissue pip when an enemy reaches the end', () => {
    const state = fresh();
    const enemy = spawn(state, 'staph', state.path.total - 1);
    const dead = new Set<number>();
    applyMovement(state, 1, new Set(), dead);
    expect(dead.has(enemy.id)).toBe(true);
    expect(state.tissue).toBe(TISSUE_MAX - 1);
    expect(state.waveLeaks).toBe(1);
  });
});
```

Run: `npx vitest run src/game/systems/movement.test.ts` — Expected: PASS, 10 tests.

- [ ] **Step 15: Write `src/game/step.ts`**

The orchestration order is the whole contract. Phases 5–8 fill in the passes marked as no-ops. Do not reorder anything here later.

Acquisition runs **before** movement (decision D9): phagocytes grab first, movement then freezes what was grabbed on the same step, and the defender pass only digests. The prototype grabbed during the defender pass, after movement, so a newly engulfed enemy slid one extra step — a fix the spec mandates (§5.1).

```ts
import { applyWoundBleed } from './systems/hazards';
import { applyMovement } from './systems/movement';
import { applySpawn } from './systems/spawn';
import { acquireHolds, runDefenders } from './systems/damage';
import { resolveDeaths } from './systems/deaths';
import type { SimState } from './types';

/** Phagocytes hold one target each. Prototype lines 624–630. */
function collectHeld(state: SimState): Set<number> {
  const held = new Set<number>();
  for (const tower of state.towers) {
    if (tower.kind !== 'phago' || tower.holdingEnemyId === null) continue;
    const target = state.enemies.find((e) => e.id === tower.holdingEnemyId);
    if (target === undefined || target.hp <= 0) {
      tower.holdingEnemyId = null;
      continue;
    }
    held.add(target.id);
  }
  return held;
}

export function step(state: SimState, dt: number): void {
  applySpawn(state, dt);
  applyWoundBleed(state, dt);

  const dead = new Set<number>();
  const held = collectHeld(state);
  acquireHolds(state, held, dead);

  applyMovement(state, dt, held, dead);
  runDefenders(state, dt, dead);

  for (const tower of state.towers) {
    if (tower.kind === 'mast' && tower.flash > 0) tower.flash -= dt;
  }

  resolveDeaths(state, dead);

  state.towers = state.towers.filter((tower) => tower.hp > 0);
  for (const beam of state.beams) beam.life -= dt;
  state.beams = state.beams.filter((beam) => beam.life > 0);

  if (state.fever > 0) state.fever = Math.max(0, state.fever - dt);

  if (state.tissue <= 0) {
    state.phase = 'done';
    state.result = 'lost';
    return;
  }
  if (state.queue.length === 0 && state.enemies.length === 0) endWave(state);
}
```

Fever ordering matters and is easy to get backwards. The prototype samples the slow factor and *then* decrements the timer (lines 600–601). Here `applyMovement` reads `state.fever` while it still holds this step's value, and `step` decrements it afterwards. Do not move the decrement above `applyMovement`.

`endWave` lands in Phase 8. For this phase, add a temporary local:

```ts
function endWave(state: SimState): void {
  state.phase = 'built';
}
```

Create `src/game/systems/damage.ts` and `src/game/systems/deaths.ts` now as compiling no-ops so `step` type-checks; Phases 5–6 and 8 fill them in.

```ts
// src/game/systems/damage.ts
import type { SimState } from '../types';

export function acquireHolds(_state: SimState, _held: Set<number>, _dead: Set<number>): void {
  // Implemented in Phase 5 — phagocytes grab before movement (decision D9).
}

export function runDefenders(_state: SimState, _dt: number, _dead: Set<number>): void {
  // Implemented in Phases 5 and 6.
}
```

```ts
// src/game/systems/deaths.ts
import type { SimState } from '../types';

export function resolveDeaths(state: SimState, dead: Set<number>): void {
  if (dead.size === 0) return;
  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));
}
```

- [ ] **Step 16: Write `src/game/hash.ts`**

FNV-1a over a canonical field walk. Numbers are rounded to six decimals so the golden test survives an engine upgrade while still failing on any real behavioural change — a 1e-6 shift in an enemy's position is numeric noise, and a changed damage outcome is never that small.

```ts
import type { SimState } from './types';

export function hashState(state: SimState): string {
  let hash = 0x811c9dc5;

  const mixText = (text: string): void => {
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
  };
  const mix = (value: number): void => mixText(String(Math.round(value * 1e6)));

  mixText(state.caseId);
  mixText(state.phase);
  mixText(state.result ?? 'none');
  mix(state.waveIndex);
  mix(state.energy);
  mix(state.tissue);
  mix(state.fever);
  mix(state.waveKills);
  mix(state.waveLeaks);
  mix(state.totalKills);
  mix(state.queue.length);
  mix(state.rngState);

  for (const tower of state.towers) {
    mixText(tower.kind);
    mix(tower.spotIndex);
    mix(tower.hp);
    mix(tower.stun);
    if (tower.kind === 'phago') { mix(tower.eaten); mix(tower.rest); mix(tower.holdingEnemyId ?? -1); }
    if (tower.kind === 'anti' || tower.kind === 'nk') mix(tower.cooldown);
    if (tower.kind === 'mast') { mix(tower.cooldown); mix(tower.flash); }
    if (tower.kind === 'mem') { mix(tower.cooldown); mix(tower.xp); }
  }

  for (const enemy of state.enemies) {
    mixText(enemy.kind);
    mix(enemy.id);
    mix(enemy.distance);
    mix(enemy.hp);
    mix(enemy.tag);
    mix(enemy.generation);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}
```

- [ ] **Step 17: Write `src/game/loop.ts`**

`GameLoop` is pure: it never touches `requestAnimationFrame` or `document`. Phase 9's `useGameLoop` hook owns those. The snapshot object identity is stable between real changes, which is what `useSyncExternalStore` requires — returning a fresh object every call causes an infinite render loop.

```ts
import { CASE_BY_ID } from './content/cases';
import { FAST_MULTIPLIER, STEP_SECONDS } from './content/rules';
import { step } from './step';
import type { DefenderKind, Phase, ResultKind, SimState } from './types';

const MAX_FRAME_SECONDS = 0.25;
const MAX_STEPS_PER_FRAME = 8;
const HUD_INTERVAL_SECONDS = 0.1;

export interface HudSnapshot {
  readonly phase: Phase;
  readonly result: ResultKind | null;
  readonly energy: number;
  readonly tissue: number;
  readonly waveIndex: number;
  readonly waveCount: number;
  readonly selected: DefenderKind | null;
  readonly fast: boolean;
  readonly feverSeconds: number;
  readonly feverUsed: boolean;
  readonly enemyCount: number;
  /** Bit i is set when build spot i is occupied. Five spots, so no allocation. */
  readonly occupiedMask: number;
  readonly waveKills: number;
  readonly waveLeaks: number;
}

function readSnapshot(state: SimState): HudSnapshot {
  let occupiedMask = 0;
  for (const tower of state.towers) occupiedMask |= 1 << tower.spotIndex;
  return {
    phase: state.phase,
    result: state.result,
    energy: Math.max(0, Math.round(state.energy)),
    tissue: Math.max(0, state.tissue),
    waveIndex: state.waveIndex,
    waveCount: state.waveCount,
    selected: state.selected,
    fast: state.fast,
    feverSeconds: state.fever,
    feverUsed: state.feverUsed,
    enemyCount: state.enemies.length,
    occupiedMask,
    waveKills: state.waveKills,
    waveLeaks: state.waveLeaks,
  };
}

function sameSnapshot(a: HudSnapshot, b: HudSnapshot): boolean {
  return (
    a.phase === b.phase && a.result === b.result && a.energy === b.energy &&
    a.tissue === b.tissue && a.waveIndex === b.waveIndex && a.waveCount === b.waveCount &&
    a.selected === b.selected && a.fast === b.fast &&
    Math.ceil(a.feverSeconds) === Math.ceil(b.feverSeconds) && a.feverUsed === b.feverUsed &&
    a.enemyCount === b.enemyCount && a.occupiedMask === b.occupiedMask &&
    a.waveKills === b.waveKills && a.waveLeaks === b.waveLeaks
  );
}

export class GameLoop {
  #state: SimState;
  #accumulator = 0;
  #hudTimer = 0;
  #snapshot: HudSnapshot;
  #listeners = new Set<() => void>();
  #stepsTaken = 0;

  constructor(state: SimState) {
    this.#state = state;
    this.#snapshot = readSnapshot(state);
  }

  get state(): SimState { return this.#state; }
  get stepsTaken(): number { return this.#stepsTaken; }
  get waveCount(): number { return CASE_BY_ID[this.#state.caseId].waves.length; }

  advance(elapsedSeconds: number): void {
    if (this.#state.phase === 'wave') {
      const scaled = Math.min(elapsedSeconds, MAX_FRAME_SECONDS) *
        (this.#state.fast ? FAST_MULTIPLIER : 1);
      this.#accumulator += scaled;

      let steps = 0;
      while (this.#accumulator >= STEP_SECONDS && steps < MAX_STEPS_PER_FRAME) {
        step(this.#state, STEP_SECONDS);
        this.#accumulator -= STEP_SECONDS;
        this.#stepsTaken += 1;
        steps += 1;
        if (this.#state.phase !== 'wave') break;
      }
      if (steps === MAX_STEPS_PER_FRAME) this.#accumulator = 0;
    } else {
      this.#accumulator = 0;
    }

    this.#hudTimer += elapsedSeconds;
    if (this.#hudTimer >= HUD_INTERVAL_SECONDS) {
      this.#hudTimer = 0;
      this.publish();
    }
  }

  /** Call after any command so the HUD reflects it immediately rather than up to 100 ms late. */
  publish(): void {
    const next = readSnapshot(this.#state);
    if (sameSnapshot(this.#snapshot, next)) return;
    this.#snapshot = next;
    for (const listener of this.#listeners) listener();
  }

  getSnapshot = (): HudSnapshot => this.#snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.#listeners.add(listener);
    return () => { this.#listeners.delete(listener); };
  };

  /** Drop accumulated time. Called when the page becomes visible again. */
  resetClock(): void { this.#accumulator = 0; }
}
```

`feverSeconds` is compared with `Math.ceil` because the HUD displays it as whole seconds (prototype line 1087) — comparing the raw float would re-render the HUD every 100 ms for the whole fever.

- [ ] **Step 18: Write `src/game/loop.test.ts` — the frame-rate independence gate**

This is success criterion 2 from the spec. It is the reason the accumulator exists.

```ts
import { describe, expect, it, vi } from 'vitest';
import { GameLoop } from './loop';
import { createSimState } from './state';
import { buildQueue } from './systems/spawn';
import { hashState } from './hash';
import { FAST_MULTIPLIER, SPAWN_FIRST_DELAY } from './content/rules';
import type { SimState } from './types';

function armed(): SimState {
  const state = createSimState({
    caseId: 'forearm', immunity: { staph: 0, film: 0, virus: 0 }, clearedCount: 0, totalKills: 0,
  });
  state.phase = 'wave';
  state.queue = buildQueue(state);
  state.spawnTimer = SPAWN_FIRST_DELAY;
  return state;
}

function run(frameCount: number, frameSeconds: number): GameLoop {
  const loop = new GameLoop(armed());
  for (let i = 0; i < frameCount; i += 1) loop.advance(frameSeconds);
  return loop;
}

describe('GameLoop', () => {
  it('simulates identically at 60 Hz and 120 Hz', () => {
    const sixty = run(600, 1 / 60);
    const oneTwenty = run(1200, 1 / 120);
    expect(oneTwenty.stepsTaken).toBe(sixty.stepsTaken);
    expect(hashState(oneTwenty.state)).toBe(hashState(sixty.state));
  });

  it('simulates identically at a stuttering 30 Hz', () => {
    const smooth = run(600, 1 / 60);
    const stuttering = run(300, 1 / 30);
    expect(stuttering.stepsTaken).toBe(smooth.stepsTaken);
    expect(hashState(stuttering.state)).toBe(hashState(smooth.state));
  });

  it('takes exactly one step per 1/60 s of elapsed time', () => {
    const loop = run(60, 1 / 60);
    expect(loop.stepsTaken).toBe(60);
  });

  it('does not step outside the wave phase', () => {
    const state = armed();
    state.phase = 'build';
    const loop = new GameLoop(state);
    loop.advance(1);
    expect(loop.stepsTaken).toBe(0);
  });

  it('discards a long stall rather than fast-forwarding the wave', () => {
    const loop = new GameLoop(armed());
    loop.advance(30);
    expect(loop.stepsTaken).toBeLessThanOrEqual(8);
  });

  it('runs twice as much simulation per second at 2x speed', () => {
    const normal = run(60, 1 / 60);
    const state = armed();
    state.fast = true;
    const fast = new GameLoop(state);
    for (let i = 0; i < 60; i += 1) fast.advance(1 / 60);
    expect(fast.stepsTaken).toBe(normal.stepsTaken * FAST_MULTIPLIER);
  });

  it('returns a stable snapshot reference until something changes', () => {
    const loop = new GameLoop(armed());
    const first = loop.getSnapshot();
    loop.publish();
    expect(loop.getSnapshot()).toBe(first);
  });

  it('notifies subscribers when the snapshot changes', () => {
    const loop = new GameLoop(armed());
    const listener = vi.fn();
    loop.subscribe(listener);
    for (let i = 0; i < 60; i += 1) loop.advance(1 / 60);
    expect(listener).toHaveBeenCalled();
    expect(loop.getSnapshot().enemyCount).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 19: Run the loop tests**

Run: `npx vitest run src/game/loop.test.ts`
Expected: PASS, 8 tests. If the 60 Hz / 120 Hz hashes differ, the cause is almost always a `dt` that reached a system unscaled, or a `Set`/`Map` iteration affecting order — not floating-point drift.

- [ ] **Step 20: Write `src/game/commands.ts`**

Player intents as pure transitions over sim state. Ports prototype lines 528–561 and 576.

```ts
import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { FEVER_SECONDS, SPAWN_FIRST_DELAY, TOWER_MAX_HP } from './content/rules';
import { buildQueue } from './systems/spawn';
import type { DefenderKind, SimState, Tower } from './types';

export function isUnlocked(state: SimState, kind: DefenderKind): boolean {
  return state.clearedCount >= DEFENDERS[kind].unlock;
}

export function unlockedDefenders(state: SimState): readonly DefenderKind[] {
  return DEFENDER_ORDER.filter((kind) => isUnlocked(state, kind));
}

export function selectDefender(state: SimState, kind: DefenderKind): void {
  if (!isUnlocked(state, kind)) return;
  state.selected = state.selected === kind ? null : kind;
}

function createTower(kind: DefenderKind, spotIndex: number, x: number, y: number): Tower {
  const base = { spotIndex, x, y, hp: TOWER_MAX_HP, stun: 0 };
  switch (kind) {
    case 'phago': return { ...base, kind, holdingEnemyId: null, eaten: 0, rest: 0 };
    case 'clot': return { ...base, kind };
    case 'anti': return { ...base, kind, cooldown: 0 };
    case 'nk': return { ...base, kind, cooldown: 0 };
    case 'mast': return { ...base, kind, cooldown: 0, flash: 0 };
    case 'mem': return { ...base, kind, cooldown: 0, xp: 0 };
  }
}

/** Returns true when a defender was actually placed. */
export function placeDefender(state: SimState, spotIndex: number): boolean {
  const kind = state.selected;
  if (kind === null) return false;

  const spot = CASE_BY_ID[state.caseId].spots[spotIndex];
  if (spot === undefined) return false;
  if (state.towers.some((tower) => tower.spotIndex === spotIndex)) return false;

  const stats = DEFENDERS[kind];
  if (state.energy < stats.cost) return false;

  state.towers.push(createTower(kind, spotIndex, spot[0], spot[1]));
  state.energy -= stats.cost;
  return true;
}

export function startWave(state: SimState): void {
  if (state.phase !== 'build' && state.phase !== 'built') return;
  state.queue = buildQueue(state);
  state.spawnTimer = SPAWN_FIRST_DELAY;
  state.phase = 'wave';
  state.selected = null;
  state.fever = 0;
  state.feverUsed = false;
  state.waveKills = 0;
  state.waveLeaks = 0;
  state.result = null;
}

/** Named triggerFever, not useFever: a `use` prefix would read as a React hook to eslint-plugin-react-hooks. */
export function triggerFever(state: SimState): void {
  if (state.feverUsed || state.phase !== 'wave') return;
  state.fever = FEVER_SECONDS;
  state.feverUsed = true;
}

export function toggleSpeed(state: SimState): void {
  state.fast = !state.fast;
}
```

`advanceToNextWave` lands in Phase 8 with the rest of the run flow.

- [ ] **Step 21: Write `src/game/commands.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { placeDefender, selectDefender, startWave, toggleSpeed, unlockedDefenders, triggerFever } from './commands';
import { createSimState } from './state';
import { CASE_BY_ID } from './content/cases';
import { DEFENDERS, DEFENDER_ORDER } from './content/defenders';
import { FEVER_SECONDS, SPAWN_FIRST_DELAY } from './content/rules';
import type { SimState } from './types';

function fresh(clearedCount = 0): SimState {
  return createSimState({
    caseId: 'forearm', immunity: { staph: 0, film: 0, virus: 0 }, clearedCount, totalKills: 0,
  });
}

describe('selectDefender', () => {
  it('toggles the selection off when tapped twice', () => {
    const state = fresh();
    selectDefender(state, 'clot');
    expect(state.selected).toBe('clot');
    selectDefender(state, 'clot');
    expect(state.selected).toBeNull();
  });

  it('ignores a locked defender', () => {
    const state = fresh(0);
    selectDefender(state, 'mast');
    expect(state.selected).toBe('phago');
  });
});

describe('unlockedDefenders', () => {
  it('offers exactly the defenders whose unlock tier is met, in dock order', () => {
    for (let cleared = 0; cleared <= CASE_BY_ID.forearm.waves.length; cleared += 1) {
      const expected = DEFENDER_ORDER.filter((kind) => DEFENDERS[kind].unlock <= cleared);
      expect(unlockedDefenders(fresh(cleared))).toEqual(expected);
    }
  });

  it('offers every defender once every unlock tier is met', () => {
    const maxUnlock = Math.max(...DEFENDER_ORDER.map((kind) => DEFENDERS[kind].unlock));
    expect(unlockedDefenders(fresh(maxUnlock))).toEqual(DEFENDER_ORDER);
  });
});

describe('placeDefender', () => {
  it('places the selected defender and charges its cost', () => {
    const state = fresh();
    const before = state.energy;
    expect(placeDefender(state, 0)).toBe(true);
    expect(state.towers).toHaveLength(1);
    expect(state.energy).toBe(before - DEFENDERS[state.towers[0]!.kind].cost);
  });

  it('refuses an occupied spot', () => {
    const state = fresh();
    placeDefender(state, 0);
    expect(placeDefender(state, 0)).toBe(false);
    expect(state.towers).toHaveLength(1);
  });

  it('refuses when energy is short', () => {
    const state = fresh();
    state.energy = DEFENDERS.phago.cost - 1;
    expect(placeDefender(state, 0)).toBe(false);
  });

  it('refuses with nothing selected', () => {
    const state = fresh();
    state.selected = null;
    expect(placeDefender(state, 0)).toBe(false);
  });

  it('refuses a spot index the case does not have', () => {
    expect(placeDefender(fresh(), 9)).toBe(false);
  });
});

describe('startWave', () => {
  it('fills the queue, arms the spawn timer and clears the selection', () => {
    const state = fresh();
    const expectedSize = CASE_BY_ID.forearm.waves[0]!.reduce((sum, e) => sum + e.count, 0);
    startWave(state);
    expect(state.phase).toBe('wave');
    expect(state.queue).toHaveLength(expectedSize);
    expect(state.selected).toBeNull();
    expect(state.spawnTimer).toBeCloseTo(SPAWN_FIRST_DELAY, 6);
  });
});

describe('triggerFever', () => {
  it('is available once per wave and only during a wave', () => {
    const state = fresh();
    triggerFever(state);
    expect(state.fever).toBe(0);

    startWave(state);
    triggerFever(state);
    expect(state.fever).toBe(FEVER_SECONDS);
    expect(state.feverUsed).toBe(true);

    state.fever = 0;
    triggerFever(state);
    expect(state.fever).toBe(0);
  });
});

describe('toggleSpeed', () => {
  it('flips between 1x and 2x', () => {
    const state = fresh();
    toggleSpeed(state);
    expect(state.fast).toBe(true);
    toggleSpeed(state);
    expect(state.fast).toBe(false);
  });
});
```

Run: `npx vitest run src/game/commands.test.ts` — Expected: PASS, 12 tests.

- [ ] **Step 22: Run the full gate**

Run: `npm run verify`
Expected: all green. `npm run typecheck:game` proves the whole simulation compiles with no DOM lib — if it fails, something reached for a browser global.

- [ ] **Step 23: Commit**

```bash
git add -A
git commit -m "feat(game): fixed-step loop, seeded RNG, path geometry, spawn and movement"
```

**Verification command:** `npm run verify`
**Passing looks like:** 60 Hz and 120 Hz produce identical state hashes and identical step counts; `typecheck:game` clean.

---

## Phase 4 — Pixi board renderer

**Why now:** the sim state types are complete, so the renderer can be written against all of them at once even though Phases 5–8 have not yet filled them in. This is the first phase that produces something to look at, and it de-risks Pixi early rather than at the end.

**Files:**
- Create: `src/render/viewport.ts` + `viewport.test.ts`
- Create: `src/render/colors.ts`, `src/render/shapes.ts`
- Create: `src/render/layers/PathLayer.ts`, `TowerLayer.ts`, `EnemyLayer.ts`, `BeamLayer.ts`
- Create: `src/render/BoardRenderer.ts`
- Create: `src/app/components/BoardCanvas.tsx`, `src/app/state/useGameLoop.ts`
- Modify: `src/app/pages/FightPage.tsx` — mount the canvas with a temporary auto-started wave
- Port from: prototype lines 828–911 (`boardLayer`)

**Interfaces:**
- Consumes: `SimState`, `Tower`, `Enemy`, `Beam`, `palette`, `CASE_BY_ID`, `GameLoop`.
- Produces:
  - `interface Viewport { scale: number; offsetX: number; offsetY: number }`
  - `coverViewport(w, h): Viewport`, `worldToScreen(v, x, y): [number, number]`, `screenToWorld(v, x, y): [number, number]`, `hitBuildSpot(caseId, wx, wy): number | null`
  - `class BoardRenderer` with `static create(host: HTMLElement, caseId: CaseId): Promise<BoardRenderer>`, `draw(state: SimState): void`, `resize(): void`, `destroy(): void`, `readonly canvas: HTMLCanvasElement`
  - `useGameLoop(loop: GameLoop | null, onFrame: (state: SimState) => void): void`

- [ ] **Step 1: Write the failing viewport test**

The board is 374×430 in world units and is drawn with `preserveAspectRatio: xMidYMid slice` in the prototype (line 910) — that is a cover fit, not a contain fit. Getting this backwards puts build spots under the player's finger by tens of pixels.

`src/render/viewport.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { coverViewport, hitBuildSpot, screenToWorld, worldToScreen } from './viewport';

describe('coverViewport', () => {
  it('scales to fill and centres the overflow on a taller canvas', () => {
    const v = coverViewport(374, 860);
    expect(v.scale).toBe(2);
    expect(v.offsetX).toBe(374 / 2 - 374);
    expect(v.offsetY).toBe(0);
  });

  it('scales to fill and centres the overflow on a wider canvas', () => {
    const v = coverViewport(748, 430);
    expect(v.scale).toBe(2);
    expect(v.offsetX).toBe(0);
    expect(v.offsetY).toBe(430 / 2 - 430);
  });

  it('is exactly 1:1 at the native size', () => {
    expect(coverViewport(374, 430)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 });
  });
});

describe('worldToScreen and screenToWorld', () => {
  it('round-trip for any point', () => {
    const v = coverViewport(500, 900);
    const [sx, sy] = worldToScreen(v, 187, 215);
    const [wx, wy] = screenToWorld(v, sx, sy);
    expect(wx).toBeCloseTo(187, 6);
    expect(wy).toBeCloseTo(215, 6);
  });
});

describe('hitBuildSpot', () => {
  it('finds the spot when the tap lands on its centre', () => {
    expect(hitBuildSpot('forearm', 70, 118)).toBe(0);
    expect(hitBuildSpot('forearm', 206, 372)).toBe(4);
  });

  it('accepts a tap within the spot radius', () => {
    expect(hitBuildSpot('forearm', 70 + 20, 118)).toBe(0);
  });

  it('returns null for a tap on empty tissue', () => {
    expect(hitBuildSpot('forearm', 5, 5)).toBeNull();
  });

  it('returns the nearest spot when two are close', () => {
    expect(hitBuildSpot('forearm', 71, 119)).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails, then implement `src/render/viewport.ts`**

Run: `npx vitest run src/render/viewport.test.ts` — Expected: FAIL, unresolved import.

```ts
import { CASE_BY_ID } from '@game/content/cases';
import { BOARD_HEIGHT, BOARD_WIDTH, BUILD_SPOT_RADIUS } from '@game/content/rules';
import type { CaseId } from '@game/types';

export interface Viewport {
  readonly scale: number;
  readonly offsetX: number;
  readonly offsetY: number;
}

/** Cover fit, matching the prototype's preserveAspectRatio="xMidYMid slice". */
export function coverViewport(canvasWidth: number, canvasHeight: number): Viewport {
  const scale = Math.max(canvasWidth / BOARD_WIDTH, canvasHeight / BOARD_HEIGHT);
  return {
    scale,
    offsetX: (canvasWidth - BOARD_WIDTH * scale) / 2,
    offsetY: (canvasHeight - BOARD_HEIGHT * scale) / 2,
  };
}

export function worldToScreen(v: Viewport, x: number, y: number): [number, number] {
  return [x * v.scale + v.offsetX, y * v.scale + v.offsetY];
}

export function screenToWorld(v: Viewport, x: number, y: number): [number, number] {
  return [(x - v.offsetX) / v.scale, (y - v.offsetY) / v.scale];
}

/** The nearest build spot within its tap radius, in world coordinates. */
export function hitBuildSpot(caseId: CaseId, worldX: number, worldY: number): number | null {
  let best: number | null = null;
  let bestDistance = BUILD_SPOT_RADIUS;

  CASE_BY_ID[caseId].spots.forEach((spot, index) => {
    const dx = spot[0] - worldX;
    const dy = spot[1] - worldY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d <= bestDistance) {
      bestDistance = d;
      best = index;
    }
  });

  return best;
}
```

Run: `npx vitest run src/render/viewport.test.ts` — Expected: PASS, 8 tests.

- [ ] **Step 3: Write `src/render/colors.ts`**

The one place a token becomes a Pixi colour. Everything downstream asks for a token, never a hex.

```ts
import { palette, type PaletteToken } from '@theme/tokens';
import { DEFENDERS } from '@game/content/defenders';
import { PATHOGENS } from '@game/content/pathogens';
import type { DefenderKind, PathogenKind } from '@game/types';

export function tokenHex(token: PaletteToken): number {
  return palette[token].hex;
}

export function defenderHex(kind: DefenderKind): number {
  return tokenHex(DEFENDERS[kind].token);
}

export function pathogenHex(kind: PathogenKind): number {
  return tokenHex(PATHOGENS[kind].token);
}

/** Screen paper. Every glyph inside a cell body is cut out of the cell in this colour. */
export const PAPER = 0xfbf7f0;
export const HEALTH_TRACK = tokenHex('notReached');
export const HEALTH_FILL = 0x9c2a1c;
export const ENEMY_CORE = 0x5b2419;
export const EMPTY_SPOT_STROKE = 0xb4ada2;
export const EMPTY_SPOT_FILL = 0xfcfaf6;
export const EMPTY_SPOT_CROSS = 0x958e84;
```

The five literal hexes replace prototype colours that appear exactly once each and describe a drawing detail rather than a role: `oklch(0.5 0.16 20)` health fill (line 906), `oklch(0.35 0.09 20)` enemy core (line 902), and the three empty-spot greys (lines 878–885). Converting them by hand here rather than adding role tokens keeps the palette honest — a token means "this colour carries meaning", and these do not.

- [ ] **Step 4: Write `src/render/shapes.ts`**

The whole art vocabulary. Flat, filled, never outlined except to show a range or an empty slot.

```ts
import { Graphics } from 'pixi.js';

export function filledCircle(g: Graphics, x: number, y: number, r: number, color: number, alpha = 1): void {
  g.circle(x, y, r).fill({ color, alpha });
}

export function ring(
  g: Graphics, x: number, y: number, r: number, color: number, width: number, alpha = 1,
): void {
  g.circle(x, y, r).stroke({ color, width, alpha });
}

export function dashedRing(
  g: Graphics, x: number, y: number, r: number, color: number, width: number,
  dash: number, gap: number, alpha = 1,
): void {
  const circumference = 2 * Math.PI * r;
  const segments = Math.max(4, Math.round(circumference / (dash + gap)));
  const arc = (2 * Math.PI) / segments;
  const filled = arc * (dash / (dash + gap));
  for (let i = 0; i < segments; i += 1) {
    const start = i * arc;
    g.arc(x, y, r, start, start + filled).stroke({ color, width, alpha });
  }
}

export function roundedSquare(
  g: Graphics, cx: number, cy: number, half: number, radius: number, color: number,
): void {
  g.roundRect(cx - half, cy - half, half * 2, half * 2, radius).fill({ color });
}

export function bar(
  g: Graphics, x: number, y: number, width: number, height: number, radius: number, color: number,
  alpha = 1,
): void {
  g.roundRect(x, y, width, height, radius).fill({ color, alpha });
}

export function thickLine(
  g: Graphics, x1: number, y1: number, x2: number, y2: number, color: number, width: number,
  alpha = 1,
): void {
  g.moveTo(x1, y1).lineTo(x2, y2).stroke({ color, width, alpha, cap: 'round' });
}

export function polyline(
  g: Graphics, points: readonly (readonly [number, number])[], color: number, width: number,
): void {
  const first = points[0];
  if (first === undefined) return;
  g.moveTo(first[0], first[1]);
  for (let i = 1; i < points.length; i += 1) g.lineTo(points[i]![0], points[i]![1]);
  g.stroke({ color, width, cap: 'round', join: 'round' });
}
```

Pixi v8 has no native dashed stroke, so `dashedRing` approximates one with arcs. It is used for clot zones, tag rings and empty build spots — all of which the asset sheet describes as `stroke-dasharray` outlines.

- [ ] **Step 5: Write `src/render/layers/PathLayer.ts`**

The vessel is static for the whole case, so it is drawn once. Two strokes: 34 casing, 22 lumen (asset sheet line 694).

```ts
import { Container, Graphics } from 'pixi.js';
import { CASE_BY_ID } from '@game/content/cases';
import type { CaseId } from '@game/types';
import { tokenHex } from '../colors';
import { polyline } from '../shapes';

export class PathLayer {
  readonly container = new Container();

  constructor(caseId: CaseId) {
    const points = CASE_BY_ID[caseId].path;
    const casing = new Graphics();
    const lumen = new Graphics();
    polyline(casing, points, tokenHex('vesselCasing'), 34);
    polyline(lumen, points, tokenHex('vesselLumen'), 22);
    this.container.addChild(casing, lumen);
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 6: Write `src/render/layers/EnemyLayer.ts`**

Pooled per entity: one `Graphics` created when an enemy appears, repositioned each frame, destroyed when it dies. Redrawing every enemy's geometry every frame rebuilds Pixi's geometry batches and is the thing that falls over first in a WKWebView. Geometry is only rebuilt when an enemy's *appearance* changes — health bar, tag ring, regen halo — not when it merely moves.

```ts
import { Container, Graphics } from 'pixi.js';
import { PATHOGENS } from '@game/content/pathogens';
import { SPLIT_RADIUS_FACTOR } from '@game/content/rules';
import type { Enemy, SimState } from '@game/types';
import { ENEMY_CORE, HEALTH_FILL, defenderHex, pathogenHex } from '../colors';
import { bar, dashedRing, filledCircle, ring, roundedSquare } from '../shapes';

interface EnemyView {
  readonly graphics: Graphics;
  /** Everything that changes the drawing rather than the position. */
  signature: string;
}

function signatureOf(enemy: Enemy): string {
  const stats = PATHOGENS[enemy.kind];
  const health = Math.round((enemy.hp / enemy.maxHp) * 24);
  const tagged = enemy.tag > 0 ? 1 : 0;
  const full = stats.regen !== undefined && enemy.hp >= enemy.maxHp && enemy.tag <= 0 ? 1 : 0;
  return `${String(health)}:${String(tagged)}:${String(full)}`;
}

function paint(graphics: Graphics, enemy: Enemy): void {
  graphics.clear();
  const stats = PATHOGENS[enemy.kind];
  const r = stats.radius * (enemy.generation === 1 ? SPLIT_RADIUS_FACTOR : 1);
  const color = pathogenHex(enemy.kind);

  if (enemy.tag > 0) dashedRing(graphics, 0, 0, r + 6, defenderHex('anti'), 3, 3, 4);
  if (stats.noTag === true) ring(graphics, 0, 0, r + 5, color, 2.5);

  if (stats.shape === 'circle') {
    filledCircle(graphics, 0, 0, r, color);
  } else {
    roundedSquare(graphics, 0, 0, r, 3, color);
  }
  filledCircle(graphics, 0, 0, r * 0.35, ENEMY_CORE);

  if (stats.regen !== undefined && enemy.hp >= enemy.maxHp && enemy.tag <= 0) {
    ring(graphics, 0, 0, r + 4, color, 2, 0.5);
  }

  if (enemy.hp < enemy.maxHp) {
    const top = -r - 9;
    bar(graphics, -11, top, 22, 4, 2, 0xfafaf7, 0.8);
    bar(graphics, -11, top, (22 * Math.max(0, enemy.hp)) / enemy.maxHp, 4, 2, HEALTH_FILL);
  }
}

export class EnemyLayer {
  readonly container = new Container();
  readonly #views = new Map<number, EnemyView>();

  draw(state: SimState): void {
    const live = new Set<number>();

    for (const enemy of state.enemies) {
      live.add(enemy.id);
      let view = this.#views.get(enemy.id);
      if (view === undefined) {
        const graphics = new Graphics();
        view = { graphics, signature: '' };
        this.#views.set(enemy.id, view);
        this.container.addChild(graphics);
      }

      const signature = signatureOf(enemy);
      if (signature !== view.signature) {
        paint(view.graphics, enemy);
        view.signature = signature;
      }

      view.graphics.position.set(enemy.x, enemy.y);
      view.graphics.rotation = PATHOGENS[enemy.kind].shape === 'diamond' ? Math.PI / 4 : 0;
    }

    for (const [id, view] of this.#views) {
      if (live.has(id)) continue;
      view.graphics.destroy();
      this.#views.delete(id);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.#views.clear();
  }
}
```

Kills are instant with no death animation (asset sheet line 1000). Destroying the graphics on the frame the enemy leaves sim state is exactly that rule, expressed in code — there is nowhere for a death animation to live.

- [ ] **Step 7: Write `src/render/layers/TowerLayer.ts`**

Towers change appearance rarely (stun, rest, health, engulf tether, memory XP), so the same signature approach applies. Empty build spots live here because they occupy the same positions.

```ts
import { Container, Graphics } from 'pixi.js';
import { CASE_BY_ID } from '@game/content/cases';
import { DEFENDERS } from '@game/content/defenders';
import { TOWER_MAX_HP } from '@game/content/rules';
import type { CaseId, SimState, Tower } from '@game/types';
import {
  EMPTY_SPOT_CROSS, EMPTY_SPOT_FILL, EMPTY_SPOT_STROKE, HEALTH_TRACK, PAPER, defenderHex,
} from '../colors';
import { bar, dashedRing, filledCircle, ring, roundedSquare, thickLine } from '../shapes';

function isSpent(tower: Tower): boolean {
  if (tower.stun > 0) return true;
  return tower.kind === 'phago' && tower.rest > DEFENDERS.phago.gap;
}

function signatureOf(tower: Tower): string {
  const parts = [tower.kind, String(Math.round(tower.hp)), isSpent(tower) ? 's' : '-'];
  if (tower.kind === 'phago') parts.push(tower.holdingEnemyId === null ? '-' : 'h');
  if (tower.kind === 'mast') parts.push(tower.flash > 0 ? 'f' : '-');
  if (tower.kind === 'mem') parts.push(String(Math.round(tower.xp)));
  return parts.join(':');
}

function paintBody(g: Graphics, tower: Tower): void {
  g.clear();
  const stats = DEFENDERS[tower.kind];
  const color = defenderHex(tower.kind);
  const spent = isSpent(tower);
  const alpha = spent ? 0.4 : 1;

  if (tower.kind === 'clot') {
    filledCircle(g, 0, 0, stats.range, color, 0.13);
    dashedRing(g, 0, 0, stats.range, color, 2.5, 7, 6, 0.6);
  } else {
    filledCircle(g, 0, 0, stats.range, color, 0.1);
  }
  if (tower.kind === 'mast' && tower.flash > 0) filledCircle(g, 0, 0, stats.range, color, 0.22);

  filledCircle(g, 0, 0, 20, color, alpha);
  ring(g, 0, 0, 20, PAPER, 4, alpha);
  if (spent) dashedRing(g, 0, 0, 20, color, 3, 4, 6);

  switch (tower.kind) {
    case 'phago':
      filledCircle(g, 0, 0, tower.holdingEnemyId === null ? 6 : 9, PAPER, spent ? 0.5 : 1);
      break;
    case 'anti':
      bar(g, -8, -3, 16, 6, 3, PAPER);
      break;
    case 'clot':
      ring(g, 0, 0, 7, PAPER, 3.5);
      break;
    case 'nk':
      roundedSquare(g, 0, 0, 6, 2, PAPER);
      break;
    case 'mast':
      filledCircle(g, 0, -7, 3.2, PAPER);
      filledCircle(g, -6, 4, 3.2, PAPER);
      filledCircle(g, 6, 4, 3.2, PAPER);
      break;
    case 'mem':
      ring(g, 0, 0, 8, PAPER, 3);
      filledCircle(g, 0, 0, 3, PAPER);
      break;
  }

  if (tower.hp < TOWER_MAX_HP) {
    bar(g, -14, -30, 28, 4, 2, HEALTH_TRACK);
    bar(g, -14, -30, (28 * Math.max(0, tower.hp)) / TOWER_MAX_HP, 4, 2, color);
  }
}

interface TowerView {
  readonly body: Graphics;
  signature: string;
}

export class TowerLayer {
  readonly container = new Container();
  readonly #spots = new Graphics();
  readonly #tethers = new Graphics();
  readonly #views = new Map<number, TowerView>();
  readonly #caseId: CaseId;
  #spotsSignature = '';

  constructor(caseId: CaseId) {
    this.#caseId = caseId;
    this.container.addChild(this.#spots, this.#tethers);
  }

  draw(state: SimState): void {
    this.#drawSpots(state);

    const live = new Set<number>();
    for (const tower of state.towers) {
      live.add(tower.spotIndex);
      let view = this.#views.get(tower.spotIndex);
      if (view === undefined) {
        const body = new Graphics();
        body.position.set(tower.x, tower.y);
        view = { body, signature: '' };
        this.#views.set(tower.spotIndex, view);
        this.container.addChild(body);
      }
      const signature = signatureOf(tower);
      if (signature !== view.signature) {
        paintBody(view.body, tower);
        view.signature = signature;
      }
    }

    for (const [index, view] of this.#views) {
      if (live.has(index)) continue;
      view.body.destroy();
      this.#views.delete(index);
    }

    this.#drawTethers(state);
  }

  #drawSpots(state: SimState): void {
    const showing = state.phase === 'build' || state.phase === 'built';
    let occupied = 0;
    for (const tower of state.towers) occupied |= 1 << tower.spotIndex;
    const signature = `${showing ? 'y' : 'n'}:${String(occupied)}:${state.selected ?? '-'}`;
    if (signature === this.#spotsSignature) return;
    this.#spotsSignature = signature;

    this.#spots.clear();
    if (!showing) return;

    const stroke = state.selected === null ? EMPTY_SPOT_STROKE : defenderHex('phago');
    CASE_BY_ID[this.#caseId].spots.forEach(([x, y], index) => {
      if ((occupied & (1 << index)) !== 0) return;
      filledCircle(this.#spots, x, y, 24, EMPTY_SPOT_FILL, 0.5);
      dashedRing(this.#spots, x, y, 24, stroke, 3, 6, 6);
      bar(this.#spots, x - 7, y - 1.5, 14, 3, 1.5, EMPTY_SPOT_CROSS);
      bar(this.#spots, x - 1.5, y - 7, 3, 14, 1.5, EMPTY_SPOT_CROSS);
    });
  }

  #drawTethers(state: SimState): void {
    this.#tethers.clear();
    for (const tower of state.towers) {
      if (tower.kind !== 'phago' || tower.holdingEnemyId === null) continue;
      const target = state.enemies.find((e) => e.id === tower.holdingEnemyId);
      if (target === undefined) continue;
      thickLine(this.#tethers, tower.x, tower.y, target.x, target.y, defenderHex('phago'), 9, 0.5);
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
    this.#views.clear();
  }
}
```

The memory cell's earned bonus is printed under the cell in the prototype (line 863). That is a `Text` object, so it is added in Phase 6 alongside the learn mechanic rather than here — it needs `tower.xp` to be non-zero to be worth drawing at all.

- [ ] **Step 8: Write `src/render/layers/BeamLayer.ts`**

Beams live at most 0.22 s and there are few of them, so a single cleared-and-redrawn `Graphics` is correct here.

```ts
import { Container, Graphics } from 'pixi.js';
import type { SimState } from '@game/types';
import { defenderHex } from '../colors';
import { thickLine } from '../shapes';

export class BeamLayer {
  readonly container = new Container();
  readonly #graphics = new Graphics();

  constructor() {
    this.container.addChild(this.#graphics);
  }

  draw(state: SimState): void {
    this.#graphics.clear();
    for (const beam of state.beams) {
      const width = beam.source === 'nk' ? 7 : 4;
      thickLine(
        this.#graphics, beam.fromX, beam.fromY, beam.toX, beam.toY,
        defenderHex(beam.source), width, 0.85,
      );
    }
  }

  destroy(): void {
    this.container.destroy({ children: true });
  }
}
```

- [ ] **Step 9: Write `src/render/BoardRenderer.ts`**

Pixi v8's `Application.init` is async, and React 19 StrictMode mounts effects twice in development. The cancellation flag in `BoardCanvas` handles that; `BoardRenderer` only has to be safely destroyable.

Layer order matches the prototype's draw order (lines 831–908): vessel, towers with their range fills, beams, enemies.

```ts
import { Application, Container } from 'pixi.js';
import type { CaseId, SimState } from '@game/types';
import { BeamLayer } from './layers/BeamLayer';
import { EnemyLayer } from './layers/EnemyLayer';
import { PathLayer } from './layers/PathLayer';
import { TowerLayer } from './layers/TowerLayer';
import { coverViewport, type Viewport } from './viewport';

export class BoardRenderer {
  #app: Application;
  #world = new Container();
  #path: PathLayer;
  #towers: TowerLayer;
  #beams = new BeamLayer();
  #enemies = new EnemyLayer();
  #viewport: Viewport = { scale: 1, offsetX: 0, offsetY: 0 };

  private constructor(app: Application, caseId: CaseId) {
    this.#app = app;
    this.#path = new PathLayer(caseId);
    this.#towers = new TowerLayer(caseId);
    this.#world.addChild(
      this.#path.container, this.#towers.container, this.#beams.container, this.#enemies.container,
    );
    this.#app.stage.addChild(this.#world);
    this.resize();
  }

  static async create(host: HTMLElement, caseId: CaseId): Promise<BoardRenderer> {
    const app = new Application();
    await app.init({
      resizeTo: host,
      backgroundAlpha: 0,
      antialias: true,
      autoDensity: true,
      autoStart: false,
      sharedTicker: false,
      resolution: globalThis.devicePixelRatio,
    });
    host.appendChild(app.canvas);
    return new BoardRenderer(app, caseId);
  }

  get canvas(): HTMLCanvasElement {
    return this.#app.canvas;
  }

  get viewport(): Viewport {
    return this.#viewport;
  }

  resize(): void {
    this.#viewport = coverViewport(this.#app.screen.width, this.#app.screen.height);
    this.#world.scale.set(this.#viewport.scale);
    this.#world.position.set(this.#viewport.offsetX, this.#viewport.offsetY);
  }

  draw(state: SimState): void {
    this.#towers.draw(state);
    this.#beams.draw(state);
    this.#enemies.draw(state);
    this.#app.render();
  }

  destroy(): void {
    this.#path.destroy();
    this.#towers.destroy();
    this.#beams.destroy();
    this.#enemies.destroy();
    this.#app.destroy(true, { children: true });
  }
}
```

`autoStart: false` and `sharedTicker: false` matter: Pixi must not own a second frame loop. There is one rAF in the application and it lives in `useGameLoop`.

- [ ] **Step 10: Write `src/app/state/useGameLoop.ts`**

This is where `requestAnimationFrame` and `visibilitychange` live — deliberately outside `src/game/`, because the loop must be testable without a browser.

```ts
import { useEffect, useRef } from 'react';
import type { GameLoop } from '@game/loop';
import type { SimState } from '@game/types';

/**
 * Drives one GameLoop from one animation frame callback. The simulation pauses
 * while the page is hidden, so backgrounding never costs a wave.
 */
export function useGameLoop(loop: GameLoop | null, onFrame: (state: SimState) => void): void {
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    if (loop === null) return;

    let handle = 0;
    let previous = 0;

    const frame = (timestamp: number): void => {
      handle = requestAnimationFrame(frame);
      if (document.hidden) {
        previous = 0;
        return;
      }
      const now = timestamp / 1000;
      const elapsed = previous === 0 ? 0 : now - previous;
      previous = now;
      loop.advance(elapsed);
      onFrameRef.current(loop.state);
    };

    const onVisibilityChange = (): void => {
      previous = 0;
      loop.resetClock();
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    handle = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(handle);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [loop]);
}
```

- [ ] **Step 11: Write `src/app/components/BoardCanvas.tsx`**

```tsx
import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { BoardRenderer } from '@render/BoardRenderer';
import { hitBuildSpot, screenToWorld } from '@render/viewport';
import type { CaseId } from '@game/types';

interface BoardCanvasProps {
  readonly caseId: CaseId;
  readonly onRendererReady: (renderer: BoardRenderer | null) => void;
  readonly onSpotTap: (spotIndex: number) => void;
}

export function BoardCanvas({ caseId, onRendererReady, onSpotTap }: BoardCanvasProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [renderer, setRenderer] = useState<BoardRenderer | null>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (host === null) return;

    let cancelled = false;
    let created: BoardRenderer | null = null;

    void BoardRenderer.create(host, caseId).then((instance) => {
      if (cancelled) {
        instance.destroy();
        return;
      }
      created = instance;
      setRenderer(instance);
      onRendererReady(instance);
    });

    const observer = new ResizeObserver(() => { created?.resize(); });
    observer.observe(host);

    return () => {
      cancelled = true;
      observer.disconnect();
      onRendererReady(null);
      setRenderer(null);
      created?.destroy();
    };
    // onRendererReady is a stable callback from the page; the renderer is rebuilt only per case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    if (renderer === null) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const [worldX, worldY] = screenToWorld(
      renderer.viewport, event.clientX - bounds.left, event.clientY - bounds.top,
    );
    const spot = hitBuildSpot(caseId, worldX, worldY);
    if (spot !== null) onSpotTap(spot);
  };

  return (
    <div
      ref={hostRef}
      onPointerDown={handlePointerDown}
      style={{ position: 'absolute', inset: 0, background: 'var(--tissue-field)', touchAction: 'none' }}
    />
  );
}
```

- [ ] **Step 12: Mount it from `FightPage` with a temporary auto-started wave**

This wiring is replaced in Phase 9. It exists now so the phase is visually verifiable.

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import { startWave } from '@game/commands';
import { isCaseId } from '@game/content/cases';
import type { BoardRenderer } from '@render/BoardRenderer';
import { BoardCanvas } from '@app/components/BoardCanvas';
import { useGameLoop } from '@app/state/useGameLoop';

export function FightPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const rendererRef = useRef<BoardRenderer | null>(null);
  const [loop, setLoop] = useState<GameLoop | null>(null);

  const valid = isCaseId(caseId);

  useMemo(() => {
    if (!valid) return;
    const state = createSimState({
      caseId, immunity: { staph: 0, film: 0, virus: 0 }, clearedCount: 2, totalKills: 0,
    });
    startWave(state);
    setLoop(new GameLoop(state));
  }, [caseId, valid]);

  useGameLoop(loop, (state) => { rendererRef.current?.draw(state); });

  if (!valid) return <IonPage><IonContent>Unknown case</IonContent></IonPage>;

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div style={{ position: 'absolute', inset: 0 }}>
          <BoardCanvas
            caseId={caseId}
            onRendererReady={(r) => { rendererRef.current = r; }}
            onSpotTap={() => { /* placement lands in Phase 9 */ }}
          />
        </div>
      </IonContent>
    </IonPage>
  );
}
```

- [ ] **Step 13: Verify visually**

Run: `npm run dev` and open `/play/forearm`.
Expected: the vessel is drawn as two nested strokes; eight staph circles spawn at the left edge over roughly six seconds and walk the polyline to the bottom; nothing throws; the canvas fills the viewport with no letterboxing. Resize the window — the board re-covers and stays centred.

Then open `/play/throat` and `/play/stomach` and confirm each draws its own path.

- [ ] **Step 14: Verify the StrictMode double-mount is handled**

With React StrictMode active (it is, from Phase 0), confirm the DevTools Elements panel shows exactly one `<canvas>` inside the board host, and the console shows no Pixi "destroyed" warnings.
Expected: one canvas. Two canvases means the cancellation flag in Step 11 is not doing its job.

- [ ] **Step 15: Verify the simulation pauses when hidden**

Switch to another browser tab for ten seconds, then return.
Expected: the enemies are where you left them and continue from there. They must not jump forward. This is the motion rule "the sim pauses when unseen" (asset sheet line 1001).

- [ ] **Step 16: Run the full gate**

Run: `npm run verify`
Expected: all green. Note `npm run typecheck:game` still passes — `src/render/` is not in that project, and nothing in `src/game/` gained a Pixi import.

- [ ] **Step 17: Commit**

```bash
git add -A
git commit -m "feat(render): imperative Pixi board with pooled entity layers and cover viewport"
```

**Verification command:** `npm run verify` plus the manual checks in Steps 13–15.
**Passing looks like:** enemies visibly walk each case's vessel at 60 fps, one canvas under StrictMode, and the sim freezes while the tab is hidden.

---

## Phase 5 — Defenders: engulf, block, tag, execute

**Why these four together:** they are the starting dock (asset sheet line 217) and they share one file and one dispatch. Splitting them across two commits would leave `runDefenders` half-written in between.

**Files:**
- Modify: `src/game/systems/damage.ts` — replace the Phase 3 no-op
- Create: `src/game/systems/economy.ts`
- Modify: `src/game/systems/deaths.ts` — phagocyte digest/rest cycle and kill rewards
- Create: `src/game/systems/damage.test.ts`, `src/game/systems/deaths.test.ts`
- Create: `src/game/testing.ts` — shared fixture builders for sim tests
- Port from: prototype lines 674–722 (engulf, tag, execute), 755–781 (deaths and rest)

**Interfaces:**
- Consumes: `targeting.ts` selectors, `DEFENDERS`, `PATHOGENS`.
- Produces:
  - `acquireHolds(state: SimState, held: Set<number>, dead: Set<number>): void` — phagocyte grabs, before movement (decision D9)
  - `runDefenders(state: SimState, dt: number, dead: Set<number>): void`
  - `awardKill(state: SimState, enemy: Enemy): void`, `grantMemoryXp(state: SimState, enemy: Enemy): void`
  - `resolveDeaths(state: SimState, dead: Set<number>): void`
  - test helpers: `simFor(caseId, overrides?)`, `addEnemy(state, kind, opts?)`, `addTower(state, kind, spotIndex, x, y)`

- [ ] **Step 1: Write `src/game/testing.ts`**

Fixture builders shared by every sim test from here on. This lives in `src/game/` and therefore obeys the no-DOM rule.

```ts
import { PATHOGENS } from './content/pathogens';
import { TOWER_MAX_HP } from './content/rules';
import { createSimState } from './state';
import type { CaseId, DefenderKind, Enemy, PathogenKind, SimState, StrainKey, Tower } from './types';

export function simFor(
  caseId: CaseId = 'forearm',
  overrides: { immunity?: Partial<Record<StrainKey, number>>; clearedCount?: number } = {},
): SimState {
  const state = createSimState({
    caseId,
    immunity: { staph: 0, film: 0, virus: 0, ...overrides.immunity },
    clearedCount: overrides.clearedCount ?? 2,
    totalKills: 0,
  });
  state.phase = 'wave';
  state.selected = null;
  return state;
}

export function addEnemy(
  state: SimState, kind: PathogenKind,
  opts: { x?: number; y?: number; hp?: number; tag?: number; distance?: number; generation?: 0 | 1 } = {},
): Enemy {
  const stats = PATHOGENS[kind];
  const enemy: Enemy = {
    id: state.nextEnemyId,
    kind,
    distance: opts.distance ?? 0,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    hp: opts.hp ?? stats.hp,
    maxHp: stats.hp,
    tag: opts.tag ?? 0,
    generation: opts.generation ?? 0,
  };
  state.nextEnemyId += 1;
  state.enemies.push(enemy);
  return enemy;
}

export function addTower(
  state: SimState, kind: DefenderKind, spotIndex: number, x = 0, y = 0,
): Tower {
  const base = { spotIndex, x, y, hp: TOWER_MAX_HP, stun: 0 };
  const tower: Tower =
    kind === 'phago' ? { ...base, kind, holdingEnemyId: null, eaten: 0, rest: 0 }
      : kind === 'clot' ? { ...base, kind }
        : kind === 'mast' ? { ...base, kind, cooldown: 0, flash: 0 }
          : kind === 'mem' ? { ...base, kind, cooldown: 0, xp: 0 }
            : { ...base, kind, cooldown: 0 };
  state.towers.push(tower);
  return tower;
}
```

- [ ] **Step 2: Write the failing engulf test**

`src/game/systems/damage.test.ts` — start with the phagocyte block only; the remaining describes are appended in later steps of this phase. The `tick` helper mirrors `step`'s sequencing for the two defender passes: acquisition first, then action. Every damage expectation derives from the content constants.

```ts
import { describe, expect, it } from 'vitest';
import { acquireHolds, runDefenders } from './damage';
import { addEnemy, addTower, simFor } from '../testing';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import type { PhagocyteTower, SimState } from '../types';

function tick(state: SimState, dt: number, dead = new Set<number>()): void {
  const held = new Set<number>();
  for (const tower of state.towers) {
    if (tower.kind === 'phago' && tower.holdingEnemyId !== null) held.add(tower.holdingEnemyId);
  }
  acquireHolds(state, held, dead);
  runDefenders(state, dt, dead);
}

describe('phagocyte — engulf', () => {
  it('grabs the enemy furthest along the vessel in range, before movement runs', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    addEnemy(state, 'staph', { x: 10, y: 0, distance: 5 });
    const leader = addEnemy(state, 'staph', { x: 20, y: 0, distance: 40 });

    const held = new Set<number>();
    acquireHolds(state, held, new Set());
    expect(tower.holdingEnemyId).toBe(leader.id);
    expect(held.has(leader.id)).toBe(true);
  });

  it('ignores anything outside its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    addEnemy(state, 'staph', { x: DEFENDERS.phago.range + 1, y: 0 });

    acquireHolds(state, new Set(), new Set());
    expect(tower.holdingEnemyId).toBeNull();
  });

  it('digests at its digest rate into whatever it is holding', () => {
    const state = simFor();
    addTower(state, 'phago', 0, 0, 0);
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 1);
    expect(prey.hp).toBeCloseTo(PATHOGENS.staph.hp - DEFENDERS.phago.dps, 6);
  });

  it('digests an armoured target at its armour-reduced rate', () => {
    const state = simFor();
    addTower(state, 'phago', 0, 0, 0);
    const prey = addEnemy(state, 'film', { x: 10, y: 0 });

    tick(state, 1);
    expect(prey.hp).toBeCloseTo(PATHOGENS.film.hp - DEFENDERS.phago.dps * PATHOGENS.film.armour!, 6);
  });

  it('holds one target at a time and never steals another phagocyte’s meal', () => {
    const state = simFor();
    const first = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    const second = addTower(state, 'phago', 1, 10, 0) as PhagocyteTower;
    addEnemy(state, 'staph', { x: 5, y: 0, distance: 30 });
    addEnemy(state, 'staph', { x: 6, y: 0, distance: 10 });

    acquireHolds(state, new Set(), new Set());
    expect(first.holdingEnemyId).not.toBeNull();
    expect(second.holdingEnemyId).not.toBeNull();
    expect(first.holdingEnemyId).not.toBe(second.holdingEnemyId);
  });

  it('neither grabs nor digests while resting, and the rest ticks down in the action pass', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    tower.rest = 2;
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 0.5);
    expect(tower.holdingEnemyId).toBeNull();
    expect(prey.hp).toBe(prey.maxHp);
    expect(tower.rest).toBeCloseTo(1.5, 6);
  });

  it('neither grabs nor digests while stunned', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    tower.stun = 1.6;
    const prey = addEnemy(state, 'staph', { x: 10, y: 0 });

    tick(state, 0.5);
    expect(tower.holdingEnemyId).toBeNull();
    expect(prey.hp).toBe(prey.maxHp);
    expect(tower.stun).toBeCloseTo(1.1, 6);
  });
});
```

- [ ] **Step 3: Run it to verify it fails**

Run: `npx vitest run src/game/systems/damage.test.ts`
Expected: FAIL — `acquireHolds` is still the Phase 3 no-op, so nothing is grabbed and nothing is damaged. The rest and stun tests pass for the wrong reason; they still pass afterwards for the right one.

- [ ] **Step 4: Write `src/game/systems/damage.ts`**

Ports prototype lines 674–722 with the D9 correction: acquisition is its own pass, called by `step` before movement, so a grabbed enemy freezes the same step. The dispatch is a `switch` on the tower kind so TypeScript narrows to the right stats union and a new defender kind cannot be silently forgotten.

```ts
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import type { PhagocyteTower, SimState, Tower } from '../types';
import { armourMultiplier, inRange, isAlive, pickLeader, pickMostWounded } from './targeting';

/** Phagocyte grabs. Runs before movement so a grab freezes its prey this step (decision D9). */
export function acquireHolds(state: SimState, held: Set<number>, dead: Set<number>): void {
  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.stun > 0 || tower.rest > 0 || tower.holdingEnemyId !== null) continue;
    const prey = pickLeader(state, tower, DEFENDERS.phago.range, dead, held);
    if (prey !== null) {
      tower.holdingEnemyId = prey.id;
      held.add(prey.id);
    }
  }
}

function engulf(state: SimState, tower: PhagocyteTower, dt: number): void {
  const stats = DEFENDERS.phago;
  if (tower.rest > 0) {
    tower.rest -= dt;
    return;
  }

  if (tower.holdingEnemyId === null) return;
  const prey = state.enemies.find((e) => e.id === tower.holdingEnemyId);
  if (prey === undefined) {
    tower.holdingEnemyId = null;
    return;
  }
  prey.hp -= stats.dps * armourMultiplier(state, prey) * dt;
}

function tag(state: SimState, tower: Tower & { cooldown: number }, dt: number, dead: Set<number>): void {
  const stats = DEFENDERS.anti;
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  let tagged = false;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, stats.range)) continue;
    if (PATHOGENS[enemy.kind].noTag === true) continue;
    enemy.tag = stats.tag;
    tagged = true;
    state.beams.push({
      fromX: tower.x, fromY: tower.y, toX: enemy.x, toY: enemy.y, life: 0.2, source: 'anti',
    });
  }
  if (tagged) tower.cooldown = stats.rate;
}

function execute(state: SimState, tower: Tower & { cooldown: number }, dt: number, dead: Set<number>): void {
  const stats = DEFENDERS.nk;
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const target = pickMostWounded(state, tower, stats.range, dead);
  if (target === null) return;

  const fraction = target.hp / target.maxHp;
  target.hp = fraction <= stats.execute ? 0 : target.hp - stats.dmg * armourMultiplier(state, target);
  tower.cooldown = stats.rate;
  state.beams.push({
    fromX: tower.x, fromY: tower.y, toX: target.x, toY: target.y, life: 0.22, source: 'nk',
  });
}

export function runDefenders(state: SimState, dt: number, dead: Set<number>): void {
  for (const tower of state.towers) {
    if (tower.stun > 0) {
      tower.stun -= dt;
      continue;
    }

    switch (tower.kind) {
      case 'phago': engulf(state, tower, dt); break;
      case 'clot': break; // Blocks and slows. Handled in movement; deals no damage.
      case 'anti': tag(state, tower, dt, dead); break;
      case 'nk': execute(state, tower, dt, dead); break;
      case 'mast': break; // Phase 6.
      case 'mem': break; // Phase 6.
    }
  }
}
```

`isTagged` is not imported yet — Phase 6's burst multiplier is its only consumer, and `noUnusedLocals` is on.

The `clot` case is an explicit empty `break` with a comment rather than an omission. A clot deals no damage at all (asset sheet line 329); the exhaustive switch makes that a stated fact rather than a gap.

- [ ] **Step 5: Run the engulf tests to verify they pass**

Run: `npx vitest run src/game/systems/damage.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 6: Append the block, tag and execute suites to `damage.test.ts`**

```ts
describe('clot — block', () => {
  it('deals no damage at all', () => {
    const state = simFor();
    addTower(state, 'clot', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 5, new Set());
    expect(enemy.hp).toBe(enemy.maxHp);
  });
});

describe('antibody — tag', () => {
  it('tags everything inside its reach at once and nothing beyond it', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const near = addEnemy(state, 'staph', { x: 10, y: 0 });
    const edge = addEnemy(state, 'staph', { x: DEFENDERS.anti.range, y: 0 });
    const outside = addEnemy(state, 'staph', { x: DEFENDERS.anti.range + 1, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(near.tag).toBe(DEFENDERS.anti.tag);
    expect(edge.tag).toBe(DEFENDERS.anti.tag);
    expect(outside.tag).toBe(0);
  });

  it('cannot tag a resistant strain', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(mrsa.tag).toBe(0);
  });

  it('strips armour from a tagged biofilm', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    const film = addEnemy(state, 'film', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(armourMultiplier(state, film)).toBe(1);
  });

  it('starts its pulse cooldown after tagging', () => {
    const state = simFor();
    const tower = addTower(state, 'anti', 0, 0, 0) as { cooldown: number } & typeof state.towers[0];
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(tower.cooldown).toBeCloseTo(DEFENDERS.anti.rate, 6);
  });

  it('does not start its cooldown when there is nothing to tag', () => {
    const state = simFor();
    const tower = addTower(state, 'anti', 0, 0, 0) as { cooldown: number } & typeof state.towers[0];

    runDefenders(state, 1 / 60, new Set());
    expect(tower.cooldown).toBeLessThanOrEqual(0);
  });

  it('draws a beam to each thing it tags', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });
    addEnemy(state, 'staph', { x: 20, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(state.beams).toHaveLength(2);
    expect(state.beams[0]?.source).toBe('anti');
  });
});

describe('killer cell — execute', () => {
  it('hits the most wounded thing in range, not the leader', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const healthy = addEnemy(state, 'film', { x: 10, y: 0, distance: 90 });
    const wounded = addEnemy(state, 'film', { x: 20, y: 0, distance: 10, hp: PATHOGENS.film.hp * 0.6 });

    runDefenders(state, 1 / 60, new Set());
    expect(healthy.hp).toBe(healthy.maxHp);
    expect(wounded.hp).toBeLessThan(PATHOGENS.film.hp * 0.6);
  });

  it('finishes anything already under the execute fraction, armour or not', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', {
      x: 10, y: 0, hp: PATHOGENS.mrsa.hp * (DEFENDERS.nk.execute - 0.05),
    });

    runDefenders(state, 1 / 60, new Set());
    expect(mrsa.hp).toBe(0);
  });

  it('applies armour to a normal hit', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    const mrsa = addEnemy(state, 'mrsa', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(mrsa.hp).toBeCloseTo(PATHOGENS.mrsa.hp - DEFENDERS.nk.dmg * PATHOGENS.mrsa.armour!, 6);
  });

  it('starts its cooldown after a hit', () => {
    const state = simFor();
    const tower = addTower(state, 'nk', 0, 0, 0) as { cooldown: number } & typeof state.towers[0];
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(tower.cooldown).toBeCloseTo(DEFENDERS.nk.rate, 6);
  });

  it('draws a wide beam', () => {
    const state = simFor();
    addTower(state, 'nk', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(state.beams[0]?.source).toBe('nk');
  });
});
```

Add `import { armourMultiplier } from './targeting';` to the test file.

Run: `npx vitest run src/game/systems/damage.test.ts` — Expected: PASS, 19 tests.

Then confirm the D9 fix end to end in `src/game/step.test.ts` — this is the test spec criterion 4 demands, proving the old one-step lag is gone:

```ts
  it('freezes an enemy on the very step it is engulfed — decision D9', () => {
    const state = simFor();
    addTower(state, 'phago', 0, 86, 58);
    const prey = addEnemy(state, 'staph', { x: 86, y: 40, distance: 60 });
    const before = prey.distance;

    step(state, 1 / 60);
    expect(prey.distance).toBe(before);
  });
```

Run: `npx vitest run src/game/step.test.ts` — Expected: PASS.

- [ ] **Step 7: Write `src/game/systems/economy.ts`**

Ports prototype lines 760–767. Energy rewards, the tag bonus and memory XP. `grantMemoryXp` lives here rather than in `deaths.ts` because it is a reward, and it is called for every kill even before the memory cell exists (Phase 6 makes the tower kind reachable).

```ts
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { TAG_REWARD_MULTIPLIER } from '../content/rules';
import { distance } from '../state';
import type { Enemy, SimState } from '../types';
import { isTagged } from './targeting';

export function awardKill(state: SimState, enemy: Enemy): void {
  const reward = PATHOGENS[enemy.kind].reward;
  state.energy += Math.round(reward * (isTagged(enemy) ? TAG_REWARD_MULTIPLIER : 1));
  state.waveKills += 1;
  state.totalKills += 1;
}

/** Every memory cell within reach of the kill learns from it, permanently, to a cap. */
export function grantMemoryXp(state: SimState, enemy: Enemy): void {
  const stats = DEFENDERS.mem;
  for (const tower of state.towers) {
    if (tower.kind !== 'mem') continue;
    if (distance(tower.x, tower.y, enemy.x, enemy.y) > stats.range) continue;
    tower.xp = Math.min(stats.cap, tower.xp + stats.learn);
  }
}
```

- [ ] **Step 8: Write `src/game/systems/deaths.ts`**

Ports prototype lines 755–781. Virus splitting lands in Phase 6; the hook is here so the ordering is fixed now.

```ts
import { DEFENDERS } from '../content/defenders';
import type { Enemy, SimState } from '../types';
import { awardKill, grantMemoryXp } from './economy';

/** Flu virus splitting. Implemented in Phase 6. */
function splitOnDeath(_state: SimState, _enemy: Enemy): void {
  return;
}

export function resolveDeaths(state: SimState, dead: Set<number>): void {
  for (const enemy of state.enemies) {
    if (enemy.hp > 0 || dead.has(enemy.id)) continue;
    dead.add(enemy.id);
    awardKill(state, enemy);
    grantMemoryXp(state, enemy);
    splitOnDeath(state, enemy);
  }

  if (dead.size === 0) return;

  state.enemies = state.enemies.filter((enemy) => !dead.has(enemy.id));

  for (const tower of state.towers) {
    if (tower.kind !== 'phago') continue;
    if (tower.holdingEnemyId === null || !dead.has(tower.holdingEnemyId)) continue;
    tower.holdingEnemyId = null;
    tower.eaten += 1;
    tower.rest = tower.eaten % DEFENDERS.phago.streak === 0
      ? DEFENDERS.phago.rest
      : DEFENDERS.phago.gap;
  }
}
```

Note the loop order: an enemy killed in this pass is added to `dead` *before* `splitOnDeath` runs, and split children are appended to `state.enemies` while it is being iterated. `for...of` over an array visits appended elements, so a child with `hp > 0` is visited, skipped by the first guard, and survives the filter — which is the prototype's behaviour at lines 756 and 769.

- [ ] **Step 9: Write `src/game/systems/deaths.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { resolveDeaths } from './deaths';
import { addEnemy, addTower, simFor } from '../testing';
import { DEFENDERS } from '../content/defenders';
import { PATHOGENS } from '../content/pathogens';
import { TAG_REWARD_MULTIPLIER } from '../content/rules';
import type { PhagocyteTower } from '../types';

describe('resolveDeaths', () => {
  it('removes anything at or below zero health', () => {
    const state = simFor();
    addEnemy(state, 'staph', { hp: 0 });
    addEnemy(state, 'staph', { hp: 5 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(1);
  });

  it('pays the pathogen reward for a kill', () => {
    const state = simFor();
    state.energy = 0;
    addEnemy(state, 'film', { hp: 0 });

    resolveDeaths(state, new Set());
    expect(state.energy).toBe(PATHOGENS.film.reward);
  });

  it('pays the tag bonus for a tagged kill', () => {
    const state = simFor();
    state.energy = 0;
    addEnemy(state, 'film', { hp: 0, tag: 3 });

    resolveDeaths(state, new Set());
    expect(state.energy).toBe(Math.round(PATHOGENS.film.reward * TAG_REWARD_MULTIPLIER));
  });

  it('counts the kill against the wave and the run', () => {
    const state = simFor();
    addEnemy(state, 'staph', { hp: 0 });

    resolveDeaths(state, new Set());
    expect(state.waveKills).toBe(1);
    expect(state.totalKills).toBe(1);
  });

  it('pays nothing for an enemy that leaked', () => {
    const state = simFor();
    state.energy = 0;
    const leaked = addEnemy(state, 'staph', { hp: 12 });

    resolveDeaths(state, new Set([leaked.id]));
    expect(state.energy).toBe(0);
    expect(state.waveKills).toBe(0);
    expect(state.enemies).toHaveLength(0);
  });

  it('rests a phagocyte briefly between meals', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    const prey = addEnemy(state, 'staph', { hp: 0 });
    tower.holdingEnemyId = prey.id;

    resolveDeaths(state, new Set());
    expect(tower.eaten).toBe(1);
    expect(tower.rest).toBe(DEFENDERS.phago.gap);
    expect(tower.holdingEnemyId).toBeNull();
  });

  it('rests a phagocyte for much longer after every fourth meal', () => {
    const state = simFor();
    const tower = addTower(state, 'phago', 0, 0, 0) as PhagocyteTower;
    tower.eaten = 3;
    const prey = addEnemy(state, 'staph', { hp: 0 });
    tower.holdingEnemyId = prey.id;

    resolveDeaths(state, new Set());
    expect(tower.eaten).toBe(4);
    expect(tower.rest).toBe(DEFENDERS.phago.rest);
  });
});
```

Run: `npx vitest run src/game/systems/deaths.test.ts` — Expected: PASS, 7 tests.

- [ ] **Step 10: Verify the four starting defenders work together in a real step**

Add to `src/game/step.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { step } from './step';
import { addEnemy, addTower, simFor } from './testing';

describe('step', () => {
  it('runs a wave down to nothing with a tag-and-execute board', () => {
    const state = simFor();
    addTower(state, 'anti', 0, 86, 58);
    addTower(state, 'nk', 1, 86, 58);
    for (let i = 0; i < 5; i += 1) addEnemy(state, 'staph', { x: 86, y: 58, distance: 60 + i });

    for (let i = 0; i < 600 && state.enemies.length > 0; i += 1) step(state, 1 / 60);
    expect(state.enemies).toHaveLength(0);
    expect(state.waveKills).toBe(5);
  });

  it('lets an unopposed wave leak all five tissue pips and end the case', () => {
    const state = simFor();
    state.queue = [];
    addEnemy(state, 'staph', { distance: state.path.total - 1 });
    addEnemy(state, 'staph', { distance: state.path.total - 1 });
    addEnemy(state, 'staph', { distance: state.path.total - 1 });
    addEnemy(state, 'staph', { distance: state.path.total - 1 });
    addEnemy(state, 'staph', { distance: state.path.total - 1 });

    step(state, 1);
    expect(state.tissue).toBeLessThanOrEqual(0);
    expect(state.phase).toBe('done');
    expect(state.result).toBe('lost');
  });
});
```

Run: `npx vitest run src/game/step.test.ts` — Expected: PASS, 2 tests.

- [ ] **Step 11: Watch it in the browser**

Change the Phase 4 temporary wiring in `FightPage` to place a couple of towers before `startWave`:

```ts
    state.selected = 'anti';
    placeDefender(state, 0);
    state.selected = 'nk';
    placeDefender(state, 1);
    state.selected = null;
```

Run: `npm run dev`, open `/play/forearm`.
Expected: two cells appear with translucent range discs; green beams flick out to tag enemies, which gain dashed rings; purple-blue beams strike wounded enemies; enemies vanish instantly on death. Revert this temporary block before committing.

- [ ] **Step 12: Run the full gate**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "feat(game): engulf, block, tag and execute with rewards and the digest cycle"
```

**Verification command:** `npm run verify`
**Passing looks like:** 28 new sim tests pass; each of the four starting defenders has its own suite asserting the behaviour the asset sheet documents.

---

## Phase 6 — Defenders: burst and learn; pathogen rules

**Files:**
- Modify: `src/game/systems/damage.ts` — burst and learn
- Modify: `src/game/systems/deaths.ts` — virus splitting
- Modify: `src/game/systems/damage.test.ts`, `deaths.test.ts`
- Modify: `src/render/layers/TowerLayer.ts` — the memory cell's earned bonus label
- Port from: prototype lines 724–751 (burst, learn), 768–770 (split)

**Interfaces:**
- Consumes: everything from Phase 5.
- Produces: no new exports. `splitOnDeath` becomes real.

- [ ] **Step 1: Write the failing burst and learn tests**

Append to `src/game/systems/damage.test.ts`:

```ts
describe('mast cell — burst', () => {
  it('hits everything inside its reach at once and nothing beyond it', () => {
    const state = simFor();
    addTower(state, 'mast', 0, 0, 0);
    const near = addEnemy(state, 'staph', { x: 10, y: 0 });
    const edge = addEnemy(state, 'staph', { x: DEFENDERS.mast.range, y: 0 });
    const outside = addEnemy(state, 'staph', { x: DEFENDERS.mast.range + 1, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(near.hp).toBeCloseTo(near.maxHp - DEFENDERS.mast.dmg, 6);
    expect(edge.hp).toBeCloseTo(edge.maxHp - DEFENDERS.mast.dmg, 6);
    expect(outside.hp).toBe(outside.maxHp);
  });

  it('multiplies its damage on a tagged target', () => {
    const state = simFor();
    addTower(state, 'mast', 0, 0, 0);
    const tagged = addEnemy(state, 'staph', { x: 10, y: 0, tag: 6 });

    runDefenders(state, 1 / 60, new Set());
    expect(tagged.hp).toBeCloseTo(tagged.maxHp - DEFENDERS.mast.dmg * TAGGED_BURST_MULTIPLIER, 6);
  });

  it('stacks the tag bonus on top of stripped armour', () => {
    const state = simFor();
    addTower(state, 'mast', 0, 0, 0);
    const film = addEnemy(state, 'film', { x: 10, y: 0, tag: 6 });

    runDefenders(state, 1 / 60, new Set());
    expect(film.hp).toBeCloseTo(film.maxHp - DEFENDERS.mast.dmg * TAGGED_BURST_MULTIPLIER, 6);
  });

  it('is blunted by armour when the target is untagged', () => {
    const state = simFor();
    addTower(state, 'mast', 0, 0, 0);
    const film = addEnemy(state, 'film', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(film.hp).toBeCloseTo(film.maxHp - DEFENDERS.mast.dmg * PATHOGENS.film.armour!, 6);
  });

  it('starts its pulse cooldown and flashes after hitting', () => {
    const state = simFor();
    const tower = addTower(state, 'mast', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    if (tower.kind !== 'mast') throw new Error('expected a mast cell');
    expect(tower.cooldown).toBeCloseTo(DEFENDERS.mast.rate, 6);
    expect(tower.flash).toBeGreaterThan(0);
  });

  it('does not start its cooldown with nothing in range', () => {
    const state = simFor();
    const tower = addTower(state, 'mast', 0, 0, 0);

    runDefenders(state, 1 / 60, new Set());
    if (tower.kind !== 'mast') throw new Error('expected a mast cell');
    expect(tower.cooldown).toBeLessThanOrEqual(0);
  });
});

describe('memory cell — learn', () => {
  it('starts weak, hitting the leader for only its base damage', () => {
    const state = simFor();
    addTower(state, 'mem', 0, 0, 0);
    const leader = addEnemy(state, 'staph', { x: 10, y: 0, distance: 50 });
    addEnemy(state, 'staph', { x: 20, y: 0, distance: 10 });

    runDefenders(state, 1 / 60, new Set());
    expect(leader.hp).toBeCloseTo(leader.maxHp - DEFENDERS.mem.dmg, 6);
  });

  it('adds its earned bonus to every hit', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    if (tower.kind !== 'mem') throw new Error('expected a memory cell');
    tower.xp = 20;
    const prey = addEnemy(state, 'film', { x: 10, y: 0, tag: 6 });

    runDefenders(state, 1 / 60, new Set());
    expect(prey.hp).toBeCloseTo(prey.maxHp - (DEFENDERS.mem.dmg + 20), 6);
  });

  it('starts its cooldown after a hit', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    if (tower.kind !== 'mem') throw new Error('expected a memory cell');
    expect(tower.cooldown).toBeCloseTo(DEFENDERS.mem.rate, 6);
  });

  it('draws a beam to what it hits', () => {
    const state = simFor();
    addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { x: 10, y: 0 });

    runDefenders(state, 1 / 60, new Set());
    expect(state.beams[0]?.source).toBe('mem');
  });
});
```

Add `TAGGED_BURST_MULTIPLIER` (from `../content/rules`) to the test file's imports.

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/game/systems/damage.test.ts`
Expected: FAIL — 10 new tests, since the `mast` and `mem` cases are still `break`.

- [ ] **Step 3: Implement burst and learn in `src/game/systems/damage.ts`**

```ts
function burst(state: SimState, tower: MastTower, dt: number, dead: Set<number>): void {
  const stats = DEFENDERS.mast;
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  let hitSomething = false;
  for (const enemy of state.enemies) {
    if (!isAlive(enemy, dead)) continue;
    if (!inRange(tower, enemy, stats.range)) continue;
    const multiplier = isTagged(enemy) ? TAGGED_BURST_MULTIPLIER : 1;
    enemy.hp -= stats.dmg * multiplier * armourMultiplier(state, enemy);
    hitSomething = true;
  }

  if (hitSomething) {
    tower.cooldown = stats.rate;
    tower.flash = 0.18;
  }
}

function learn(state: SimState, tower: MemoryTower, dt: number, dead: Set<number>): void {
  const stats = DEFENDERS.mem;
  tower.cooldown -= dt;
  if (tower.cooldown > 0) return;

  const target = pickLeader(state, tower, stats.range, dead);
  if (target === null) return;

  target.hp -= (stats.dmg + tower.xp) * armourMultiplier(state, target);
  tower.cooldown = stats.rate;
  state.beams.push({
    fromX: tower.x, fromY: tower.y, toX: target.x, toY: target.y, life: 0.16, source: 'mem',
  });
}
```

Wire them into the switch:

```ts
      case 'mast': burst(state, tower, dt, dead); break;
      case 'mem': learn(state, tower, dt, dead); break;
```

Add `TAGGED_BURST_MULTIPLIER` to the `../content/rules` import, `isTagged` to the `./targeting` import, and `MastTower`/`MemoryTower` to the type import.

Run: `npx vitest run src/game/systems/damage.test.ts` — Expected: PASS, 29 tests.

- [ ] **Step 4: Write the failing split and regen tests**

Append to `src/game/systems/deaths.test.ts`:

```ts
describe('flu virus — splits on death', () => {
  it('leaves weaker children spaced behind it in the lane', () => {
    const state = simFor('throat');
    const virus = addEnemy(state, 'virus', { hp: 0, distance: 100 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(SPLIT_COUNT);
    state.enemies.forEach((child, n) => {
      expect(child.kind).toBe('virus');
      expect(child.maxHp).toBe(PATHOGENS.virus.hp * SPLIT_HP_FRACTION);
      expect(child.generation).toBe(1);
      expect(child.distance).toBe(virus.distance - SPLIT_BACK_OFFSET - n * SPLIT_BACK_SPACING);
    });
  });

  it('never lets a child split again', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, generation: 1 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(0);
  });

  it('never spawns a child behind the start of the vessel', () => {
    const state = simFor('throat');
    addEnemy(state, 'virus', { hp: 0, distance: 0 });

    resolveDeaths(state, new Set());
    expect(state.enemies.every((e) => e.distance >= 0)).toBe(true);
  });

  it('stops splitting entirely once Flu B immunity is complete', () => {
    const state = simFor('throat', { immunity: { virus: IMMUNITY_MAX } });
    addEnemy(state, 'virus', { hp: 0, distance: 100 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(0);
  });

  it('splits in every case, not only the virus case', () => {
    const state = simFor('forearm');
    addEnemy(state, 'virus', { hp: 0, distance: 100 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(SPLIT_COUNT);
  });

  it('does not split anything that is not a splitter', () => {
    const state = simFor('throat');
    addEnemy(state, 'spore', { hp: 0, distance: 100 });

    resolveDeaths(state, new Set());
    expect(state.enemies).toHaveLength(0);
  });
});

describe('memory cells learn from nearby kills', () => {
  it('gains its learn rate per kill inside its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { hp: 0, x: DEFENDERS.mem.range - 1, y: 0 });

    resolveDeaths(state, new Set());
    if (tower.kind !== 'mem') throw new Error('expected a memory cell');
    expect(tower.xp).toBe(DEFENDERS.mem.learn);
  });

  it('learns nothing from a kill outside its reach', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    addEnemy(state, 'staph', { hp: 0, x: DEFENDERS.mem.range + 1, y: 0 });

    resolveDeaths(state, new Set());
    if (tower.kind !== 'mem') throw new Error('expected a memory cell');
    expect(tower.xp).toBe(0);
  });

  it('caps at its ceiling and keeps what it learned', () => {
    const state = simFor();
    const tower = addTower(state, 'mem', 0, 0, 0);
    if (tower.kind !== 'mem') throw new Error('expected a memory cell');
    tower.xp = DEFENDERS.mem.cap - DEFENDERS.mem.learn / 2;
    addEnemy(state, 'staph', { hp: 0, x: 10, y: 0 });

    resolveDeaths(state, new Set());
    expect(tower.xp).toBe(DEFENDERS.mem.cap);
  });
});
```

Add `IMMUNITY_MAX`, `SPLIT_BACK_OFFSET`, `SPLIT_BACK_SPACING`, `SPLIT_COUNT`, `SPLIT_HP_FRACTION` (from `../content/rules`) and `DEFENDERS` (from `../content/defenders`) to the test file's imports. The child spacing formula mirrors the prototype's `Math.max(0, e.d - 14 - n * 12)` at line 769, with the offsets now named tunables.

- [ ] **Step 5: Run to verify failure, then implement `splitOnDeath`**

Run: `npx vitest run src/game/systems/deaths.test.ts` — Expected: FAIL on the split suite.

```ts
function splitOnDeath(state: SimState, enemy: Enemy): void {
  const stats = PATHOGENS[enemy.kind];
  if (stats.splits !== true) return;
  if (enemy.generation !== 0) return;
  if (state.immunity.virus >= IMMUNITY_MAX) return;

  const childHp = stats.hp * SPLIT_HP_FRACTION;
  for (let n = 0; n < SPLIT_COUNT; n += 1) {
    const childDistance = Math.max(0, enemy.distance - SPLIT_BACK_OFFSET - n * SPLIT_BACK_SPACING);
    const [x, y] = positionAt(state.path, childDistance);
    state.enemies.push({
      id: state.nextEnemyId,
      kind: enemy.kind,
      distance: childDistance,
      x,
      y,
      hp: childHp,
      maxHp: childHp,
      tag: 0,
      generation: 1,
    });
    state.nextEnemyId += 1;
  }
}
```

Restore the `PATHOGENS` import and add `IMMUNITY_MAX`, `SPLIT_BACK_OFFSET`, `SPLIT_BACK_SPACING`, `SPLIT_COUNT`, `SPLIT_HP_FRACTION` from `../content/rules`, `positionAt` from `../path`, and `Enemy` to the type import.

The prototype does not compute a position for a split child (line 769); it leaves `pos` undefined until the next movement pass sets it. Computing it here means the child is drawable on the frame it appears, which is required now that the renderer reads position directly. It changes nothing in the simulation because movement overwrites it before anything reads it.

Run: `npx vitest run src/game/systems/deaths.test.ts` — Expected: PASS, 16 tests.

- [ ] **Step 6: Add the memory cell's earned-bonus label to `TowerLayer`**

The bonus is printed under the cell (prototype lines 863–866). One `Text` per memory cell, updated only when the rounded value changes.

In `TowerLayer`, extend `TowerView` with `label: Text | null` and, after painting the body:

```ts
      if (tower.kind === 'mem' && tower.xp > 0) {
        view.label ??= this.#createLabel(tower.x, tower.y);
        view.label.text = `+${String(Math.round(tower.xp))}`;
      }
```

with:

```ts
  #createLabel(x: number, y: number): Text {
    const label = new Text({
      text: '',
      style: { fontFamily: 'DM Mono', fontSize: 11, fill: defenderHex('mem') },
    });
    label.anchor.set(0.5, 0);
    label.position.set(x, y + 26);
    this.container.addChild(label);
    return label;
  }
```

Destroy the label alongside the body in the removal loop, and add `Text` to the `pixi.js` import.

- [ ] **Step 7: Verify the full roster in the browser**

Temporarily place all six defenders in `FightPage` and open `/play/throat`.
Expected: mast cells flash a wider tinted disc when they pulse; memory cells show `+2.5`, `+5` and so on under the cell as kills land nearby; killing a virus leaves two smaller circles slightly behind it. Revert the temporary block.

- [ ] **Step 8: Run the full gate**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat(game): burst and learn defenders, virus splitting and memory experience"
```

**Verification command:** `npm run verify`
**Passing looks like:** all six defenders and the split, regen, armour and untaggable pathogen rules each have a passing suite. The only §5 mechanics still untested are the three case rules, which are Phase 7.

---

## Phase 7 — Case rules: wound bleed, tetanus shield, poison

**Why now:** the three case rules are the last simulation mechanics from spec §5. `hazards.ts` was written in Phase 3 because `movement.ts` calls it; this phase is the tests that prove it behaves, plus the one behaviour not yet covered — a defender that dies of poison.

**Files:**
- Create: `src/game/systems/hazards.test.ts`
- Modify: `src/game/systems/spawn.test.ts` — already covers the shield from Phase 3; no change needed, re-read to confirm
- Port from: prototype lines 616–620 (bleed), 653–658 (stun), 659–664 (poison), 609–610 (shield)

**Interfaces:**
- Consumes: `applyWoundBleed`, `applyToxinStun`, `applyPoison`, `simFor`, `addEnemy`, `addTower`.
- Produces: no new exports.

- [ ] **Step 1: Write the failing wound-bleed tests**

`src/game/systems/hazards.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { applyPoison, applyToxinStun, applyWoundBleed } from './hazards';
import { step } from '../step';
import { addEnemy, addTower, simFor } from '../testing';
import { PATHOGENS } from '../content/pathogens';
import {
  BLEED_AMOUNT, POISON_DPS_ANTIBODY, POISON_DPS_OTHER, POISON_RADIUS, TOWER_MAX_HP,
  TOXIN_STUN_RADIUS,
} from '../content/rules';

describe('wound — bleeding', () => {
  it('drains the bleed amount once a second while there is no clot', () => {
    const state = simFor('forearm');
    state.energy = 100;

    applyWoundBleed(state, 0.5);
    expect(state.energy).toBe(100);

    applyWoundBleed(state, 0.5);
    expect(state.energy).toBe(100 - BLEED_AMOUNT);
  });

  it('stops the moment a clot is on the board', () => {
    const state = simFor('forearm');
    state.energy = 100;
    addTower(state, 'clot', 0, 0, 0);

    applyWoundBleed(state, 5);
    expect(state.energy).toBe(100);
  });

  it('resumes if the clot wears away', () => {
    const state = simFor('forearm');
    state.energy = 100;
    const clot = addTower(state, 'clot', 0, 0, 0);

    applyWoundBleed(state, 1);
    expect(state.energy).toBe(100);

    clot.hp = 0;
    state.towers = state.towers.filter((t) => t.hp > 0);
    applyWoundBleed(state, 1);
    expect(state.energy).toBe(100 - BLEED_AMOUNT);
  });

  it('does not bleed a case that is not a wound', () => {
    for (const caseId of ['throat', 'stomach'] as const) {
      const state = simFor(caseId);
      state.energy = 100;
      applyWoundBleed(state, 10);
      expect(state.energy).toBe(100);
    }
  });

  it('clamps at zero rather than going negative — decision D3', () => {
    const state = simFor('forearm');
    state.energy = 1;

    applyWoundBleed(state, 1);
    expect(state.energy).toBe(0);

    applyWoundBleed(state, 1);
    expect(state.energy).toBe(0);
  });
});
```

The clamp test is spec criterion 4's proof that the prototype's negative-energy quirk is gone: seeded with less energy than one bleed tick, the currency lands exactly on zero and stays there.

- [ ] **Step 2: Run to confirm they pass against the Phase 3 implementation**

Run: `npx vitest run src/game/systems/hazards.test.ts`
Expected: PASS, 5 tests. These are characterisation tests over code that already exists, so the TDD failure step is replaced by a deliberate behaviour mutation: comment out the clot check inside `applyWoundBleed`, run, confirm "stops the moment a clot is on the board" fails, restore, confirm green. (A value mutation is deliberately not the check here — tuning a number must not fail tests.)

- [ ] **Step 3: Write the toxin-stun tests**

Append to `hazards.test.ts`:

```ts
describe('toxin — stuns the cells it passes', () => {
  it('stuns a defender inside the stun radius', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: TOXIN_STUN_RADIUS - 1, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(PATHOGENS.toxin.stun);
  });

  it('leaves a defender at the stun radius or further alone', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: TOXIN_STUN_RADIUS, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(0);
  });

  it('cannot stun a clot', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'clot', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 10, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(0);
  });

  it('cannot stun a memory cell', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'mem', 0, 0, 0);
    const toxin = addEnemy(state, 'toxin', { x: 10, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(0);
  });

  it('stuns everything else — tag, execute and burst included', () => {
    const state = simFor('stomach');
    const anti = addTower(state, 'anti', 0, 0, 0);
    const nk = addTower(state, 'nk', 1, 5, 0);
    const mast = addTower(state, 'mast', 2, 10, 0);
    const toxin = addEnemy(state, 'toxin', { x: 20, y: 0 });

    applyToxinStun(state, toxin);
    const stun = PATHOGENS.toxin.stun;
    expect([anti.stun, nk.stun, mast.stun]).toEqual([stun, stun, stun]);
  });

  it('refreshes rather than stacks', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.stun = 1.0;
    const toxin = addEnemy(state, 'toxin', { x: 10, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(PATHOGENS.toxin.stun);
  });

  it('never shortens an existing stun', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    tower.stun = 3;
    const toxin = addEnemy(state, 'toxin', { x: 10, y: 0 });

    applyToxinStun(state, toxin);
    expect(tower.stun).toBe(3);
  });

  it('does nothing for a pathogen that does not stun', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const staph = addEnemy(state, 'staph', { x: 10, y: 0 });

    applyToxinStun(state, staph);
    expect(tower.stun).toBe(0);
  });
});
```

- [ ] **Step 4: Write the poison tests**

Append to `hazards.test.ts`:

```ts
describe('poison — pathogens damage your defenders', () => {
  it('damages a phagocyte inside the poison radius at the full rate', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: POISON_RADIUS - 1, y: 0 });

    applyPoison(state, enemy, 1);
    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_OTHER, 6);
  });

  it('damages an antibody at its reduced rate', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'anti', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    applyPoison(state, enemy, 1);
    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_ANTIBODY, 6);
  });

  it('cannot damage a clot', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'clot', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    applyPoison(state, enemy, 1);
    expect(tower.hp).toBe(TOWER_MAX_HP);
  });

  it('does damage a memory cell — stun immunity is not poison immunity', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'mem', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    applyPoison(state, enemy, 1);
    expect(tower.hp).toBeCloseTo(TOWER_MAX_HP - POISON_DPS_OTHER, 6);
  });

  it('leaves a defender at the poison radius or further alone', () => {
    const state = simFor('stomach');
    const tower = addTower(state, 'phago', 0, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: POISON_RADIUS, y: 0 });

    applyPoison(state, enemy, 1);
    expect(tower.hp).toBe(TOWER_MAX_HP);
  });

  it('does nothing outside a poison case', () => {
    for (const caseId of ['forearm', 'throat'] as const) {
      const state = simFor(caseId);
      const tower = addTower(state, 'phago', 0, 0, 0);
      const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

      applyPoison(state, enemy, 10);
      expect(tower.hp).toBe(TOWER_MAX_HP);
    }
  });

  it('removes a defender from the board once poison finishes it', () => {
    const state = simFor('stomach');
    state.queue = [];
    const tower = addTower(state, 'phago', 0, 46, 0);
    tower.hp = 1;
    addEnemy(state, 'staph', { x: 46, y: 0, distance: 20 });

    step(state, 1 / 60);
    expect(state.towers).toHaveLength(0);
  });

  it('wears an antibody down slower than a phagocyte, in the documented ratio', () => {
    const state = simFor('stomach');
    const phago = addTower(state, 'phago', 0, 0, 0);
    const anti = addTower(state, 'anti', 1, 0, 0);
    const enemy = addEnemy(state, 'staph', { x: 10, y: 0 });

    applyPoison(state, enemy, 5);
    const ratio = POISON_DPS_OTHER / POISON_DPS_ANTIBODY;
    expect(TOWER_MAX_HP - phago.hp).toBeCloseTo(ratio * (TOWER_MAX_HP - anti.hp), 6);
  });
});
```

Run: `npx vitest run src/game/systems/hazards.test.ts` — Expected: PASS, 21 tests.

- [ ] **Step 5: Confirm the tetanus shield suite from Phase 3 still stands**

Run: `npx vitest run src/game/systems/spawn.test.ts -t tetanus`
Expected: the shield tests pass. They cover: one bounce per wave, bounce again next wave, no bounce below full immunity, no bounce outside a wound case. That is spec §5's "tetanus shield bouncing first staph per wave" in full.

- [ ] **Step 6: Run the full gate**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(game): wound bleed, toxin stun and poison case rules"
```

**Verification command:** `npm run verify`
**Passing looks like:** every mechanic listed in spec §5 now has its own suite — six defenders, six pathogens, three case rules.

---

## Phase 8 — Run flow: waves, fever, tissue, results, clear; golden snapshot blessed

**Why now:** this closes the simulation. After this phase the golden snapshot is blessed; presentation phases must not change it, and tuning re-blesses it deliberately (decision D24).

**Files:**
- Modify: `src/game/step.ts` — real `endWave`
- Create: `src/game/progression.ts` + `progression.test.ts`
- Modify: `src/game/commands.ts` — `advanceToNextWave`, `restartCase`
- Create: `src/game/run.test.ts` — end-to-end wave and case flow
- Create: `src/game/golden.test.ts`
- Port from: prototype lines 563–581 (endWave, nextWave, finishCase, retry, resetRun), 793–825 (seasonRows, vaccineRows), 1003–1015 (strainRows), 1017–1021 (result copy)

**Interfaces:**
- Produces:
  - `interface Profile { cleared: readonly CaseId[]; immunity: Readonly<Record<StrainKey, number>>; day: number; bank: number; kills: number }`
  - `createFreshProfile(): Profile` — the only fresh-profile factory; first run and "Start a new body" both use it (decision D7)
  - `clearCase(profile: Profile, caseId: CaseId, totalKills: number): Profile`
  - `nextCaseId(profile: Profile): CaseId | null`
  - `strainRows(profile)`, `vaccineRows(profile)`, `seasonRows(profile)`
  - `advanceToNextWave(state: SimState): void`, `restartCase(state: SimState): SimState`

- [ ] **Step 1: Write the failing progression tests**

`src/game/progression.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  clearCase, createFreshProfile, nextCaseId, seasonRows, strainRows, vaccineRows,
} from './progression';
import { CASES } from './content/cases';
import { LATER } from './content/later';
import { CASE_CLEAR_BANK, FRESH_PROFILE } from './content/rules';

describe('createFreshProfile', () => {
  it('starts a body with nothing cleared, no immunity, and the fresh day and bank', () => {
    expect(createFreshProfile()).toEqual({
      cleared: [],
      immunity: { staph: 0, film: 0, virus: 0 },
      day: FRESH_PROFILE.day,
      bank: FRESH_PROFILE.bank,
      kills: 0,
    });
  });

  it('is the same profile whether it is a first run or a reset — decision D7', () => {
    expect(createFreshProfile()).toEqual(createFreshProfile());
  });
});

describe('nextCaseId', () => {
  it('offers the first uncleared case', () => {
    expect(nextCaseId(createFreshProfile())).toBe('forearm');
  });

  it('moves on as cases are cleared', () => {
    let profile = createFreshProfile();
    profile = clearCase(profile, 'forearm', 0);
    expect(nextCaseId(profile)).toBe('throat');
    profile = clearCase(profile, 'throat', 0);
    expect(nextCaseId(profile)).toBe('stomach');
  });

  it('returns null when nothing needs you today', () => {
    let profile = createFreshProfile();
    for (const id of ['forearm', 'throat', 'stomach'] as const) profile = clearCase(profile, id, 0);
    expect(nextCaseId(profile)).toBeNull();
  });
});

describe('clearCase', () => {
  it('advances the day and banks the reward', () => {
    const fresh = createFreshProfile();
    const profile = clearCase(fresh, 'forearm', 0);
    expect(profile.day).toBe(fresh.day + 1);
    expect(profile.bank).toBe(fresh.bank + CASE_CLEAR_BANK);
  });

  it('raises the strain immunity toward three', () => {
    let profile = createFreshProfile();
    profile = clearCase(profile, 'forearm', 0);
    expect(profile.immunity.staph).toBe(1);
  });

  it('never raises immunity past three', () => {
    let profile = { ...createFreshProfile(), immunity: { staph: 3, film: 0, virus: 0 } };
    profile = clearCase(profile, 'forearm', 0);
    expect(profile.immunity.staph).toBe(3);
  });

  it('credits exactly the strain each case declares — decision D6', () => {
    for (const definition of CASES) {
      const profile = clearCase(createFreshProfile(), definition.id, 0);
      for (const strain of ['staph', 'film', 'virus'] as const) {
        expect(profile.immunity[strain]).toBe(strain === definition.credits ? 1 : 0);
      }
    }
  });

  it('makes the Biofilm serum earnable — the broken promise is fixed', () => {
    let profile = createFreshProfile();
    profile = clearCase(profile, 'stomach', 0);
    expect(profile.immunity.film).toBe(1);
  });

  it('records the case once, even if cleared again', () => {
    let profile = clearCase(createFreshProfile(), 'forearm', 0);
    profile = clearCase(profile, 'forearm', 0);
    expect(profile.cleared).toEqual(['forearm']);
  });

  it('carries the run kill count into the profile', () => {
    const profile = clearCase(createFreshProfile(), 'forearm', 47);
    expect(profile.kills).toBe(47);
  });
});

describe('strainRows', () => {
  it('shows progress toward each vaccine and marks a completed one', () => {
    const profile = { ...createFreshProfile(), immunity: { staph: 3, film: 0, virus: 1 } };
    const rows = strainRows(profile);
    expect(rows.map((r) => r.progress)).toEqual(['DONE', '1/3', '0/3']);
  });
});

describe('vaccineRows', () => {
  it('labels a strain vaccine by clears, and a gated one by cases cleared', () => {
    let profile = createFreshProfile();
    profile = clearCase(profile, 'forearm', 0);
    profile = clearCase(profile, 'throat', 0);

    const rows = vaccineRows(profile);
    expect(rows[0]?.label).toBe('1/3');
    expect(rows[3]?.label).toBe('AVAILABLE');
    expect(rows[4]?.label).toBe('LOCKED');
    expect(rows[5]?.label).toBe('NONE EXISTS');
  });

  it('marks a strain vaccine held once three clears are in', () => {
    const profile = { ...createFreshProfile(), immunity: { staph: 3, film: 0, virus: 0 } };
    expect(vaccineRows(profile)[0]?.label).toBe('HELD');
  });
});

describe('seasonRows', () => {
  it('lists every case then every later entry, with days counted from today', () => {
    const fresh = createFreshProfile();
    const rows = seasonRows(fresh);
    expect(rows).toHaveLength(CASES.length + LATER.length);
    expect(rows.map((r) => r.name)).toEqual([
      ...CASES.map((c) => c.title),
      ...LATER.map((l) => l.name),
    ]);
    expect(rows[0]?.day).toBe(fresh.day);
    expect(rows[CASES.length]?.day).toBe(fresh.day + LATER[0]!.offset);
  });

  it('marks the current case as now and a cleared one as done', () => {
    const profile = clearCase(createFreshProfile(), 'forearm', 0);
    const rows = seasonRows(profile);
    expect(rows[0]?.state).toBe('done');
    expect(rows[1]?.state).toBe('now');
  });
});
```

- [ ] **Step 2: Run to verify failure, then write `src/game/progression.ts`**

Run: `npx vitest run src/game/progression.test.ts` — Expected: FAIL, unresolved import.

```ts
import { CASES, CASE_BY_ID } from './content/cases';
import { LATER } from './content/later';
import { CASE_CLEAR_BANK, FRESH_PROFILE, IMMUNITY_MAX } from './content/rules';
import { STRAIN_ROWS, VACCINES } from './content/vaccines';
import type { CaseId, StrainKey, Tier } from './types';

export interface Profile {
  readonly cleared: readonly CaseId[];
  readonly immunity: Readonly<Record<StrainKey, number>>;
  readonly day: number;
  readonly bank: number;
  readonly kills: number;
}

/** The one fresh profile. First run and "Start a new body" are the same state (decision D7). */
export function createFreshProfile(): Profile {
  return {
    cleared: [],
    immunity: { staph: 0, film: 0, virus: 0 },
    day: FRESH_PROFILE.day,
    bank: FRESH_PROFILE.bank,
    kills: 0,
  };
}

export function clearCase(profile: Profile, caseId: CaseId, totalKills: number): Profile {
  // Each case declares which strain a clear counts toward (decision D6).
  const strain = CASE_BY_ID[caseId].credits;
  return {
    cleared: profile.cleared.includes(caseId) ? profile.cleared : [...profile.cleared, caseId],
    immunity: { ...profile.immunity, [strain]: Math.min(IMMUNITY_MAX, profile.immunity[strain] + 1) },
    day: profile.day + 1,
    bank: profile.bank + CASE_CLEAR_BANK,
    kills: totalKills,
  };
}

export function nextCaseId(profile: Profile): CaseId | null {
  return CASES.find((c) => !profile.cleared.includes(c.id))?.id ?? null;
}

export interface StrainRow {
  readonly key: StrainKey;
  readonly name: string;
  readonly effect: string;
  readonly progress: string;
  readonly held: boolean;
}

export function strainRows(profile: Profile): readonly StrainRow[] {
  return STRAIN_ROWS.map((row) => {
    const count = profile.immunity[row.key];
    const held = count >= IMMUNITY_MAX;
    return { ...row, held, progress: held ? 'DONE' : `${String(count)}/${String(IMMUNITY_MAX)}` };
  });
}

export type VaccineStatus = 'held' | 'progress' | 'available' | 'locked' | 'none';

export interface VaccineRow {
  readonly name: string;
  readonly effect: string;
  readonly cost: string;
  readonly label: string;
  readonly status: VaccineStatus;
}

export function vaccineRows(profile: Profile): readonly VaccineRow[] {
  return VACCINES.map((vaccine) => {
    let status: VaccineStatus = 'none';
    let label = 'NONE EXISTS';

    if (vaccine.strain !== undefined) {
      const count = profile.immunity[vaccine.strain];
      status = count >= IMMUNITY_MAX ? 'held' : 'progress';
      label = status === 'held' ? 'HELD' : `${String(count)}/${String(IMMUNITY_MAX)}`;
    } else if (vaccine.gate !== undefined) {
      status = profile.cleared.length >= vaccine.gate ? 'available' : 'locked';
      label = status === 'available' ? 'AVAILABLE' : 'LOCKED';
    }

    const showCost = status === 'available' || status === 'locked';
    return { name: vaccine.name, effect: vaccine.effect, cost: showCost ? vaccine.cost ?? '' : '', label, status };
  });
}

export type SeasonState = 'done' | 'now' | 'next' | 'warn' | 'unknown';

export interface SeasonRow {
  readonly day: number;
  readonly name: string;
  readonly region: string;
  readonly note: string;
  readonly tier: Tier;
  readonly state: SeasonState;
}

export function seasonRows(profile: Profile): readonly SeasonRow[] {
  const nextIndex = Math.max(0, CASES.findIndex((c) => !profile.cleared.includes(c.id)));

  const cases: SeasonRow[] = CASES.map((definition, index) => {
    const done = profile.cleared.includes(definition.id);
    const region = definition.region.split(' · ')[0]!.toLowerCase();
    return {
      day: profile.day + (index - nextIndex),
      name: definition.title,
      region: region.charAt(0).toUpperCase() + region.slice(1),
      note: done ? 'Cleared — this region is holding' : '',
      tier: 1,
      state: done ? 'done' : index === nextIndex ? 'now' : 'next',
    };
  });

  const later: SeasonRow[] = LATER.map((entry) => ({
    day: profile.day + entry.offset,
    name: entry.name,
    region: entry.region,
    note: entry.note,
    tier: entry.tier,
    state: entry.tier === 3 ? 'unknown' : 'warn',
  }));

  return [...cases, ...later];
}
```

Run: `npx vitest run src/game/progression.test.ts` — Expected: PASS, 16 tests.

- [ ] **Step 3: Write the failing run-flow tests**

`src/game/run.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { advanceToNextWave, startWave } from './commands';
import { step } from './step';
import { addTower, simFor } from './testing';
import { WAVE_CLEAR_ENERGY } from './content/rules';

/** Run until the wave resolves, or fail loudly rather than hang. */
function runWave(state: ReturnType<typeof simFor>, maxSeconds = 240): void {
  const limit = Math.round(maxSeconds * 60);
  for (let i = 0; i < limit; i += 1) {
    if (state.phase !== 'wave') return;
    step(state, 1 / 60);
  }
  throw new Error('Wave did not resolve within the time limit');
}

describe('wave flow', () => {
  it('ends the wave and pays 50 energy when the queue and the board are empty', () => {
    const state = simFor();
    for (let i = 0; i < 5; i += 1) addTower(state, 'nk', i, ...pointFor(state, i));
    startWave(state);
    const before = state.energy;

    runWave(state);
    expect(state.phase).toBe('built');
    expect(state.result).toBe('wave');
    expect(state.energy).toBe(before + WAVE_CLEAR_ENERGY);
  });

  it('carries unspent energy into the next wave and clears the result', () => {
    const state = simFor();
    for (let i = 0; i < 5; i += 1) addTower(state, 'nk', i, ...pointFor(state, i));
    startWave(state);
    runWave(state);
    const banked = state.energy;

    advanceToNextWave(state);
    expect(state.waveIndex).toBe(1);
    expect(state.phase).toBe('build');
    expect(state.result).toBeNull();
    expect(state.energy).toBe(banked);
    expect(state.selected).toBe('phago');
  });

  it('marks the case cleared after the final wave', () => {
    const state = simFor();
    state.waveIndex = 4;
    for (let i = 0; i < 5; i += 1) addTower(state, 'nk', i, ...pointFor(state, i));
    startWave(state);
    runWave(state);

    expect(state.phase).toBe('done');
    expect(state.result).toBe('case');
  });

  it('ends the case the moment tissue runs out, even on the last wave', () => {
    const state = simFor();
    state.waveIndex = 4;
    startWave(state);
    runWave(state);

    expect(state.result).toBe('lost');
    expect(state.phase).toBe('done');
  });

  it('resets fever and the wave counters at the start of every wave', () => {
    const state = simFor();
    startWave(state);
    state.fever = 3;
    state.feverUsed = true;
    state.waveKills = 9;
    state.waveLeaks = 2;

    state.phase = 'built';
    advanceToNextWave(state);
    startWave(state);

    expect(state.fever).toBe(0);
    expect(state.feverUsed).toBe(false);
    expect(state.waveKills).toBe(0);
    expect(state.waveLeaks).toBe(0);
  });

  it('lets fever be used once and expire after its duration', () => {
    const state = simFor();
    startWave(state);
    // One queued spawn keeps the wave open while the fever timer runs down.
    state.queue = ['staph'];
    state.spawnTimer = FEVER_SECONDS * 2;
    triggerFever(state);

    const halfSteps = Math.floor((FEVER_SECONDS / 2) * 60);
    for (let i = 0; i < halfSteps; i += 1) step(state, 1 / 60);
    expect(state.fever).toBeGreaterThan(0);
    for (let i = 0; i < halfSteps + 60; i += 1) step(state, 1 / 60);
    expect(state.fever).toBe(0);
    expect(state.feverUsed).toBe(true);
  });
});

describe('restartCase', () => {
  it('yields a fresh board with the shield armed again — decision D2', () => {
    const spent = simFor('forearm', { immunity: { staph: IMMUNITY_MAX } });
    spent.shieldedWave = 0;
    addTower(spent, 'clot', 0, 0, 0);

    const restarted = restartCase(spent);
    expect(restarted.shieldedWave).toBeNull();
    expect(restarted.towers).toHaveLength(0);
    expect(restarted.phase).toBe('build');
    expect(restarted.immunity).toEqual(spent.immunity);
  });
});
```

The file needs these imports and one helper at the top:

```ts
import { advanceToNextWave, restartCase, startWave, triggerFever } from './commands';
import { CASE_BY_ID } from './content/cases';
import { FEVER_SECONDS, IMMUNITY_MAX, WAVE_CLEAR_ENERGY } from './content/rules';
import type { SimState } from './types';

function pointFor(state: SimState, index: number): [number, number] {
  const spot = CASE_BY_ID[state.caseId].spots[index]!;
  return [spot[0], spot[1]];
}
```

- [ ] **Step 4: Run to verify failure, then implement `endWave` and `advanceToNextWave`**

Run: `npx vitest run src/game/run.test.ts` — Expected: FAIL — `advanceToNextWave` is not exported and `endWave` still just sets `'built'`.

In `src/game/step.ts`, replace the temporary `endWave`:

```ts
function endWave(state: SimState): void {
  state.phase = 'done';
  if (state.waveIndex >= state.waveCount - 1) {
    state.result = 'case';
    return;
  }
  state.phase = 'built';
  state.result = 'wave';
  state.energy += WAVE_CLEAR_ENERGY;
}
```

Add `import { WAVE_CLEAR_ENERGY } from './content/rules';`.

In `src/game/commands.ts`:

```ts
export function advanceToNextWave(state: SimState): void {
  if (state.phase !== 'built') return;
  state.waveIndex += 1;
  state.phase = 'build';
  state.result = null;
  state.selected = 'phago';
}

/** "Try this case again" — a fresh board, keeping nothing but what the profile already holds. */
export function restartCase(state: SimState): SimState {
  return createSimState({
    caseId: state.caseId,
    immunity: state.immunity,
    clearedCount: state.clearedCount,
    totalKills: state.totalKills,
  });
}
```

Add `createSimState` to the imports.

Run: `npx vitest run src/game/run.test.ts` — Expected: PASS, 6 tests.

- [ ] **Step 5: Play a full case in the browser**

Temporarily wire `FightPage` to place four defenders, start wave 1, and log `state.phase`/`state.result` on change.
Expected: the wave resolves, `phase` becomes `built` and `result` becomes `wave`. Revert.

- [ ] **Step 6: Write the golden run test as a snapshot**

Spec §9 and decision D24: the hash is a *reproducibility* net, not a balance freeze. It lives in a Vitest snapshot so re-blessing after a deliberate tuning change is one command and the diff is reviewed like any other change.

`src/game/golden.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { hashState } from './hash';
import { placeDefender, startWave } from './commands';
import { createSimState } from './state';
import { step } from './step';
import type { DefenderKind, SimState } from './types';

/**
 * A fixed board, a fixed seed and a fixed number of steps. If the snapshot changes,
 * simulation behaviour changed. Deliberate (a tuning or mechanics change): re-bless with
 *   npx vitest run src/game/golden.test.ts -u
 * and review the snapshot diff. Not deliberate (a presentation phase touched it): a bug.
 */
function goldenRun(): SimState {
  const state = createSimState({
    caseId: 'forearm',
    immunity: { staph: 1, film: 0, virus: 0 },
    clearedCount: 2,
    totalKills: 0,
  });

  const board: readonly (readonly [DefenderKind, number])[] = [
    ['clot', 0], ['anti', 1], ['nk', 2], ['phago', 3],
  ];
  for (const [kind, spot] of board) {
    state.selected = kind;
    if (!placeDefender(state, spot)) throw new Error(`Could not place ${kind} on spot ${String(spot)}`);
  }

  startWave(state);
  for (let i = 0; i < 3600; i += 1) step(state, 1 / 60);
  return state;
}

describe('golden run', () => {
  it('reproduces byte-identically across executions', () => {
    expect(hashState(goldenRun())).toBe(hashState(goldenRun()));
  });

  it('matches the blessed snapshot', () => {
    expect(hashState(goldenRun())).toMatchSnapshot();
  });
});
```

- [ ] **Step 7: Bless the snapshot**

Run: `npx vitest run src/game/golden.test.ts`
Expected: PASS, 2 tests — the first run writes `__snapshots__/golden.test.ts.snap`. Commit that file; it is the blessed baseline.

If the determinism test fails, the cause must be found before blessing anything — look for `Math.random`, `Date.now`, or a `Set`/`Map` iteration that reaches gameplay.

- [ ] **Step 8: Prove the net catches change, and rehearse the re-bless**

1. Change `DEFENDERS.nk.dmg` by one. Run `npx vitest run src/game/golden.test.ts`. Expected: the snapshot test fails — behaviour changed. Note that **no other test fails**: this is the criterion-5 property, a tuning pass turns exactly one re-blessable test red.
2. Re-bless: `npx vitest run src/game/golden.test.ts -u`. Expected: green, and `git diff` shows only the snapshot line — exactly what a reviewer of a real tuning session would see.
3. Restore the original value and re-bless again. Expected: `git status` clean.

- [ ] **Step 9: Run the full gate**

Run: `npm run verify`
Expected: all green.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(game): wave and case flow, credits-driven progression, blessed golden snapshot"
```

**Verification command:** `npm run verify`
**Passing looks like:** the simulation is feature-complete; its behaviour is pinned by a blessed, re-blessable snapshot; a value tuning turns exactly one test red and one command turns it green again.

---

## Phase 9 — Fight screen: HUD store, dock, placement, result sheets

**Why now:** the simulation is complete and its snapshot blessed, so the UI has a stable contract to render. Nothing in this phase may change the golden snapshot.

**Files:**
- Create: `src/app/state/useHud.ts`
- Create: `src/app/components/EnergyPill.tsx`, `TissuePips.tsx`, `DefenderDock.tsx`, `FeverButton.tsx`, `RiseSheet.tsx`, `ResultSheet.tsx`
- Create: `src/app/components/DefenderDock.test.tsx`, `TissuePips.test.tsx`, `ResultSheet.test.tsx`
- Create: `src/app/fight.css`
- Rewrite: `src/app/pages/FightPage.tsx`
- Port from: prototype markup lines 138–205 (fight screen), 321–355 (result sheet); logic lines 1068–1101 (HUD values and result copy); asset sheet lines 770–826 (HUD parts)

**Interfaces:**
- Consumes: `GameLoop`, `HudSnapshot`, commands, `BoardRenderer`.
- Produces: `useHud(loop: GameLoop | null): HudSnapshot`, and the six components above.

- [ ] **Step 1: Write `src/app/state/useHud.ts`**

```tsx
import { useSyncExternalStore } from 'react';
import type { GameLoop, HudSnapshot } from '@game/loop';

const IDLE: HudSnapshot = {
  phase: 'build', result: null, energy: 0, tissue: 5, waveIndex: 0, waveCount: 5,
  selected: null, fast: false, feverSeconds: 0, feverUsed: false, enemyCount: 0,
  occupiedMask: 0, waveKills: 0, waveLeaks: 0,
};

const noop = (): (() => void) => () => undefined;
const idle = (): HudSnapshot => IDLE;

export function useHud(loop: GameLoop | null): HudSnapshot {
  return useSyncExternalStore(
    loop?.subscribe ?? noop,
    loop?.getSnapshot ?? idle,
    idle,
  );
}
```

`IDLE` is a module-level constant so `idle` returns a stable reference. Returning a fresh object would make `useSyncExternalStore` loop forever — this is the single most common way to get this hook wrong.

- [ ] **Step 2: Write the failing dock test**

`src/app/components/DefenderDock.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DefenderDock } from './DefenderDock';
import { DEFENDERS } from '@game/content/defenders';

const base = { energy: 9999, selected: null, clearedCount: 2, onSelect: () => undefined };

describe('DefenderDock', () => {
  it('shows all six verbs in dock order', () => {
    render(<DefenderDock {...base} />);
    const labels = screen.getAllByTestId('dock-label').map((el) => el.textContent);
    expect(labels).toEqual(['Engulf', 'Block', 'Tag', 'Execute', 'Burst', 'Learn']);
  });

  it('shows LOCK instead of a price for a defender that is not unlocked', () => {
    render(<DefenderDock {...base} clearedCount={0} />);
    expect(screen.getByTestId('dock-cost-mast')).toHaveTextContent('LOCK');
    expect(screen.getByTestId('dock-cost-phago')).toHaveTextContent(String(DEFENDERS.phago.cost));
  });

  it('marks an unaffordable price rather than disabling the card', () => {
    render(<DefenderDock {...base} energy={DEFENDERS.anti.cost - 1} />);
    const card = screen.getByTestId('dock-card-anti');
    expect(card).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('dock-cost-anti')).toHaveAttribute('data-affordable', 'false');
  });

  it('marks the selected card', () => {
    render(<DefenderDock {...base} selected="clot" />);
    expect(screen.getByTestId('dock-card-clot')).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByTestId('dock-card-phago')).toHaveAttribute('aria-pressed', 'false');
  });

  it('reports the tapped defender', async () => {
    const onSelect = vi.fn();
    render(<DefenderDock {...base} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('dock-card-nk'));
    expect(onSelect).toHaveBeenCalledWith('nk');
  });

  it('ignores a tap on a locked defender', async () => {
    const onSelect = vi.fn();
    render(<DefenderDock {...base} clearedCount={0} onSelect={onSelect} />);
    await userEvent.click(screen.getByTestId('dock-card-mem'));
    expect(onSelect).not.toHaveBeenCalled();
  });
});
```

Install the interaction library: `npm i -D @testing-library/user-event@14.6.1`.

- [ ] **Step 3: Run to verify failure, then write `src/app/components/DefenderDock.tsx`**

Run: `npx vitest run src/app/components/DefenderDock.test.tsx` — Expected: FAIL, unresolved import.

```tsx
import { DEFENDERS, DEFENDER_ORDER } from '@game/content/defenders';
import { palette } from '@theme/tokens';
import type { DefenderKind } from '@game/types';

interface DefenderDockProps {
  readonly energy: number;
  readonly selected: DefenderKind | null;
  readonly clearedCount: number;
  readonly onSelect: (kind: DefenderKind) => void;
}

export function DefenderDock({ energy, selected, clearedCount, onSelect }: DefenderDockProps) {
  return (
    <div className="dock">
      {DEFENDER_ORDER.map((kind) => {
        const stats = DEFENDERS[kind];
        const locked = clearedCount < stats.unlock;
        const affordable = energy >= stats.cost;
        const on = selected === kind;
        const color = palette[stats.token].css;

        return (
          <button
            key={kind}
            type="button"
            data-testid={`dock-card-${kind}`}
            aria-pressed={on}
            className="dock-card"
            style={{
              borderColor: on ? color : 'transparent',
              background: on ? `color-mix(in oklch, ${color} 14%, transparent)` : 'var(--surface)',
              opacity: locked ? 0.4 : 1,
            }}
            onClick={() => { if (!locked) onSelect(kind); }}
          >
            <span className="dock-glyph" style={{ background: color }} />
            <span className="dock-label" data-testid="dock-label">{stats.label}</span>
            <span
              className="mono dock-cost"
              data-testid={`dock-cost-${kind}`}
              data-affordable={String(!locked && affordable)}
            >
              {locked ? 'LOCK' : String(stats.cost)}
            </span>
          </button>
        );
      })}
    </div>
  );
}
```

The card is never `disabled`. Asset sheet line 814: "Unaffordable shows a red price, never a disabled card." The red comes from `[data-affordable="false"]` in CSS.

Run: `npx vitest run src/app/components/DefenderDock.test.tsx` — Expected: PASS, 6 tests.

- [ ] **Step 4: Write `TissuePips` and its test**

`src/app/components/TissuePips.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TissuePips } from './TissuePips';
import { TISSUE_MAX } from '@game/content/rules';

describe('TissuePips', () => {
  it('always shows every pip as a discrete life, never a percentage', () => {
    render(<TissuePips tissue={3} />);
    expect(screen.getAllByTestId('pip')).toHaveLength(TISSUE_MAX);
  });

  it('greys exactly one pip per leak so the cost is countable', () => {
    render(<TissuePips tissue={3} />);
    const lit = screen.getAllByTestId('pip').filter((p) => p.dataset['lit'] === 'true');
    expect(lit).toHaveLength(3);
  });

  it('labels the count for a screen reader', () => {
    render(<TissuePips tissue={4} />);
    expect(screen.getByText(`TISSUE 4/${String(TISSUE_MAX)}`)).toBeInTheDocument();
  });

  it('shows nothing lit at zero rather than a negative count', () => {
    render(<TissuePips tissue={-1} />);
    const lit = screen.getAllByTestId('pip').filter((p) => p.dataset['lit'] === 'true');
    expect(lit).toHaveLength(0);
  });
});
```

```tsx
import { TISSUE_MAX } from '@game/content/rules';

export function TissuePips({ tissue }: { readonly tissue: number }) {
  const remaining = Math.max(0, Math.min(TISSUE_MAX, tissue));
  return (
    <div className="pips">
      {Array.from({ length: TISSUE_MAX }, (_, index) => (
        <span key={index} data-testid="pip" data-lit={String(index < remaining)} className="pip" />
      ))}
      <span className="mono pips-label">{`TISSUE ${String(remaining)}/${String(TISSUE_MAX)}`}</span>
    </div>
  );
}
```

Run: `npx vitest run src/app/components/TissuePips.test.tsx` — Expected: PASS, 4 tests.

- [ ] **Step 5: Write `EnergyPill`, `FeverButton` and `RiseSheet`**

```tsx
// src/app/components/EnergyPill.tsx
export function EnergyPill({ energy }: { readonly energy: number }) {
  return (
    <div className="energy-pill">
      <span className="energy-dot" />
      <span className="mono" data-testid="energy">{String(energy)}</span>
    </div>
  );
}
```

```tsx
// src/app/components/FeverButton.tsx
interface FeverButtonProps {
  readonly seconds: number;
  readonly used: boolean;
  readonly available: boolean;
  readonly onUse: () => void;
}

export function FeverButton({ seconds, used, available, onUse }: FeverButtonProps) {
  const label = seconds > 0 ? `${String(Math.ceil(seconds))}S` : used ? 'USED' : '1 USE';
  return (
    <button
      type="button"
      className="fever"
      data-testid="fever"
      data-active={String(seconds > 0)}
      style={{ opacity: available ? 1 : 0.45 }}
      onClick={onUse}
    >
      <span className="fever-glyph" />
      <span className="dock-label">Fever</span>
      <span className="mono dock-cost">{label}</span>
    </button>
  );
}
```

```tsx
// src/app/components/RiseSheet.tsx
import type { ReactNode } from 'react';

/** Sheets rise 14px over 250ms. Nothing slides sideways, nothing bounces. */
export function RiseSheet({ children }: { readonly children: ReactNode }) {
  return (
    <div className="sheet-scrim" role="dialog" aria-modal="true">
      <div className="sheet rise">{children}</div>
    </div>
  );
}
```

- [ ] **Step 6: Write the failing result-sheet test**

The copy is ported verbatim from prototype lines 1018–1020, with decision D5 applied to the reward figure.

`src/app/components/ResultSheet.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultSheet } from './ResultSheet';
import { CASE_CLEAR_BANK, WAVE_CLEAR_ENERGY } from '@game/content/rules';

const base = {
  waveIndex: 0, waveCount: 5, kills: 12, leaks: 1, caseTitle: 'Deep cut',
  onPrimary: () => undefined, onLeave: () => undefined,
};

describe('ResultSheet', () => {
  it('states what happened after a held wave and offers the next move', () => {
    render(<ResultSheet {...base} result="wave" />);
    expect(screen.getByTestId('result-kicker')).toHaveTextContent('WAVE 1 OF 5 HELD');
    expect(screen.getByTestId('result-cta')).toHaveTextContent('Build for wave 2');
    expect(screen.getByTestId('result-reward')).toHaveTextContent(`+${String(WAVE_CLEAR_ENERGY)}`);
  });

  it('reports the banked reward on a cleared case', () => {
    render(<ResultSheet {...base} result="case" />);
    expect(screen.getByTestId('result-kicker')).toHaveTextContent('DEEP CUT CLEARED');
    expect(screen.getByTestId('result-cta')).toHaveTextContent('Back to the body');
    expect(screen.getByTestId('result-reward')).toHaveTextContent(`+${String(CASE_CLEAR_BANK)}`);
  });

  it('states a loss without scolding and offers the next move', () => {
    render(<ResultSheet {...base} result="lost" />);
    expect(screen.getByTestId('result-title')).toHaveTextContent('It got into the blood.');
    expect(screen.getByTestId('result-cta')).toHaveTextContent('Try this case again');
    expect(screen.getByTestId('result-reward')).toHaveTextContent('0');
  });

  it('uses no exclamation marks and no emoji anywhere', () => {
    for (const result of ['wave', 'case', 'lost'] as const) {
      const { container, unmount } = render(<ResultSheet {...base} result={result} />);
      const text = container.textContent ?? '';
      expect(text).not.toMatch(/!/);
      expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
      unmount();
    }
  });

  it('offers a way out of a held wave but not out of a cleared case', () => {
    const { rerender } = render(<ResultSheet {...base} result="wave" />);
    expect(screen.queryByTestId('result-leave')).toBeInTheDocument();
    rerender(<ResultSheet {...base} result="case" />);
    expect(screen.queryByTestId('result-leave')).not.toBeInTheDocument();
  });

  it('reports the primary action', async () => {
    const onPrimary = vi.fn();
    render(<ResultSheet {...base} result="wave" onPrimary={onPrimary} />);
    await userEvent.click(screen.getByTestId('result-cta'));
    expect(onPrimary).toHaveBeenCalledOnce();
  });
});
```

- [ ] **Step 7: Run to verify failure, then write `src/app/components/ResultSheet.tsx`**

```tsx
import { CASE_CLEAR_BANK, WAVE_CLEAR_ENERGY } from '@game/content/rules';
import { palette } from '@theme/tokens';
import type { ResultKind } from '@game/types';
import { RiseSheet } from './RiseSheet';

interface ResultSheetProps {
  readonly result: ResultKind;
  readonly waveIndex: number;
  readonly waveCount: number;
  readonly kills: number;
  readonly leaks: number;
  readonly caseTitle: string;
  readonly onPrimary: () => void;
  readonly onLeave: () => void;
}

interface Copy {
  readonly kicker: string;
  readonly title: string;
  readonly body: string;
  readonly cta: string;
  readonly accent: string;
  readonly reward: string;
  readonly canLeave: boolean;
}

function copyFor(props: ResultSheetProps): Copy {
  const wave = props.waveIndex + 1;
  switch (props.result) {
    case 'wave':
      return {
        kicker: `WAVE ${String(wave)} OF ${String(props.waveCount)} HELD`,
        title: 'Swelling going down.',
        body: 'Build before the next one arrives. Unspent energy carries over.',
        cta: `Build for wave ${String(wave + 1)}`,
        accent: palette.frontline.css,
        reward: `+${String(WAVE_CLEAR_ENERGY)}`,
        canLeave: true,
      };
    case 'case':
      return {
        kicker: `${props.caseTitle.toUpperCase()} CLEARED`,
        title: 'The region is yours.',
        body: 'Tissue is closing on its own now. Immunity to this strain went up.',
        cta: 'Back to the body',
        accent: palette.support.css,
        reward: `+${String(CASE_CLEAR_BANK)}`,
        canLeave: false,
      };
    case 'lost':
      return {
        kicker: `TISSUE FAILED · WAVE ${String(wave)}`,
        title: 'It got into the blood.',
        body: 'The region is lost. Take the case again — you keep what you learned.',
        cta: 'Try this case again',
        accent: palette.threat.css,
        reward: '0',
        canLeave: true,
      };
  }
}

export function ResultSheet(props: ResultSheetProps) {
  const copy = copyFor(props);
  return (
    <RiseSheet>
      <span className="mono result-kicker" data-testid="result-kicker" style={{ color: copy.accent }}>
        {copy.kicker}
      </span>
      <h2 data-testid="result-title">{copy.title}</h2>
      <p>{copy.body}</p>

      <div className="result-stats">
        <div className="result-stat">
          <span className="mono" data-testid="result-kills">{String(props.kills)}</span>
          <span>Cleared</span>
        </div>
        <div className="result-stat">
          <span className="mono result-leaks" data-testid="result-leaks">{String(props.leaks)}</span>
          <span>Got through</span>
        </div>
        <div className="result-stat result-stat-energy">
          <span className="mono" data-testid="result-reward">{copy.reward}</span>
          <span>Energy</span>
        </div>
      </div>

      <button type="button" className="primary" data-testid="result-cta"
        style={{ background: copy.accent }} onClick={props.onPrimary}>
        {copy.cta}
      </button>
      {copy.canLeave && (
        <button type="button" className="secondary" data-testid="result-leave" onClick={props.onLeave}>
          Leave the region
        </button>
      )}
    </RiseSheet>
  );
}
```

The prototype's titles contain a hard `\n` (lines 1018–1020). Here the line break is CSS (`text-wrap: balance` on `.sheet h2`) rather than a literal newline, so the copy reads correctly to a screen reader and the test can match a single string.

Run: `npx vitest run src/app/components/ResultSheet.test.tsx` — Expected: PASS, 6 tests.

- [ ] **Step 8: Rewrite `src/app/pages/FightPage.tsx`**

The React tree owns the chrome; Pixi owns the board. Nothing on the play surface round-trips through React state.

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useHistory, useParams } from 'react-router-dom';
import {
  advanceToNextWave, placeDefender, restartCase, selectDefender, startWave, toggleSpeed, triggerFever,
} from '@game/commands';
import { CASE_BY_ID, isCaseId } from '@game/content/cases';
import { GameLoop } from '@game/loop';
import { createSimState } from '@game/state';
import type { BoardRenderer } from '@render/BoardRenderer';
import { BoardCanvas } from '@app/components/BoardCanvas';
import { DefenderDock } from '@app/components/DefenderDock';
import { EnergyPill } from '@app/components/EnergyPill';
import { FeverButton } from '@app/components/FeverButton';
import { ResultSheet } from '@app/components/ResultSheet';
import { TissuePips } from '@app/components/TissuePips';
import { useGameLoop } from '@app/state/useGameLoop';
import { useHud } from '@app/state/useHud';
import { useProfile } from '@app/state/ProfileProvider';
import '../fight.css';

export function FightPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const history = useHistory();
  const { profile, recordClear } = useProfile();
  const rendererRef = useRef<BoardRenderer | null>(null);
  const [loop, setLoop] = useState<GameLoop | null>(null);

  const valid = isCaseId(caseId);

  useEffect(() => {
    if (!valid) return;
    setLoop(new GameLoop(createSimState({
      caseId,
      immunity: profile.immunity,
      clearedCount: profile.cleared.length,
      totalKills: profile.kills,
    })));
    // A new loop is built per case, never per profile change mid-case.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caseId, valid]);

  const hud = useHud(loop);

  useGameLoop(loop, useCallback((state) => { rendererRef.current?.draw(state); }, []));

  const run = useCallback((mutate: () => void) => {
    mutate();
    loop?.publish();
  }, [loop]);

  if (!valid || loop === null) {
    return <IonPage><IonContent /></IonPage>;
  }

  const definition = CASE_BY_ID[caseId];
  const buildPhase = hud.phase === 'build' || hud.phase === 'built';
  const showResult = hud.result !== null;

  const onResultPrimary = () => {
    if (hud.result === 'wave') { run(() => { advanceToNextWave(loop.state); }); return; }
    if (hud.result === 'case') { recordClear(caseId, loop.state.totalKills); history.push('/'); return; }
    setLoop(new GameLoop(restartCase(loop.state)));
  };

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="fight">
          <header className="fight-header">
            <div className="fight-title">
              <span className="mono fight-region">
                {`${definition.region.split(' · ')[0] ?? ''} · ${definition.ruleLabel.toUpperCase()}`}
              </span>
              <span className="fight-wave">
                {`Wave ${String(hud.waveIndex + 1)} of ${String(hud.waveCount)}`}
              </span>
            </div>
            <EnergyPill energy={hud.energy} />
            <button type="button" className="icon-button" onClick={() => { history.push('/'); }}>
              <span className="pause-bar" /><span className="pause-bar" />
            </button>
          </header>

          <TissuePips tissue={hud.tissue} />

          <div className="board">
            <BoardCanvas
              caseId={caseId}
              onRendererReady={(renderer) => { rendererRef.current = renderer; }}
              onSpotTap={(spot) => { run(() => { placeDefender(loop.state, spot); }); }}
            />
            <span className="mono board-hint">
              {buildPhase
                ? (hud.selected === null ? 'PICK A CELL BELOW' : 'TAP A JUNCTION TO PLACE')
                : hud.enemyCount > 0 ? `${String(hud.enemyCount)} IN THE VESSEL` : 'INCOMING'}
            </span>
            {hud.phase === 'wave' && (
              <span className="mono board-modifier">
                <span className="modifier-dot pulse" />
                {definition.ruleLabel.toUpperCase()}
              </span>
            )}
          </div>

          <footer className="fight-footer">
            <div className="dock-row">
              <DefenderDock
                energy={hud.energy}
                selected={hud.selected}
                clearedCount={profile.cleared.length}
                onSelect={(kind) => { run(() => { selectDefender(loop.state, kind); }); }}
              />
              <FeverButton
                seconds={hud.feverSeconds}
                used={hud.feverUsed}
                available={hud.phase === 'wave' && !hud.feverUsed}
                onUse={() => { run(() => { triggerFever(loop.state); }); }}
              />
            </div>
            <div className="action-row">
              <button
                type="button"
                className="primary"
                data-testid="start-wave"
                data-enabled={String(buildPhase)}
                onClick={() => { if (buildPhase) run(() => { startWave(loop.state); }); }}
              >
                {buildPhase ? `Start wave ${String(hud.waveIndex + 1)}` : 'Wave in progress'}
              </button>
              <button type="button" className="speed mono"
                onClick={() => { run(() => { toggleSpeed(loop.state); }); }}>
                {hud.fast ? '2×' : '1×'}
              </button>
            </div>
          </footer>

          {showResult && hud.result !== null && (
            <ResultSheet
              result={hud.result}
              waveIndex={hud.waveIndex}
              waveCount={hud.waveCount}
              kills={hud.waveKills}
              leaks={hud.waveLeaks}
              caseTitle={definition.title}
              onPrimary={onResultPrimary}
              onLeave={() => { history.push('/'); }}
            />
          )}
        </div>
      </IonContent>
    </IonPage>
  );
}
```

`run()` calls `loop.publish()` after every command so a tap feels immediate rather than up to 100 ms late. The 10 Hz throttle governs the simulation's own changes, not the player's.

`useProfile` and `recordClear` arrive in Phase 11. Until then, stub `ProfileProvider` with `createFreshProfile()` and a no-op `recordClear` so this phase compiles and runs.

- [ ] **Step 9: Write `src/app/fight.css`**

Layout ported from prototype lines 140–203. The board is never covered; everything tappable lives in the bottom third; minimum tap target 44 px, primary action 54 px in game (asset sheet lines 146, 775, 823).

```css
.fight { position: absolute; inset: 0; display: flex; flex-direction: column; }

.fight-header {
  flex: none; display: flex; align-items: center; gap: 10px;
  padding: calc(var(--safe-top) + 4px) 18px 10px;
}
.fight-title { flex: 1; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.fight-region { font-size: 11px; letter-spacing: 0.1em; color: var(--label); }
.fight-wave { font-size: 19px; font-weight: 700; letter-spacing: -0.01em; }

.energy-pill {
  display: flex; align-items: center; gap: 6px; border-radius: 999px;
  padding: 7px 12px 7px 9px;
  background: color-mix(in oklch, var(--energy) 16%, transparent);
  color: oklch(0.42 0.06 80); font-size: 15px;
}
.energy-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--energy); }

.icon-button {
  width: 44px; height: 44px; border: 0; border-radius: var(--radius-chip);
  background: var(--surface-strong); display: flex; align-items: center;
  justify-content: center; gap: 3px; cursor: pointer;
}
.pause-bar { width: 4px; height: 13px; border-radius: 1px; background: var(--ink); }

.pips { flex: none; display: flex; gap: 4px; align-items: center; padding: 0 18px 10px; }
.pip { flex: 1; height: 8px; border-radius: 4px; background: var(--not-reached); }
.pip[data-lit='true'] { background: var(--frontline); }
.pips-label { margin-left: 8px; font-size: 11px; letter-spacing: 0.08em; color: var(--label); }

.board { flex: 1; position: relative; min-height: 0; overflow: hidden; background: var(--tissue-field); }
.board-hint {
  position: absolute; left: 12px; bottom: 12px; pointer-events: none;
  background: oklch(0.98 0.005 70 / 0.94); border-radius: 10px; padding: 7px 11px;
  font-size: 11px; letter-spacing: 0.05em; color: var(--muted);
}
.board-modifier {
  position: absolute; left: 12px; top: 12px; pointer-events: none;
  display: flex; align-items: center; gap: 7px;
  background: var(--threat); border-radius: 10px; padding: 7px 11px;
  font-size: 10px; letter-spacing: 0.1em; color: #fff6f4;
}
.modifier-dot { width: 8px; height: 8px; border-radius: 50%; background: #fff6f4; }

.fight-footer {
  flex: none; display: flex; flex-direction: column; gap: 11px;
  padding: 12px 16px calc(var(--safe-bottom) + 10px);
  background: var(--screen-paper);
  box-shadow: 0 -8px 20px -12px oklch(0.3 0.02 60 / 0.3);
}
.dock-row { display: flex; gap: 7px; align-items: stretch; }
.dock { flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(6, 1fr); gap: 5px; }

.dock-card, .fever {
  border-radius: var(--radius-chip); border: 2px solid transparent; padding: 8px 2px 7px;
  display: flex; flex-direction: column; align-items: center; gap: 4px;
  min-width: 0; min-height: 62px; cursor: pointer; background: var(--surface);
}
.fever { width: 54px; flex: none; border-color: oklch(0.58 0.16 15 / 0.35); }
.fever[data-active='true'] { background: color-mix(in oklch, var(--fever) 20%, transparent); }
.dock-glyph, .fever-glyph { width: 26px; height: 26px; border-radius: 50%; flex: none; }
.fever-glyph { background: var(--fever); }
.dock-label { font-size: 9px; font-weight: 600; white-space: nowrap; letter-spacing: -0.01em; }
.dock-cost { font-size: 10px; color: oklch(0.42 0.06 80); }
.dock-cost[data-affordable='false'] { color: var(--threat); }

.action-row { display: flex; gap: 10px; align-items: center; }
.primary {
  flex: 1; min-height: 52px; border: 0; border-radius: var(--radius-control);
  background: var(--threat); color: #fff9f2; font-size: 17px; font-weight: 700; cursor: pointer;
}
.primary[data-enabled='false'] { background: var(--surface-strong); color: var(--muted); }
.primary:active { opacity: 0.85; }
.secondary {
  min-height: 42px; border: 0; background: none; color: var(--muted);
  font-size: 15px; font-weight: 600; cursor: pointer;
}
.speed {
  width: 52px; height: 52px; border: 0; border-radius: var(--radius-control);
  background: var(--surface-strong); font-size: 15px; cursor: pointer;
}

.sheet-scrim {
  position: absolute; inset: 0; z-index: 10; display: flex; align-items: flex-end;
  background: oklch(0.28 0.02 60 / 0.5);
}
.sheet {
  width: 100%; background: var(--screen-paper); padding: 24px 26px calc(var(--safe-bottom) + 16px);
  border-radius: var(--radius-sheet) var(--radius-sheet) 38px 38px;
  display: flex; flex-direction: column; gap: 18px;
}
.sheet h2 {
  margin: 0; font-size: 36px; line-height: 1.03; font-weight: 800;
  letter-spacing: -0.03em; text-wrap: balance;
}
.sheet p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--muted); text-wrap: pretty; }
.result-kicker { font-size: 11px; letter-spacing: 0.14em; }
.result-stats { display: flex; gap: 9px; }
.result-stat {
  flex: 1; border-radius: var(--radius-control); background: var(--surface); padding: 14px;
  display: flex; flex-direction: column; gap: 4px;
}
.result-stat span:first-child { font-size: 22px; }
.result-stat span:last-child { font-size: 12px; font-weight: 600; color: var(--muted); }
.result-stat-energy { background: color-mix(in oklch, var(--energy) 20%, transparent); }
.result-leaks { color: oklch(0.55 0.15 25); }
```

- [ ] **Step 10: Play a full case end to end**

Run: `npm run dev`, open `/play/forearm`.
Expected:
- Tapping a dock card rings it and tints it at 14%; the board hint changes to `TAP A JUNCTION TO PLACE`.
- Tapping a build spot places the cell and the energy pill drops immediately, not a tenth of a second later.
- An unaffordable price is red; the card is still tappable.
- `Start wave 1` runs the wave; the `BLEEDING` chip appears top-left with a pulsing dot; the pips grey one at a time as enemies leak.
- The wave result sheet rises 14 px over 250 ms and shows `WAVE 1 OF 5 HELD` and `+50`.
- `2×` doubles the pace and `1×` restores it.
- Fever is only tappable during a wave, once.
- Losing all five pips shows `It got into the blood.` with `Try this case again`.

- [ ] **Step 11: Verify the HUD update rate**

In DevTools, record a performance profile for ten seconds during a wave.
Expected: React commits at roughly 10 per second, not 60. If it commits every frame, `sameSnapshot` is returning `false` when nothing meaningful changed — most likely `feverSeconds` is being compared raw.

- [ ] **Step 12: Confirm the simulation is untouched**

Run: `npx vitest run src/game/golden.test.ts`
Expected: PASS. The blessed snapshot must be unchanged by anything in this phase — a UI phase never re-blesses.

- [ ] **Step 13: Run the full gate and commit**

Run: `npm run verify`

```bash
git add -A
git commit -m "feat(app): fight screen with throttled HUD store, dock, placement and result sheets"
```

**Verification command:** `npm run verify` plus the manual play-through in Step 10.
**Passing looks like:** a case is playable end to end in the browser; React commits at ~10 Hz while the board runs at 60; the golden hash is unchanged.

---

## Phase 10 — Tuning panel: live content editing, module export, absent from production

**Why now:** the fight screen is playable, so a tuned number can be *felt* immediately — before this point the panel would adjust a game nobody can play. Spec §4.1: balancing is a playtest loop, not an edit-rebuild loop.

**Files:**
- Create: `src/game/content/tuning.ts` + `tuning.test.ts`
- Create: `src/app/dev/TuningPanel.tsx`, `src/app/dev/tuning.css`
- Modify: `src/app/pages/FightPage.tsx` — dev-only mount point
- Modify: `.github/workflows/ci.yml` — production-absence gate (Step 8)

**Interfaces:**
- Consumes: `DEFENDERS`, `PATHOGENS`, `CASES`, `GameLoop`.
- Produces:
  - `applyDefenderTuning(kind: DefenderKind, patch: Partial<...>): void`, `applyPathogenTuning(kind: PathogenKind, patch: Partial<...>): void`
  - `listTunables(): readonly TunableField[]` where `TunableField = { readonly group: 'defender' | 'pathogen'; readonly kind: string; readonly field: string; readonly value: number }`
  - `exportContentModules(): { readonly defenders: string; readonly pathogens: string }` — TS source text
  - `TuningPanel` React component (dev bundle only)

### Design constraints

- **The single unsafe cast lives in `tuning.ts`.** Content types stay `readonly` for every normal consumer; `tuning.ts` holds one documented `as` widening to mutate the live objects. Systems read stats at call time, not at module load, so a mutation takes effect on the next simulation step with no plumbing.
- **`tuning.ts` is in `src/game/`** and obeys the no-DOM rule — it is pure data manipulation and string generation, unit-testable without a browser. The *panel* is `src/app/dev/`.
- **Dev-only by construction.** The panel is loaded with a dynamic `import()` guarded by `import.meta.env.DEV`. Vite statically replaces that constant with `false` in production builds and eliminates the whole branch, so the panel and `tuning.ts`'s export machinery never reach the bundle. Step 8 proves it rather than assuming it.
- **Export is a reviewable diff.** `exportContentModules()` regenerates `defenders.ts` / `pathogens.ts` source with the live values. The panel offers "Copy defenders.ts" / "Copy pathogens.ts"; the developer pastes over the file and reviews `git diff` — the same values the session played are the values in review. No filesystem access is attempted from the browser.
- Wave-composition editing is table stakes for §4.1 and is included as counts-per-kind steppers on the current case's waves, mutating `CASES` the same way. Path/spot geometry editing is **not** included — that is a level editor, not a tuning panel (YAGNI).

- [ ] **Step 1: Write the failing tuning test**

`src/game/content/tuning.test.ts`:

```ts
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyDefenderTuning, applyPathogenTuning, exportContentModules, listTunables, resetTuning,
} from './tuning';
import { DEFENDERS } from './defenders';
import { PATHOGENS } from './pathogens';

afterEach(() => { resetTuning(); });

describe('applyDefenderTuning', () => {
  it('changes the live value the simulation reads', () => {
    const before = DEFENDERS.phago.dps;
    applyDefenderTuning('phago', { dps: before + 5 });
    expect(DEFENDERS.phago.dps).toBe(before + 5);
  });

  it('rejects a field the defender does not have', () => {
    // @ts-expect-error clot has no dps — the type system is the first guard
    expect(() => applyDefenderTuning('clot', { dps: 1 })).toThrow(/unknown field/i);
  });

  it('rejects a non-finite value', () => {
    expect(() => applyDefenderTuning('phago', { dps: Number.NaN })).toThrow(/finite/i);
  });
});

describe('resetTuning', () => {
  it('restores every seed value', () => {
    const before = PATHOGENS.staph.speed;
    applyPathogenTuning('staph', { speed: before * 2 });
    resetTuning();
    expect(PATHOGENS.staph.speed).toBe(before);
  });
});

describe('listTunables', () => {
  it('lists every numeric field of every defender and pathogen', () => {
    const fields = listTunables();
    expect(fields.some((f) => f.group === 'defender' && f.kind === 'phago' && f.field === 'dps')).toBe(true);
    expect(fields.some((f) => f.group === 'pathogen' && f.kind === 'mrsa' && f.field === 'armour')).toBe(true);
    expect(fields.every((f) => Number.isFinite(f.value))).toBe(true);
  });

  it('never lists a non-numeric field', () => {
    expect(listTunables().some((f) => f.field === 'label' || f.field === 'name')).toBe(false);
  });
});

describe('exportContentModules', () => {
  it('emits the live values as compilable module source', () => {
    applyDefenderTuning('phago', { cost: DEFENDERS.phago.cost + 5 });
    const { defenders } = exportContentModules();
    expect(defenders).toContain(`cost: ${String(DEFENDERS.phago.cost)}`);
    expect(defenders).toContain("export const DEFENDERS");
  });

  it('round-trips: exporting with no tuning applied reproduces the current values verbatim', () => {
    const { defenders, pathogens } = exportContentModules();
    for (const d of Object.values(DEFENDERS)) expect(defenders).toContain(`cost: ${String(d.cost)}`);
    for (const p of Object.values(PATHOGENS)) expect(pathogens).toContain(`hp: ${String(p.hp)}`);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/content/tuning.test.ts`
Expected: FAIL — unresolved import.

- [ ] **Step 3: Implement `src/game/content/tuning.ts`**

```ts
import { DEFENDERS, type DefenderStats } from './defenders';
import { PATHOGENS, type PathogenStats } from './pathogens';
import type { DefenderKind, PathogenKind } from '../types';

type Mutable<T> = { -readonly [K in keyof T]: T[K] };

// The one place readonly content is widened. Everything else in the codebase
// sees the readonly types; this module exists so the dev panel can move numbers
// against the running simulation (spec 4.1).
const liveDefenders = DEFENDERS as { [K in DefenderKind]: Mutable<DefenderStats> };
const livePathogens = PATHOGENS as { [K in PathogenKind]: Mutable<PathogenStats> };

const seedDefenders = structuredClone(DEFENDERS);
const seedPathogens = structuredClone(PATHOGENS);

type NumericKeys<T> = { [K in keyof T]: T[K] extends number ? K : never }[keyof T] & string;

function assertPatch(target: Record<string, unknown>, patch: Record<string, unknown>): void {
  for (const [field, value] of Object.entries(patch)) {
    if (!(field in target) || typeof target[field] !== 'number') {
      throw new Error(`Unknown field for tuning: ${field}`);
    }
    if (typeof value !== 'number' || !Number.isFinite(value)) {
      throw new Error(`Tuning values must be finite numbers; got ${String(value)} for ${field}`);
    }
  }
}

export function applyDefenderTuning<K extends DefenderKind>(
  kind: K,
  patch: Partial<Pick<(typeof DEFENDERS)[K], NumericKeys<(typeof DEFENDERS)[K]>>>,
): void {
  assertPatch(liveDefenders[kind] as Record<string, unknown>, patch as Record<string, unknown>);
  Object.assign(liveDefenders[kind], patch);
}

export function applyPathogenTuning<K extends PathogenKind>(
  kind: K,
  patch: Partial<Pick<PathogenStats, NumericKeys<PathogenStats>>>,
): void {
  assertPatch(livePathogens[kind] as Record<string, unknown>, patch as Record<string, unknown>);
  Object.assign(livePathogens[kind], patch);
}

export function resetTuning(): void {
  for (const kind of Object.keys(liveDefenders) as DefenderKind[]) {
    Object.assign(liveDefenders[kind], seedDefenders[kind]);
  }
  for (const kind of Object.keys(livePathogens) as PathogenKind[]) {
    Object.assign(livePathogens[kind], seedPathogens[kind]);
  }
}

export interface TunableField {
  readonly group: 'defender' | 'pathogen';
  readonly kind: string;
  readonly field: string;
  readonly value: number;
}

export function listTunables(): readonly TunableField[] {
  const fields: TunableField[] = [];
  for (const [kind, stats] of Object.entries(DEFENDERS)) {
    for (const [field, value] of Object.entries(stats)) {
      if (typeof value === 'number') fields.push({ group: 'defender', kind, field, value });
    }
  }
  for (const [kind, stats] of Object.entries(PATHOGENS)) {
    for (const [field, value] of Object.entries(stats)) {
      if (typeof value === 'number') fields.push({ group: 'pathogen', kind, field, value });
    }
  }
  return fields;
}

function literal(value: unknown): string {
  if (typeof value === 'string') return `'${value.replace(/'/g, "\\'")}'`;
  return String(value);
}

function entrySource(stats: Record<string, unknown>): string {
  return Object.entries(stats)
    .map(([field, value]) => `${field}: ${literal(value)}`)
    .join(', ');
}

/** Regenerates content-module source from the live values. The paste target is the file itself. */
export function exportContentModules(): { readonly defenders: string; readonly pathogens: string } {
  const defenderEntries = Object.entries(DEFENDERS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(stats as Record<string, unknown>)} },`)
    .join('\n');
  const pathogenEntries = Object.entries(PATHOGENS)
    .map(([kind, stats]) => `  ${kind}: { ${entrySource(stats as Record<string, unknown>)} },`)
    .join('\n');

  return {
    defenders: `export const DEFENDERS = {\n${defenderEntries}\n};\n`,
    pathogens: `export const PATHOGENS = {\n${pathogenEntries}\n};\n`,
  };
}
```

The export intentionally emits only the table body — the developer pastes the entries into the existing file, keeping its imports, types and comments; the panel labels the copy button accordingly.

- [ ] **Step 4: Run the tuning tests**

Run: `npx vitest run src/game/content/tuning.test.ts`
Expected: PASS, 8 tests.

Then run the whole suite: `npm run test`. Expected: all green — proof that mutating and resetting content around every test leaves the suite order-independent. If anything fails here, a test forgot `resetTuning` in `afterEach` or asserted a literal it should derive.

- [ ] **Step 5: Write `src/app/dev/TuningPanel.tsx`**

A collapsible overlay on the fight screen. Structure — no code listing here because it is conventional React over the Step 3 API:

- One `<details>` group per defender and pathogen kind; inside, one row per `TunableField`: label, `<input type="number">` bound to the live value, step 0.1 for rates/fractions, 1 otherwise.
- `onChange` calls `applyDefenderTuning` / `applyPathogenTuning` and then `loop.publish()` so the HUD reflects cost changes immediately. The board needs nothing — it reads live stats next frame.
- A wave-composition section for the current case: per wave, per kind, a count stepper mutating `CASES` through the same guarded pattern (add `applyWaveTuning(caseId, waveIndex, kind, count)` to `tuning.ts` following the `applyDefenderTuning` shape).
- Buttons: "Copy defenders.ts", "Copy pathogens.ts" (writes `exportContentModules()` output to the clipboard), "Reset to seeds" (calls `resetTuning`).
- The panel renders into a fixed-position aside with `pointer-events: auto`, never covering the dock. It is a dev tool — Ionic components are unnecessary; plain elements keep it out of the way.

- [ ] **Step 6: Mount it dev-only in `FightPage`**

```tsx
const [TuningPanelComponent, setTuningPanelComponent] = useState<React.ComponentType<{ loop: GameLoop }> | null>(null);

useEffect(() => {
  if (!import.meta.env.DEV) return;
  let cancelled = false;
  void import('@app/dev/TuningPanel').then((module) => {
    if (!cancelled) setTuningPanelComponent(() => module.TuningPanel);
  });
  return () => { cancelled = true; };
}, []);
```

Render `{TuningPanelComponent !== null && loop !== null && <TuningPanelComponent loop={loop} />}` after the footer. In production `import.meta.env.DEV` is the literal `false`, the effect body is unreachable, and Rollup drops the dynamic import and everything behind it.

- [ ] **Step 7: Tune while playing**

Run: `npm run dev`, open `/play/forearm`, start a wave, open the panel.
Expected: raising `staph.speed` visibly speeds up enemies mid-wave; lowering `phago.cost` turns an unaffordable dock price affordable on the next HUD tick; "Copy defenders.ts" produces pasteable source; "Reset to seeds" restores the shipped feel. Then paste an export over `defenders.ts` and confirm `git diff` shows exactly the tuned lines; revert.

- [ ] **Step 8: Prove the panel is absent from production**

```bash
npm run build
grep -ri "TuningPanel\|applyDefenderTuning\|exportContentModules" dist/ && echo "LEAKED" || echo "CLEAN"
```

Expected: `CLEAN`. Also confirm no chunk file named like `TuningPanel-*.js` exists in `dist/assets/`. If it leaked, the `import.meta.env.DEV` guard is not statically analysable — the usual cause is reading it through a variable.

Record this check as a step in CI: add the grep (without the `-i` on a case-sensitive marker string) after `npm run build` in `ci.yml`:

```yaml
      - run: "! grep -r applyDefenderTuning dist/"
```

- [ ] **Step 9: Confirm the golden snapshot is untouched**

Run: `npx vitest run src/game/golden.test.ts`
Expected: PASS. The panel exists; using it in a dev session does not change committed content. Only a pasted export changes content, and that changes the snapshot deliberately — the Phase 8 re-bless flow.

- [ ] **Step 10: Run the full gate and commit**

Run: `npm run verify`

```bash
git add -A
git commit -m "feat(dev): live tuning panel with content-module export, tree-shaken from production"
```

**Verification command:** `npm run verify` plus the Step 7 playtest and Step 8 bundle grep.
**Passing looks like:** numbers move against the live simulation, an export is a reviewable diff, and the production bundle contains no trace of the panel.

---

## Phase 11 — Persistence port and adapters

**Files:**
- Create: `src/progress/ProgressRepository.ts`, `parseProfile.ts` + `parseProfile.test.ts`
- Create: `src/progress/LocalStorageProgressRepository.ts` + `.test.ts`
- Create: `src/progress/PreferencesProgressRepository.ts`, `createProgressRepository.ts`
- Create: `src/app/state/ProfileProvider.tsx`, `src/app/components/SaveErrorBanner.tsx`
- Modify: `src/main.tsx` — wrap `App` in `ProfileProvider`
- Port from: prototype lines 471–489 (load and save), 579–581 (reset)

**Interfaces:**
- Produces:
  - `type LoadResult = { status: 'loaded'; profile: Profile } | { status: 'fresh'; reason: 'empty' | 'corrupt' | 'outdated' }`
  - `interface ProgressRepository { load(): Promise<LoadResult>; save(profile: Profile): Promise<void> }`
  - `parseProfile(raw: unknown): Profile | null`
  - `createProgressRepository(): ProgressRepository`
  - `useProfile(): { profile: Profile; recordClear(caseId, totalKills): void; resetRun(): void; saveError: boolean; dismissSaveError(): void }`

- [ ] **Step 1: Write the failing validator test**

The spec is explicit: a corrupt or outdated save falls back to a fresh profile and reports it; a failed *write* surfaces. `parseProfile` is the "corrupt" half.

`src/progress/parseProfile.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { parseProfile } from './parseProfile';

const valid = {
  cleared: ['forearm'],
  immunity: { staph: 1, film: 0, virus: 2 },
  day: 5, bank: 700, kills: 42,
};

describe('parseProfile', () => {
  it('accepts a well-formed profile', () => {
    expect(parseProfile(valid)).toEqual(valid);
  });

  it('rejects a non-object', () => {
    for (const raw of [null, undefined, 3, 'x', []]) expect(parseProfile(raw)).toBeNull();
  });

  it('rejects a missing field', () => {
    const { day: _day, ...rest } = valid;
    expect(parseProfile(rest)).toBeNull();
  });

  it('rejects a field of the wrong type', () => {
    expect(parseProfile({ ...valid, bank: '700' })).toBeNull();
    expect(parseProfile({ ...valid, cleared: 'forearm' })).toBeNull();
  });

  it('rejects a cleared entry that is not a known case', () => {
    expect(parseProfile({ ...valid, cleared: ['elbow'] })).toBeNull();
  });

  it('rejects an immunity value outside 0 to 3', () => {
    expect(parseProfile({ ...valid, immunity: { staph: 4, film: 0, virus: 0 } })).toBeNull();
    expect(parseProfile({ ...valid, immunity: { staph: -1, film: 0, virus: 0 } })).toBeNull();
  });

  it('rejects a missing strain', () => {
    expect(parseProfile({ ...valid, immunity: { staph: 1, virus: 0 } })).toBeNull();
  });

  it('rejects a non-integer counter', () => {
    expect(parseProfile({ ...valid, kills: 1.5 })).toBeNull();
  });

  it('drops unknown extra keys rather than carrying them forward', () => {
    const parsed = parseProfile({ ...valid, sneaky: true });
    expect(parsed).not.toBeNull();
    expect(Object.keys(parsed!)).toEqual(['cleared', 'immunity', 'day', 'bank', 'kills']);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write `src/progress/parseProfile.ts`**

Hand-written rather than a schema library: one shape, thirty lines, no dependency. Abstract on the third real case, not the first.

```ts
import { IMMUNITY_MAX } from '@game/content/rules';
import { isCaseId } from '@game/content/cases';
import type { Profile } from '@game/progression';
import type { CaseId, StrainKey } from '@game/types';

const STRAINS: readonly StrainKey[] = ['staph', 'film', 'virus'];

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

export function parseProfile(raw: unknown): Profile | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;

  if (!Array.isArray(record['cleared'])) return null;
  const cleared: CaseId[] = [];
  for (const entry of record['cleared']) {
    if (typeof entry !== 'string' || !isCaseId(entry)) return null;
    cleared.push(entry);
  }

  const rawImmunity = record['immunity'];
  if (typeof rawImmunity !== 'object' || rawImmunity === null) return null;
  const immunityRecord = rawImmunity as Record<string, unknown>;
  const immunity = {} as Record<StrainKey, number>;
  for (const strain of STRAINS) {
    const value = immunityRecord[strain];
    if (!isCount(value) || value > IMMUNITY_MAX) return null;
    immunity[strain] = value;
  }

  const { day, bank, kills } = record;
  if (!isCount(day) || !isCount(bank) || !isCount(kills)) return null;

  return { cleared, immunity, day, bank, kills };
}
```

Run: `npx vitest run src/progress/parseProfile.test.ts` — Expected: PASS, 9 tests.

- [ ] **Step 3: Write `src/progress/ProgressRepository.ts`**

```ts
import type { Profile } from '@game/progression';

export const STORAGE_KEY = 'bodydefense.progress';
export const STORAGE_VERSION = 1;

export interface StoredEnvelope {
  readonly version: number;
  readonly profile: unknown;
}

export type LoadResult =
  | { readonly status: 'loaded'; readonly profile: Profile }
  | { readonly status: 'fresh'; readonly reason: 'empty' | 'corrupt' | 'outdated' };

export interface ProgressRepository {
  load(): Promise<LoadResult>;
  /** Rejects when the write fails. Losing a cleared case silently is the one failure players resent. */
  save(profile: Profile): Promise<void>;
}

export function encode(profile: Profile): string {
  return JSON.stringify({ version: STORAGE_VERSION, profile } satisfies StoredEnvelope);
}
```

- [ ] **Step 4: Write the failing localStorage adapter test**

`src/progress/LocalStorageProgressRepository.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LocalStorageProgressRepository } from './LocalStorageProgressRepository';
import { STORAGE_KEY, encode } from './ProgressRepository';
import { createFreshProfile } from '@game/progression';

describe('LocalStorageProgressRepository', () => {
  beforeEach(() => { localStorage.clear(); });

  it('reports a fresh profile when nothing is stored', async () => {
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'empty' });
  });

  it('round-trips a saved profile', async () => {
    const repository = new LocalStorageProgressRepository();
    const profile = { ...createFreshProfile(), day: 6, bank: 900 };

    await repository.save(profile);
    const result = await repository.load();
    expect(result).toEqual({ status: 'loaded', profile });
  });

  it('falls back to fresh and reports corruption on unparseable JSON', async () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports corruption on a valid-JSON invalid profile', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, profile: { day: 'soon' } }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'corrupt' });
  });

  it('falls back to fresh and reports an outdated version', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 99, profile: createFreshProfile() }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result).toEqual({ status: 'fresh', reason: 'outdated' });
  });

  it('treats the prototype’s unversioned save as outdated rather than crashing', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ cleared: [], immunity: {}, day: 4, bank: 520 }));
    const result = await new LocalStorageProgressRepository().load();
    expect(result.status).toBe('fresh');
  });

  it('surfaces a failed write rather than swallowing it', async () => {
    const repository = new LocalStorageProgressRepository();
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('QuotaExceededError');
    });

    await expect(repository.save(createFreshProfile())).rejects.toThrow(/could not be saved/i);
    vi.restoreAllMocks();
  });

  it('never leaves a half-written record after a failed write', async () => {
    const repository = new LocalStorageProgressRepository();
    await repository.save(createFreshProfile());
    const before = localStorage.getItem(STORAGE_KEY);

    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('nope'); });
    await expect(repository.save({ ...createFreshProfile(), day: 9 })).rejects.toThrow();
    vi.restoreAllMocks();

    expect(localStorage.getItem(STORAGE_KEY)).toBe(before);
    expect(before).toBe(encode(createFreshProfile()));
  });
});
```

- [ ] **Step 5: Run to verify failure, then write the adapter**

```ts
import type { Profile } from '@game/progression';
import { parseProfile } from './parseProfile';
import {
  STORAGE_KEY, STORAGE_VERSION, encode, type LoadResult, type ProgressRepository,
} from './ProgressRepository';

export class LocalStorageProgressRepository implements ProgressRepository {
  load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }
    if (raw === null) return Promise.resolve({ status: 'fresh', reason: 'empty' });

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }

    if (typeof envelope !== 'object' || envelope === null) {
      return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    }
    const version = (envelope as { version?: unknown }).version;
    if (version !== STORAGE_VERSION) return Promise.resolve({ status: 'fresh', reason: 'outdated' });

    const profile = parseProfile((envelope as { profile?: unknown }).profile);
    if (profile === null) return Promise.resolve({ status: 'fresh', reason: 'corrupt' });
    return Promise.resolve({ status: 'loaded', profile });
  }

  save(profile: Profile): Promise<void> {
    try {
      localStorage.setItem(STORAGE_KEY, encode(profile));
      return Promise.resolve();
    } catch (cause) {
      return Promise.reject(new Error('Progress could not be saved on this device', { cause }));
    }
  }
}
```

A read failure is deliberately quiet — the player gets a fresh profile and the app keeps working. A write failure is loud, because it is the one the player will notice and resent.

Run: `npx vitest run src/progress/LocalStorageProgressRepository.test.ts` — Expected: PASS, 8 tests.

- [ ] **Step 6: Write the Capacitor adapter and the selector**

```ts
// src/progress/PreferencesProgressRepository.ts
import { Preferences } from '@capacitor/preferences';
import type { Profile } from '@game/progression';
import { parseProfile } from './parseProfile';
import {
  STORAGE_KEY, STORAGE_VERSION, encode, type LoadResult, type ProgressRepository,
} from './ProgressRepository';

export class PreferencesProgressRepository implements ProgressRepository {
  async load(): Promise<LoadResult> {
    let raw: string | null;
    try {
      ({ value: raw } = await Preferences.get({ key: STORAGE_KEY }));
    } catch {
      return { status: 'fresh', reason: 'corrupt' };
    }
    if (raw === null) return { status: 'fresh', reason: 'empty' };

    let envelope: unknown;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return { status: 'fresh', reason: 'corrupt' };
    }

    if (typeof envelope !== 'object' || envelope === null) return { status: 'fresh', reason: 'corrupt' };
    if ((envelope as { version?: unknown }).version !== STORAGE_VERSION) {
      return { status: 'fresh', reason: 'outdated' };
    }

    const profile = parseProfile((envelope as { profile?: unknown }).profile);
    return profile === null ? { status: 'fresh', reason: 'corrupt' } : { status: 'loaded', profile };
  }

  async save(profile: Profile): Promise<void> {
    try {
      await Preferences.set({ key: STORAGE_KEY, value: encode(profile) });
    } catch (cause) {
      throw new Error('Progress could not be saved on this device', { cause });
    }
  }
}
```

```ts
// src/progress/createProgressRepository.ts
import { Capacitor } from '@capacitor/core';
import { LocalStorageProgressRepository } from './LocalStorageProgressRepository';
import { PreferencesProgressRepository } from './PreferencesProgressRepository';
import type { ProgressRepository } from './ProgressRepository';

export function createProgressRepository(): ProgressRepository {
  return Capacitor.isNativePlatform()
    ? new PreferencesProgressRepository()
    : new LocalStorageProgressRepository();
}
```

The two adapters share their envelope handling by duplication rather than by a base class. Two implementations is not the third real case; if a third storage backend ever appears, extract then.

- [ ] **Step 7: Write `src/app/state/ProfileProvider.tsx`**

```tsx
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { clearCase, createFreshProfile, type Profile } from '@game/progression';
import { createProgressRepository } from '@progress/createProgressRepository';
import type { CaseId } from '@game/types';

interface ProfileContextValue {
  readonly profile: Profile;
  readonly loading: boolean;
  readonly saveError: boolean;
  recordClear(caseId: CaseId, totalKills: number): void;
  resetRun(): void;
  dismissSaveError(): void;
}

const ProfileContext = createContext<ProfileContextValue | null>(null);

export function ProfileProvider({ children }: { readonly children: ReactNode }) {
  const repository = useMemo(() => createProgressRepository(), []);
  const [profile, setProfile] = useState<Profile>(createFreshProfile);
  const [loading, setLoading] = useState(true);
  const [saveError, setSaveError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void repository.load().then((result) => {
      if (cancelled) return;
      if (result.status === 'loaded') setProfile(result.profile);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [repository]);

  const persist = useCallback((next: Profile) => {
    setProfile(next);
    repository.save(next).then(
      () => { setSaveError(false); },
      () => { setSaveError(true); },
    );
  }, [repository]);

  const value = useMemo<ProfileContextValue>(() => ({
    profile,
    loading,
    saveError,
    recordClear: (caseId, totalKills) => { persist(clearCase(profile, caseId, totalKills)); },
    resetRun: () => { persist(createFreshProfile()); },
    dismissSaveError: () => { setSaveError(false); },
  }), [profile, loading, saveError, persist]);

  return <ProfileContext.Provider value={value}>{children}</ProfileContext.Provider>;
}

export function useProfile(): ProfileContextValue {
  const value = useContext(ProfileContext);
  if (value === null) throw new Error('useProfile must be used inside a ProfileProvider');
  return value;
}
```

An empty store yields `createFreshProfile()` — day 1, bank 240, no immunity. First run and "Start a new body" are the same factory, so there is no second constant to drift (decision D7).

- [ ] **Step 8: Write `SaveErrorBanner` and mount it**

```tsx
// src/app/components/SaveErrorBanner.tsx
import { useProfile } from '@app/state/ProfileProvider';

export function SaveErrorBanner() {
  const { saveError, dismissSaveError } = useProfile();
  if (!saveError) return null;
  return (
    <div className="save-error" role="status">
      <span>Progress could not be saved on this device. The run continues.</span>
      <button type="button" onClick={dismissSaveError}>Dismiss</button>
    </div>
  );
}
```

Render it inside `IonApp` above the router outlet, and wrap `<App />` in `<ProfileProvider>` in `src/main.tsx`.

- [ ] **Step 9: Verify persistence in the browser**

Run: `npm run dev`.
1. Clear a case, return to the map, reload. Expected: the day counter and the bank persist; the map shows the region held.
2. In DevTools, set `bodydefense.progress` to `{"nope"`. Reload. Expected: a fresh day-1 profile, no crash, no error banner (a corrupt read is quiet by design).
3. In DevTools console, run `Storage.prototype.setItem = () => { throw new Error('x'); }`, then clear a case. Expected: the banner appears with the exact copy above.

- [ ] **Step 10: Run the full gate and commit**

Run: `npm run verify`

```bash
git add -A
git commit -m "feat(progress): versioned repository port with localStorage and Preferences adapters"
```

**Verification command:** `npm run verify` plus the three manual checks in Step 9.
**Passing looks like:** progress survives a reload; a corrupt save yields a fresh profile rather than a crash; a failed write surfaces to the player.

---

## Phase 12 — Map, Brief, Immunity and Season screens

**Why now:** the profile is real and the fight screen is real, so these four screens have live data to render and somewhere to navigate to.

**Files:**
- Create: `src/app/components/BodyMap.tsx` + `BodyMap.test.tsx`
- Rewrite: `src/app/pages/MapPage.tsx`, `BriefPage.tsx`, `ImmunityPage.tsx`, `SeasonPage.tsx`
- Create: `src/app/screens.css`
- Create: `src/app/pages/BriefPage.test.tsx`, `SeasonPage.test.tsx`
- Port from: prototype markup lines 37–79 (map), 81–136 (brief), 207–269 (season), 271–319 (immunity); logic lines 913–955 (mapLayer), 1054–1066 (map and brief values), 1095–1097 (immunity stats)

**Interfaces:**
- Consumes: `useProfile`, `seasonRows`, `vaccineRows`, `strainRows`, `nextCaseId`, `CASES`, `BODY_NODES`, `BODY_LINKS`, `DEFENDER_BLURBS`.
- Produces: `BodyMap` component.

- [ ] **Step 1: Write the failing body-map test**

The map is static inline SVG (decision D15), so it is testable with Testing Library rather than needing a canvas harness.

`src/app/components/BodyMap.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BodyMap } from './BodyMap';

const base = { cleared: [] as const, activeNode: 'forearm' as const, onSelectCase: () => undefined };

describe('BodyMap', () => {
  it('draws fifteen nodes and fourteen links', () => {
    const { container } = render(<BodyMap {...base} />);
    expect(container.querySelectorAll('circle[data-state]')).toHaveLength(15);
    expect(container.querySelectorAll('line')).toHaveLength(14);
  });

  it('marks the region under attack', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'hot');
  });

  it('marks a cleared region as held', () => {
    render(<BodyMap {...base} cleared={['forearm']} activeNode="throat" />);
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'held');
  });

  it('always marks the heart as the core', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-heart')).toHaveAttribute('data-state', 'core');
  });

  it('marks everything else as not reached', () => {
    render(<BodyMap {...base} />);
    expect(screen.getByTestId('map-node-footR')).toHaveAttribute('data-state', 'cold');
  });

  it('opens the brief when the region under attack is tapped', async () => {
    const onSelectCase = vi.fn();
    render(<BodyMap {...base} onSelectCase={onSelectCase} />);
    await userEvent.click(screen.getByTestId('map-node-forearm'));
    expect(onSelectCase).toHaveBeenCalledOnce();
  });

  it('ignores a tap on a region that is not under attack', async () => {
    const onSelectCase = vi.fn();
    render(<BodyMap {...base} onSelectCase={onSelectCase} />);
    await userEvent.click(screen.getByTestId('map-node-footR'));
    expect(onSelectCase).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify failure, then write `src/app/components/BodyMap.tsx`**

```tsx
import { BODY_LINKS, BODY_MAP_VIEWBOX, BODY_NODES } from '@game/content/body';
import { CASES } from '@game/content/cases';
import { NEUTRALS, palette } from '@theme/tokens';
import type { BodyNodeId, CaseId } from '@game/types';

type NodeState = 'held' | 'hot' | 'core' | 'cold';

interface BodyMapProps {
  readonly cleared: readonly CaseId[];
  readonly activeNode: BodyNodeId | null;
  readonly onSelectCase: () => void;
}

const STATE_TOKEN: Record<NodeState, string> = {
  held: palette.frontline.css,
  hot: palette.threat.css,
  core: palette.core.css,
  cold: palette.notReached.css,
};

export function BodyMap({ cleared, activeNode, onSelectCase }: BodyMapProps) {
  const clearedNodes = new Set(
    CASES.filter((c) => cleared.includes(c.id)).map((c) => c.node),
  );

  const stateOf = (id: BodyNodeId): NodeState => {
    if (clearedNodes.has(id)) return 'held';
    if (id === 'heart') return 'core';
    if (id === activeNode) return 'hot';
    return 'cold';
  };

  return (
    <svg
      className="body-map"
      viewBox={`0 0 ${String(BODY_MAP_VIEWBOX.width)} ${String(BODY_MAP_VIEWBOX.height)}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label="The body"
    >
      {BODY_LINKS.map(([from, to]) => {
        const a = BODY_NODES.find((n) => n.id === from);
        const b = BODY_NODES.find((n) => n.id === to);
        if (a === undefined || b === undefined) return null;
        const hot = stateOf(from) === 'hot' || stateOf(to) === 'hot';
        const held = stateOf(from) === 'held' || stateOf(to) === 'held';
        return (
          <line
            key={`${from}-${to}`}
            x1={a.x} y1={a.y} x2={b.x} y2={b.y}
            stroke={hot ? STATE_TOKEN.hot : held ? STATE_TOKEN.held : 'oklch(0.87 0.02 60)'}
            strokeWidth={6}
            strokeLinecap="round"
          />
        );
      })}

      {BODY_NODES.map((node) => {
        const state = stateOf(node.id);
        const interactive = state === 'hot';
        return (
          <g key={node.id}>
            {state === 'hot' && (
              <circle cx={node.x} cy={node.y} r={node.r + 20} fill={STATE_TOKEN.hot} opacity={0.14} />
            )}
            <circle
              data-testid={`map-node-${node.id}`}
              data-state={state}
              cx={node.x} cy={node.y} r={node.r}
              fill={STATE_TOKEN[state]}
              stroke={NEUTRALS.screenPaper}
              strokeWidth={state === 'core' ? 5 : 4}
              style={{ cursor: interactive ? 'pointer' : 'default' }}
              onClick={interactive ? onSelectCase : undefined}
            />
            {state !== 'cold' && (
              <circle
                cx={node.x} cy={node.y} r={Math.max(6, node.r * 0.33)}
                fill={NEUTRALS.screenPaper} pointerEvents="none"
              />
            )}
            {node.label !== undefined && (
              <text
                className="mono map-label"
                x={node.x + node.r + 10} y={node.y + 4}
                fill={state === 'cold' ? 'oklch(0.55 0.01 60)' : 'oklch(0.3 0.02 60)'}
              >
                {node.label}
              </text>
            )}
          </g>
        );
      })}
    </svg>
  );
}
```

Each node circle carries `data-testid="map-node-<id>"` for targeted queries and `data-state` for the count query. Links carry neither — the count assertion selects them by element.

Run: `npx vitest run src/app/components/BodyMap.test.tsx` — Expected: PASS, 7 tests.

- [ ] **Step 3: Write `src/app/pages/MapPage.tsx`**

Copy from prototype lines 40–77 and 1054–1061.

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { BODY_NODES } from '@game/content/body';
import { CASE_BY_ID } from '@game/content/cases';
import { nextCaseId } from '@game/progression';
import { palette } from '@theme/tokens';
import { BodyMap } from '@app/components/BodyMap';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function MapPage() {
  const history = useHistory();
  const { profile } = useProfile();
  const nextId = nextCaseId(profile);
  const next = nextId === null ? null : CASE_BY_ID[nextId];

  const region = next === null ? '' : next.region.split(' · ')[0]?.toLowerCase() ?? '';
  const accent = next === null ? palette.frontline.css : palette.threat.css;

  return (
    <IonPage>
      <IonContent fullscreen scrollY={false}>
        <div className="screen">
          <header className="screen-header">
            <div className="screen-title">
              <span className="mono kicker">{`DAY ${String(profile.day)} · MORNING`}</span>
              <span className="screen-heading-sm">The body</span>
            </div>
            <div className="energy-pill">
              <span className="energy-dot" />
              <span className="mono" data-testid="bank">{String(profile.bank)}</span>
            </div>
          </header>

          <div className="map-field">
            <BodyMap
              cleared={profile.cleared}
              activeNode={next?.node ?? null}
              onSelectCase={() => { if (nextId !== null) history.push(`/brief/${nextId}`); }}
            />
            <div className="map-legend">
              <span><i style={{ background: palette.threat.css }} />UNDER ATTACK</span>
              <span><i style={{ background: palette.frontline.css }} />HELD</span>
              <span><i style={{ background: palette.notReached.css }} />NOT REACHED</span>
            </div>
            <div className="map-held">
              <span className="mono kicker">REGIONS HELD</span>
              <span className="mono map-held-count">
                {`${String(profile.cleared.length)} / ${String(BODY_NODES.filter((n) => n.core !== true).length)}`}
              </span>
            </div>
          </div>

          <footer className="screen-footer">
            <div className="pick">
              <span className="pick-swatch" style={{ background: accent }} />
              <div className="pick-text">
                <span className="pick-name">{next?.title ?? 'All clear'}</span>
                <span className="pick-sub">
                  {next === null
                    ? 'Nothing needs you today'
                    : `${region.charAt(0).toUpperCase()}${region.slice(1)} · ${next.ruleLabel.toLowerCase()} · ${String(next.waves.length)} waves`}
                </span>
              </div>
            </div>
            <div className="footer-actions">
              <button
                type="button" className="primary" data-testid="go-there"
                style={{ background: accent }}
                onClick={() => { if (nextId !== null) history.push(`/brief/${nextId}`); }}
              >
                {next === null ? 'Sleep' : 'Go there'}
              </button>
              <button type="button" className="tertiary" onClick={() => { history.push('/season'); }}>
                Season
              </button>
            </div>
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
```

- [ ] **Step 4: Write the failing brief test**

`src/app/pages/BriefPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route } from 'react-router-dom';
import { BriefPage } from './BriefPage';
import { ProfileProvider } from '@app/state/ProfileProvider';
import { CASE_BY_ID } from '@game/content/cases';
import { DEFENDER_ORDER } from '@game/content/defenders';
import { IMMUNITY_MAX } from '@game/content/rules';

function renderBrief(path: string) {
  return render(
    <ProfileProvider>
      <MemoryRouter initialEntries={[path]}>
        <Route path="/brief/:caseId" component={BriefPage} />
      </MemoryRouter>
    </ProfileProvider>,
  );
}

describe('BriefPage', () => {
  it('states the region, the title and the story', async () => {
    renderBrief('/brief/forearm');
    expect(await screen.findByText('FOREARM · CASE 04')).toBeInTheDocument();
    expect(screen.getByText('Deep cut')).toBeInTheDocument();
    expect(screen.getByText(/Kitchen knife, two hours ago/)).toBeInTheDocument();
  });

  it('states the case rule', async () => {
    renderBrief('/brief/forearm');
    expect(await screen.findByText('Bleeding')).toBeInTheDocument();
    expect(screen.getByText('You lose energy every second until a clot is placed')).toBeInTheDocument();
  });

  it('lists every pathogen in the case with its whole-case total', async () => {
    renderBrief('/brief/forearm');
    const rows = await screen.findAllByTestId('brief-enemy');
    const entries = CASE_BY_ID.forearm.waves.flat();
    const kinds = new Set(entries.map((e) => e.kind));
    const staphTotal = entries.filter((e) => e.kind === 'staph').reduce((sum, e) => sum + e.count, 0);

    expect(rows).toHaveLength(kinds.size);
    expect(rows[0]).toHaveTextContent('Staph');
    expect(rows[0]).toHaveTextContent(`×${String(staphTotal)}`);
  });

  it('lists every way to stop them', async () => {
    renderBrief('/brief/forearm');
    expect(await screen.findAllByTestId('brief-verb')).toHaveLength(DEFENDER_ORDER.length);
  });

  it('reports progress toward the strain this case credits when the vaccine is not held', async () => {
    renderBrief('/brief/forearm');
    expect(await screen.findByTestId('brief-shield')).toHaveTextContent(
      `No vaccine for this strain yet — 0 of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`,
    );
  });

  it('uses no exclamation marks and no emoji', async () => {
    const { container } = renderBrief('/brief/forearm');
    await screen.findByText('Deep cut');
    const text = container.textContent ?? '';
    expect(text).not.toMatch(/!/);
    expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
  });
});
```

The totals sum each kind across the whole case rather than the current wave, as the prototype does at lines 970–974 — and the test derives them from the wave tables so tuning a count never breaks it.

- [ ] **Step 5: Run to verify failure, then write `src/app/pages/BriefPage.tsx`**

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { Redirect, useHistory, useParams } from 'react-router-dom';
import { CASE_BY_ID, isCaseId } from '@game/content/cases';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from '@game/content/defenders';
import { PATHOGENS } from '@game/content/pathogens';
import { IMMUNITY_MAX } from '@game/content/rules';
import { STRAIN_ROWS } from '@game/content/vaccines';
import { palette } from '@theme/tokens';
import { useProfile } from '@app/state/ProfileProvider';
import type { PathogenKind } from '@game/types';
import '../screens.css';

export function BriefPage() {
  const { caseId } = useParams<{ caseId: string }>();
  const history = useHistory();
  const { profile } = useProfile();

  if (!isCaseId(caseId)) return <Redirect to="/" />;
  const definition = CASE_BY_ID[caseId];

  const totals = new Map<PathogenKind, number>();
  for (const wave of definition.waves) {
    for (const entry of wave) totals.set(entry.kind, (totals.get(entry.kind) ?? 0) + entry.count);
  }

  // The shield line reflects whichever strain this case credits (decision D23).
  const clears = profile.immunity[definition.credits];
  const strainRow = STRAIN_ROWS.find((row) => row.key === definition.credits);
  const shield = clears >= IMMUNITY_MAX && strainRow !== undefined
    ? strainRow.heldCopy
    : `No vaccine for this strain yet — ${String(clears)} of ${String(IMMUNITY_MAX)} clears done. Earned, never bought.`;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="screen rise">
          <div className="screen-body">
            <div className="screen-title">
              <span className="mono kicker">{definition.region}</span>
              <h2 className="screen-heading">{definition.title}</h2>
              <p className="screen-lede">{definition.story}</p>
            </div>

            <div className="rule-card">
              <span className="rule-swatch" />
              <div>
                <span className="rule-name">{definition.ruleLabel}</span>
                <span className="rule-sub">{definition.ruleSub}</span>
              </div>
            </div>

            <section>
              <span className="mono kicker">COMING THROUGH</span>
              {[...totals].map(([kind, count]) => (
                <div key={kind} className="row" data-testid="brief-enemy">
                  <span
                    className="row-swatch"
                    data-shape={PATHOGENS[kind].shape}
                    style={{ background: palette[PATHOGENS[kind].token].css }}
                  />
                  <span className="row-name">{PATHOGENS[kind].name}</span>
                  <span className="row-note">{PATHOGENS[kind].note}</span>
                  <span className="mono">{`×${String(count)}`}</span>
                </div>
              ))}
            </section>

            <section>
              <span className="mono kicker">WAYS TO STOP THEM</span>
              {DEFENDER_ORDER.map((kind) => (
                <div key={kind} className="row row-stacked" data-testid="brief-verb">
                  <span className="row-swatch" style={{ background: palette[DEFENDERS[kind].token].css }} />
                  <div>
                    <span className="row-name">{DEFENDER_BLURBS[kind].name}</span>
                    <span className="row-note">{DEFENDER_BLURBS[kind].text}</span>
                  </div>
                </div>
              ))}
            </section>

            <div className="shield-card" data-testid="brief-shield">{shield}</div>
          </div>

          <footer className="screen-footer">
            <button
              type="button" className="primary" data-testid="get-in-there"
              onClick={() => { history.push(`/play/${caseId}`); }}
            >
              Get in there
            </button>
            <button type="button" className="secondary" onClick={() => { history.push('/'); }}>
              Back to the body
            </button>
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
```

Run: `npx vitest run src/app/pages/BriefPage.test.tsx` — Expected: PASS, 6 tests.

- [ ] **Step 6: Write `src/app/pages/ImmunityPage.tsx`**

Copy from prototype lines 275–317 and 1095–1097.

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { strainRows } from '@game/progression';
import { palette } from '@theme/tokens';
import { useProfile } from '@app/state/ProfileProvider';
import '../screens.css';

export function ImmunityPage() {
  const history = useHistory();
  const { profile, resetRun } = useProfile();
  const rows = strainRows(profile);
  const held = rows.filter((row) => row.held).length;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="screen rise">
          <div className="screen-body">
            <div className="screen-title">
              <span className="mono kicker">
                {`KEPT FOREVER · ${String(held)} of ${String(rows.length)}`}
              </span>
              <h2 className="screen-heading">Immunity</h2>
              <p className="screen-lede">
                Clear a strain three times and it&apos;s blocked in every run after this one.
              </p>
            </div>

            {rows.map((row) => (
              <div
                key={row.key}
                className="strain-card"
                data-testid={`strain-${row.key}`}
                data-held={String(row.held)}
                style={{ borderColor: row.held ? palette.support.css : 'transparent' }}
              >
                <span className="strain-swatch" />
                <div>
                  <span className="row-name">{row.name}</span>
                  <span className="row-note">{row.effect}</span>
                </div>
                <span className="mono">{row.progress}</span>
              </div>
            ))}

            <div className="stats-card">
              <span className="mono kicker">RUN SO FAR</span>
              <div className="stats">
                <div><span className="mono">{String(profile.day)}</span><span>Days</span></div>
                <div><span className="mono">{String(profile.kills)}</span><span>Cleared</span></div>
                <div><span className="mono">{String(profile.cleared.length)}</span><span>Regions</span></div>
              </div>
            </div>
          </div>

          <footer className="screen-footer">
            <button type="button" className="ink" onClick={() => { history.push('/season'); }}>
              Season &amp; vaccines
            </button>
            <button type="button" className="secondary" data-testid="reset-run"
              onClick={() => { resetRun(); history.push('/'); }}>
              Start a new body
            </button>
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
```

- [ ] **Step 7: Write the failing season test and `SeasonPage`**

`src/app/pages/SeasonPage.test.tsx`:

```tsx
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { SeasonPage } from './SeasonPage';
import { ProfileProvider } from '@app/state/ProfileProvider';

function renderSeason() {
  return render(
    <ProfileProvider>
      <MemoryRouter><SeasonPage /></MemoryRouter>
    </ProfileProvider>,
  );
}

describe('SeasonPage', () => {
  it('lists three cases and the two later entries', async () => {
    renderSeason();
    expect(await screen.findAllByTestId('season-row')).toHaveLength(5);
  });

  it('labels each tier by what the naming policy means, not by a number', async () => {
    renderSeason();
    const labels = (await screen.findAllByTestId('season-tier')).map((el) => el.textContent);
    expect(labels).toEqual(['EVERYDAY', 'EVERYDAY', 'EVERYDAY', 'REAL MECHANIC', 'INVENTED STRAIN']);
  });

  it('lists all six vaccines with their status', async () => {
    renderSeason();
    expect(await screen.findAllByTestId('vaccine-row')).toHaveLength(6);
  });

  it('says vaccines are earned, never bought', async () => {
    renderSeason();
    expect(await screen.findByText('EARNED, NEVER BOUGHT')).toBeInTheDocument();
  });

  it('explains the naming policy verbatim', async () => {
    renderSeason();
    expect(await screen.findByText(/measles really does erase immunity you already had/))
      .toBeInTheDocument();
  });
});
```

```tsx
import { IonContent, IonPage } from '@ionic/react';
import { useHistory } from 'react-router-dom';
import { seasonRows, vaccineRows } from '@game/progression';
import { useProfile } from '@app/state/ProfileProvider';
import type { Tier } from '@game/types';
import '../screens.css';

const TIER_LABEL: Record<Tier, string> = {
  1: 'EVERYDAY',
  2: 'REAL MECHANIC',
  3: 'INVENTED STRAIN',
};

export function SeasonPage() {
  const history = useHistory();
  const { profile } = useProfile();
  const season = seasonRows(profile);
  const vaccines = vaccineRows(profile);
  const first = season[0]?.day ?? profile.day;
  const last = season[season.length - 1]?.day ?? profile.day;

  return (
    <IonPage>
      <IonContent fullscreen>
        <div className="screen rise">
          <div className="screen-body">
            <div className="screen-title">
              <span className="mono kicker">
                {`SEASON · DAYS ${String(first)}—${String(last)}`}
              </span>
              <h2 className="screen-heading">What&apos;s coming</h2>
            </div>

            {season.map((row) => (
              <div
                key={`${row.name}-${String(row.day)}`}
                className="season-row" data-testid="season-row" data-state={row.state}
              >
                <span className="season-dot" />
                <div className="season-text">
                  <span className="row-name">{row.name}</span>
                  <span className="row-note">{row.region}</span>
                  {row.note !== '' && <span className="row-note">{row.note}</span>}
                </div>
                <div className="season-meta">
                  <span className="mono">{`DAY ${String(row.day)}`}</span>
                  <span className="mono tier" data-testid="season-tier" data-tier={String(row.tier)}>
                    {TIER_LABEL[row.tier]}
                  </span>
                </div>
              </div>
            ))}

            <div className="section-head">
              <span className="mono kicker">VACCINATION SCHEDULE</span>
              <span className="mono kicker">EARNED, NEVER BOUGHT</span>
            </div>

            {vaccines.map((vaccine) => (
              <div key={vaccine.name} className="row" data-testid="vaccine-row" data-status={vaccine.status}>
                <span className="row-swatch" />
                <div>
                  <span className="row-name">{vaccine.name}</span>
                  <span className="row-note">{vaccine.effect}</span>
                  {vaccine.cost !== '' && <span className="mono row-cost">{vaccine.cost}</span>}
                </div>
                <span className="mono">{vaccine.label}</span>
              </div>
            ))}

            <div className="policy-card">
              <span className="mono kicker">HOW NAMING WORKS</span>
              <span>
                Everyday illnesses use their real names. A disease is only named when the mechanic is
                its real mechanic — measles really does erase immunity you already had. Everything
                dramatic beyond that is an invented strain.
              </span>
            </div>
          </div>

          <footer className="screen-footer">
            <button type="button" className="tertiary" onClick={() => { history.push('/immunity'); }}>
              What I&apos;m immune to
            </button>
            <button type="button" className="ink" onClick={() => { history.push('/'); }}>
              Back to the body
            </button>
          </footer>
        </div>
      </IonContent>
    </IonPage>
  );
}
```

Run: `npx vitest run src/app/pages/SeasonPage.test.tsx` — Expected: PASS, 5 tests.

- [ ] **Step 8: Write `src/app/screens.css`**

Shared chrome for the four non-fight screens: `.screen`, `.screen-header`, `.screen-body` (scrollable), `.screen-footer` (fixed, safe-area padded), `.kicker` (11 px, 0.13 em tracking, `--label`), `.screen-heading` (31 px / 800 / −0.028 em), `.screen-lede` (14 px / 1.45 / `--muted`), `.row` (14 px radius, `--surface`, 9 px 13 px padding, 11 px gap), `.primary`/`.secondary`/`.tertiary`/`.ink` buttons at 54/40/52/54 px. Radii come from the `--radius-*` ladder; no new hard-coded values. Reuse `.energy-pill`, `.mono` and the button rules already defined in `fight.css` by moving those four shared rules from `fight.css` into `screens.css` and importing `screens.css` from `fight.css`.

Constraint to honour: only two backgrounds ever appear on one screen (asset sheet line 89). `--screen-paper` for the page, `--surface` for cards; `--tissue-field` only inside the board and the map field.

- [ ] **Step 9: Add a route guard for an unreachable case**

In `BriefPage` and `FightPage`, redirect to `/` when `caseId` is not a known case. Additionally, in `MapPage`'s handler, only ever navigate to `nextCaseId(profile)`. A user who types `/play/stomach` on a fresh profile reaches a playable but out-of-order case; that is acceptable and matches the prototype's lack of a lock, and it keeps deep links working for testing.

- [ ] **Step 10: Walk the whole app**

Run: `npm run dev`.
Expected: `/` shows `DAY 1 · MORNING` and a bank of 240, the forearm pulsing red and the heart amber; `Go there` opens the brief; `Get in there` opens the fight; clearing the case returns to the map with the forearm now cyan and day 2 showing; `Season` lists five entries and six vaccines; `What I'm immune to` shows Tetanus at 1/3 after the clear; `Start a new body` returns everything to the same day-1 / 240 fresh state.

Check every screen for exclamation marks and emoji. There must be none.

- [ ] **Step 11: Run the full gate and commit**

Run: `npm run verify`

```bash
git add -A
git commit -m "feat(app): body map, brief, immunity and season screens"
```

**Verification command:** `npm run verify` plus the walkthrough in Step 10.
**Passing looks like:** all five screens render live profile data and match the prototype's layout and copy; the full loop map → brief → fight → map works.

---

## Phase 13 — Capacitor iOS target and safe areas

**Honest limits:** `npx cap add ios` requires macOS and Xcode. Nothing in this phase verifies an Xcode build, a real device, or WKWebView performance. What is verified here is that the config is committed, correct, and that the web build behaves under simulated safe-area insets.

**Files:**
- Create: `capacitor.config.ts`
- Create: `README.md`
- Modify: `src/theme/variables.css` — already declares `--safe-top` / `--safe-bottom` from Phase 1; verify
- Modify: `package.json` — `cap:sync` script
- Port from: prototype line 29 (the hardcoded 44 px status bar this replaces)

**Interfaces:**
- Produces: `capacitor.config.ts`, documented Mac build path.

- [ ] **Step 1: Write `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.brendankowitz.bodydefense',
  appName: 'Body Defense',
  webDir: 'dist',
  ios: {
    contentInset: 'never',
    backgroundColor: '#FBF7F0',
  },
};

export default config;
```

`contentInset: 'never'` because the app handles insets itself through `env(safe-area-inset-*)`; letting WKWebView also inset would double the padding.

- [ ] **Step 2: Confirm the viewport meta enables safe areas**

`index.html` already carries `viewport-fit=cover` from Phase 0 Step 10. Without it, `env(safe-area-inset-*)` resolves to `0px` on device and the notch overlaps the header. Verify it is present.

- [ ] **Step 3: Verify the safe-area padding actually moves the layout**

In DevTools, add to `:root` temporarily:

```css
:root { --safe-top: 59px; --safe-bottom: 34px; }
```

Expected: the fight header drops below the simulated notch, the footer clears the home indicator, and the board shrinks rather than being overlapped. Remove the override.

This is the substitute for a device test and it is not equivalent to one. Say so in the README.

- [ ] **Step 4: Add the sync script**

```json
    "cap:sync": "npm run build && npx cap sync ios"
```

- [ ] **Step 5: Write `README.md`**

It must contain, at minimum:

```markdown
# Body Defense

A mobile tower-defense game. Ported from the Claude Design prototype in `design/`.

## Run it

```bash
npm ci
npm run dev
```

## Verify

```bash
npm run verify     # lint, both typechecks, unit tests, production build
npm run test:e2e   # Playwright over the built app
```

`npm run typecheck:game` compiles `src/game/` with no DOM lib and no ambient types. It is the
enforcement behind the rule that the simulation never touches the browser.

`src/game/golden.test.ts` pins a seeded run to a snapshot hash. If it fails, simulation behaviour
changed. Deliberate (tuning, a mechanics change): re-bless with
`npx vitest run src/game/golden.test.ts -u` and review the snapshot diff. Not deliberate: a bug.

## iOS

The Capacitor configuration is committed. Generating the Xcode project requires macOS and Xcode
and **cannot be done on Windows**. On a Mac:

```bash
npm ci
npm run build
npx cap add ios      # once, on a Mac only
npm run cap:sync
npx cap open ios
```

Then, in Xcode, set the deployment target to iOS 15 or later and add to `ios/App/App/Info.plist`:

```xml
<key>UISupportedInterfaceOrientations</key>
<array>
  <string>UIInterfaceOrientationPortrait</string>
</array>
```

### Not verified on Windows

- The Xcode project has never been generated or built.
- Safe-area insets were only simulated in a desktop browser, not measured on a device.
- WKWebView rendering performance at 50+ entities is unmeasured.
- Capacitor `Preferences` persistence has only been exercised through its web fallback.
```

- [ ] **Step 6: Confirm the native project stays out of the repo**

`.gitignore` already carries `/ios/` and `/android/` — verify, and confirm `git status` is clean after a build.

- [ ] **Step 7: Run the full gate and commit**

Run: `npm run verify`

```bash
git add -A
git commit -m "chore(ios): Capacitor configuration, safe-area handling and documented Mac build path"
```

**Verification command:** `npm run verify` plus the simulated-inset check in Step 3.
**Passing looks like:** `capacitor.config.ts` committed, safe-area variables demonstrably drive the layout, and the README states plainly what has not been verified here.

---

## Phase 14 — End-to-end tests and final gates

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/play.spec.ts`
- Modify: `.github/workflows/ci.yml` — enable the two commented steps

**Interfaces:**
- Consumes: the built application.
- Produces: `npm run test:e2e`.

- [ ] **Step 1: Write `playwright.config.ts`**

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env['CI']),
  retries: process.env['CI'] === undefined ? 0 : 1,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:4173',
    trace: 'on-first-retry',
  },
  projects: [{ name: 'iphone', use: { ...devices['iPhone 13'] } }],
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173',
    url: 'http://localhost:4173',
    reuseExistingServer: process.env['CI'] === undefined,
    timeout: 180_000,
  },
});
```

- [ ] **Step 2: Write `tests/e2e/play.spec.ts`**

The board is a canvas, so the spec computes screen coordinates from world coordinates using the same cover formula the renderer uses. No test-only backdoor is added to the application. Content values come straight from the content modules (relative imports — Playwright's transpiler does not read the Vite path aliases), so a tuning pass cannot break the E2E suite either.

```ts
import { expect, test, type Page } from '@playwright/test';
import { CASE_BY_ID } from '../../src/game/content/cases';
import { DEFENDERS } from '../../src/game/content/defenders';
import { BOARD_HEIGHT, BOARD_WIDTH } from '../../src/game/content/rules';

const FOREARM = CASE_BY_ID.forearm;

async function tapSpot(page: Page, index: number): Promise<void> {
  const board = page.locator('.board');
  const box = await board.boundingBox();
  if (box === null) throw new Error('The board has no layout box');

  const scale = Math.max(box.width / BOARD_WIDTH, box.height / BOARD_HEIGHT);
  const offsetX = (box.width - BOARD_WIDTH * scale) / 2;
  const offsetY = (box.height - BOARD_HEIGHT * scale) / 2;
  const [wx, wy] = FOREARM.spots[index]!;

  await page.mouse.click(box.x + wx * scale + offsetX, box.y + wy * scale + offsetY);
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => { window.localStorage.clear(); });
});

test('the map offers the first case and the brief describes it', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('The body')).toBeVisible();
  await expect(page.getByText('Deep cut')).toBeVisible();

  await page.getByTestId('go-there').click();
  await expect(page.getByText('FOREARM · CASE 04')).toBeVisible();
  await expect(page.getByText('Bleeding')).toBeVisible();
});

test('placing a defender charges its cost', async ({ page }) => {
  await page.goto('/play/forearm');
  await expect(page.getByTestId('energy')).toHaveText(String(FOREARM.startingEnergy));

  await page.getByTestId('dock-card-phago').click();
  await tapSpot(page, 0);
  await expect(page.getByTestId('energy'))
    .toHaveText(String(FOREARM.startingEnergy - DEFENDERS.phago.cost));
});

test('an unaffordable defender shows a red price and cannot be placed', async ({ page }) => {
  await page.goto('/play/forearm');
  const afterOne = FOREARM.startingEnergy - DEFENDERS.nk.cost;
  test.skip(afterOne >= DEFENDERS.nk.cost, 'tuning made two killer cells affordable; retarget this test');

  await page.getByTestId('dock-card-nk').click();
  await tapSpot(page, 0);
  await page.getByTestId('dock-card-nk').click();
  await tapSpot(page, 1);

  await expect(page.getByTestId('dock-cost-nk')).toHaveAttribute('data-affordable', 'false');
  await expect(page.getByTestId('energy')).toHaveText(String(afterOne));
});

test('running a wave clears it and offers the next one', async ({ page }) => {
  await page.goto('/play/forearm');
  await page.getByTestId('dock-card-nk').click();
  await tapSpot(page, 0);
  await page.getByTestId('dock-card-phago').click();
  await tapSpot(page, 1);

  await page.getByTestId('start-wave').click();
  await expect(page.getByTestId('result-kicker'))
    .toHaveText(`WAVE 1 OF ${String(FOREARM.waves.length)} HELD`, { timeout: 60_000 });
  await expect(page.getByTestId('result-cta')).toHaveText('Build for wave 2');

  await page.getByTestId('result-cta').click();
  await expect(page.getByTestId('start-wave')).toHaveText('Start wave 2');
});

test('progress survives a reload and a reset returns to fresh', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bodydefense.progress', JSON.stringify({
      version: 1,
      profile: {
        cleared: ['forearm', 'throat'],
        immunity: { staph: 1, film: 0, virus: 1 },
        day: 3, bank: 600, kills: 40,
      },
    }));
  });

  await page.goto('/immunity');
  await expect(page.getByTestId('strain-staph')).toContainText('1/3');

  await page.reload();
  await expect(page.getByTestId('strain-staph')).toContainText('1/3');

  await page.getByTestId('reset-run').click();
  await page.goto('/immunity');
  await expect(page.getByTestId('strain-staph')).toContainText('0/3');

  await page.reload();
  await expect(page.getByTestId('strain-staph')).toContainText('0/3');
});

test('a corrupt save yields a fresh profile rather than a crash', async ({ page }) => {
  await page.addInitScript(() => {
    window.localStorage.setItem('bodydefense.progress', '{not json');
  });
  await page.goto('/');
  await expect(page.getByText('DAY 1 · MORNING')).toBeVisible();
});
```

The 60-second timeout on the wave result is generous on purpose: wave 1 of the forearm case is eight staph at roughly 0.72 s apart plus travel time, which is around 15 s at 1× on a slow CI runner.

- [ ] **Step 3: Run the E2E suite**

Run: `npx playwright install chromium && npm run test:e2e`
Expected: PASS, 6 tests. If `tapSpot` misses, the cover formula in the spec and the one in `viewport.ts` have diverged — they must stay identical, which is why both are written out explicitly rather than shared.

- [ ] **Step 4: Enable E2E in CI**

Uncomment the two Playwright steps in `.github/workflows/ci.yml`.

- [ ] **Step 5: Walk the spec's success criteria one by one**

Confirm each of spec §13's eleven criteria, with the command or observation that shows it:

1. All three cases playable end to end, clearing advances progression — manual walkthrough of `/play/forearm`, `/play/throat`, `/play/stomach`.
2. Identical at 60 Hz and 120 Hz — `npx vitest run src/game/loop.test.ts`.
3. A seeded run reproduces byte-identically — `npx vitest run src/game/golden.test.ts` (determinism test).
4. Every §5 mechanic has a passing unit test, and every §5.1 correction has a test proving the old behaviour is gone — `npx vitest run src/game`; the D2/D3/D6/D7/D9/D22 tests are named in their suites with their decision numbers.
5. Every gameplay number in `content/` can change without any test failing except the re-blessable golden snapshot — rehearsed in Phase 8 Step 8; spot-check again now: change any cost, run `npm run test`, confirm exactly one snapshot failure, revert.
6. Every vaccine the immunity screen displays is reachable through play — `npx vitest run src/game/content/content.invariants.test.ts` (the credits-coverage test) plus a manual clear of the stomach case showing Biofilm progress at 1/3.
7. Progress survives a reload; a corrupt save yields a fresh profile; a failed write surfaces — `npm run test:e2e` plus the Phase 11 manual write-failure check.
8. `src/game/` has no import from `render/`, `app/`, or any browser global — `npm run lint && npm run typecheck:game && npx vitest run tests/lint`.
9. The five screens honour §7's palette, motion and copy rules — manual pass with the design reference open; the no-exclamation/no-emoji tests cover copy mechanically.
10. The tuning panel adjusts a live simulation and exports a valid content module, and is absent from the production bundle — Phase 10 Steps 7–8.
11. iOS configuration committed and the Mac-only step documented — `capacitor.config.ts` and `README.md`.

Record any criterion that does not hold. Do not mark the phase done with an unrecorded gap.

- [ ] **Step 6: Final structural review**

Run `npx vitest run --coverage` and read `src/game/` coverage. Anything below full branch coverage in `systems/` is a mechanic without a test — either write it or record why it is not worth testing.

Then re-read the four files most likely to have drifted from the standards: `step.ts` (single responsibility — it orchestrates and nothing else), `damage.ts` (one function per verb), `FightPage.tsx` (it should hold no game logic, only wiring), and `progression.ts` (pure transitions, no side effects). Remove any comment that explains *what* rather than *why*.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test(e2e): Playwright coverage of placement, waves and persistence"
```

**Verification command:** `npm run verify && npm run test:e2e`
**Passing looks like:** every gate green, all eight spec success criteria confirmed or their gaps recorded.

---

## What cannot be verified in this environment

Stated once, plainly, so it is not discovered late:

- **The Xcode project.** `npx cap add ios` needs macOS. It is never run here. The iOS build is unproven.
- **Real safe-area insets.** Simulated in a desktop browser only.
- **WKWebView performance.** The 60 Hz claim is measured in desktop Chrome, not on an iPhone.
- **Capacitor `Preferences`.** Exercised only through its web fallback; the native bridge is untested.
- **120 Hz on real hardware.** Frame-rate independence is proven by unit test, not by a ProMotion device.
