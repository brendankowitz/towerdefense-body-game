# Body Defense — Design Spec

**Date:** 2026-07-25
**Status:** Approved
**Source of truth:** `design/Body Defense Prototype.dc.html`, `design/Body Defense Assets.dc.html`

---

## 1. What we are building

A mobile tower-defense game in which the player defends regions of a human body
against pathogens. The Claude Design prototype demonstrates the concept end to
end: five screens, six defender types, six pathogen types, three cases, and a
persistent progression layer.

**The prototype is a reference, not a specification.** It showcases sample
gameplay; it is not a shipped game. Its mechanics vocabulary, art direction,
palette and copy rules are the design and are carried forward faithfully. Its
*numbers* are a considered starting point, not frozen truth, and its behavioural
quirks are judged on whether they make a better game rather than preserved for
fidelity.

The goal is a game worth playing, not a faithful port.

### Scope

Depth before breadth. This pass perfects the three existing cases and builds the
machinery that makes further content cheap:

- All five screens: map, brief, fight, immunity, season.
- All six defenders and six pathogens, with mechanics corrected where the
  prototype is wrong (§5.1).
- The three cases (forearm / throat / stomach), tuned to a difficulty curve that
  holds up in play.
- Progression: cleared cases, immunity counters, vaccines, day counter, bank.
- A dev-only tuning panel (§4.1) so balancing is a playtest loop, not an
  edit-rebuild loop.
- Web target fully runnable; iOS target configured (see §10 for the Mac caveat).

### Deferred, not abandoned

The map already draws fifteen body regions and the season screen already
promises Measles and Strain Vesper. Expanding to a full season is the intended
next pass, and the content pipeline is built so that adding a case is authoring
data rather than writing code. It is deliberately not in this pass: balancing
content that will change is wasted work, and the tuning loop should be proven on
three cases first.

### Explicitly out of scope

- Bitmap art. The art is procedural flat vector shapes and stays that way (§7).
- Audio, multiplayer, analytics, accounts, monetisation.
- Answering the asset sheet's four open design questions (§12). They are
  recorded, not resolved.

---

## 2. Stack

| Concern | Choice | Reason |
|---|---|---|
| Shell | Ionic React 8 + React 19 | Requested. Gives native-feeling navigation, safe-area handling, and an iOS-credible component set. |
| Language | TypeScript, strict | Sim correctness depends on exhaustive union handling over defender/pathogen kinds. |
| Build | Vite | Ionic React's supported default; fast HMR matters when tuning a game loop. |
| Renderer | PixiJS v8 | WebGL/WebGPU with canvas fallback. Batches the per-frame draw the prototype does in SVG. |
| Native | Capacitor 7 | First-party Ionic path to iOS. |
| Unit tests | Vitest | Vite-native, no second toolchain. |
| E2E | Playwright | Drives the real web build. |

### Why Pixi, and why not `@pixi/react`

Pixi is driven **imperatively**. The React tree stops at the `<canvas>` element;
Pixi owns everything inside it and owns the frame loop.

`@pixi/react` would let us express the board as JSX, but it reconciles a React
tree every frame. That is the same cost profile as the prototype's
`forceUpdate()`-per-frame over an SVG document — acceptable in a desktop
prototype, the first thing to fail in an iOS WKWebView with fifty entities, six
range circles, and beam effects. The board is not a component tree; it is a
render target.

Phaser was considered and rejected: it brings its own scene, state, input and
asset systems that would duplicate or fight Ionic's, for a game whose simulation
fits comfortably in a few hundred lines of pure TypeScript.

---

## 3. Architecture

Three layers, dependencies pointing one way only:

```
src/game/     pure TypeScript simulation — no DOM, no React, no Pixi
src/render/   Pixi scene graph; reads sim state          → depends on game
src/app/      Ionic React shell, HUD, routing            → depends on game
src/progress/ persistence port + adapters                → depends on game types
```

`src/game/` never imports from `render/` or `app/`. This is the constraint that
makes the ruleset testable without a browser, and it is enforced by lint rule,
not convention.

### The simulation

State is a plain mutable object. The loop is `step(state, dt)`, composed of
systems that each own one mechanic:

| System | Responsibility |
|---|---|
| `spawn` | Wave queue, spawn cadence, tetanus shield bounce |
| `movement` | Path traversal, clot friction, fever slow, engulf hold |
| `hazards` | Toxin stun, poison-case defender damage, wound bleed |
| `targeting` | Per-defender target selection (each defender picks differently) |
| `damage` | Damage application, armour, tag stripping, execute threshold |
| `economy` | Energy rewards, tag bonus, memory-cell XP |
| `deaths` | Removal, virus splitting, phagocyte digest/rest cycle |

Each is a pure function over state. Every mechanic listed in §5 is verifiable in
a unit test with no rendering involved.

### Two corrections to the prototype's loop

Both are defects in the prototype rather than design choices, and both are worth
fixing at the port:

**Frame-rate independence.** The prototype clamps `dt` to `0.06` and steps once
per animation frame. A 120 Hz iPhone therefore simulates the same case
differently from a 60 Hz browser — enemies advance in coarser or finer
increments, and range checks sample at different points. Replace with a fixed
timestep accumulator at 1/60 s, draining up to a bounded number of steps per
frame. Rendering may interpolate; the simulation may not.

**Determinism.** Wave composition is shuffled with `Math.random()`. A seeded
mulberry32 PRNG, keyed on `(caseId, waveIndex)` and carried in sim state, makes
a run reproducible. This is what makes balance regressions detectable at all: it
is the precondition for the golden-run test in §9.

### State ownership and the React boundary

Sim state lives in a `GameLoop` instance outside React. Two distinct update
rates:

- **Board** — 60 Hz, Pixi reads sim state directly. React is not involved.
- **HUD** — ~10 Hz, React subscribes to a throttled immutable snapshot
  (`energy`, `tissue`, `wave`, `phase`, `feverAvailable`) via
  `useSyncExternalStore`.

Energy is the exception worth naming: the asset sheet's motion rules say *"Kills
are instant. No death animation; the energy number ticking up is the feedback."*
Energy is therefore the one value the HUD must not feel laggy on, and 10 Hz is
chosen to keep it readable as a tick rather than a jump.

Nothing on the play surface round-trips through React state.

---

## 4. Content as data

`src/game/content/` holds the prototype's values as typed constants:

| File | Contents |
|---|---|
| `defenders.ts` | The six defenders: cost, range, rates, damage, unlock tier, role colour |
| `pathogens.ts` | The six pathogens: hp, speed, reward, radius, armour, behaviour flags |
| `cases.ts` | Three cases: energy, wave tables, path polyline, build spots, illness rule |
| `vaccines.ts` | Six vaccine entries with earn conditions and effects |
| `body.ts` | Fifteen body-map nodes and fourteen links |
| `later.ts` | Season entries not yet playable |

These are the single source of truth, and they are **tunable**. The prototype's
values seed them; playtesting moves them.

There is deliberately **no test that fails when a gameplay number changes**. An
earlier draft proposed asserting content against the published asset sheet so
drift would break CI. That is the right instinct for a port and exactly wrong
for a game in balance: it would make every tuning pass a CI failure and train
everyone to edit the assertion. The asset sheet is documentation of a moment,
not a contract.

What *is* protected is structure, not values: content modules are validated for
internal coherence — every case references defenders and pathogens that exist,
every wave table is non-empty, every path has at least two points, every build
spot lies within the board. Those are invariants. Costs and damage are not.

### 4.1 Tuning panel

A dev-only panel, tree-shaken out of production builds, that adjusts defender
costs, damage, ranges, rates, pathogen stats, and wave composition against the
running simulation and exports the result as a content module. Balancing is then
a playtest loop rather than an edit-rebuild-replay loop.

It writes the same typed shapes the content modules use, so an exported tuning
session is a diff against `content/`, reviewable like any other change.

### Content naming policy — carried over verbatim

The prototype encodes a deliberate naming policy in a comment, and it is a
product constraint rather than a stylistic one. It is preserved:

- **Tier 1** — everyday illnesses, freely named.
- **Tier 2** — named only because the mechanic *is* the real mechanic.
- **Tier 3** — invented strains, never a real outbreak.
- No real outbreak is ever framed as an attack. No bioterror framing anywhere.

---

## 5. Mechanics

The vocabulary below is the design and is preserved. Enumerated so the
implementation plan can produce one test per row.

### Defenders

| Defender | Behaviour |
|---|---|
| Phagocyte (Engulf) | Holds one target at a time, frozen in place while digested; rests briefly between meals and longer every fourth. |
| Clot (Block) | Area slow, no damage; wears itself down while anything is inside it. |
| Antibody (Tag) | Tags everything in range; tags strip armour, burn over time, and raise the energy reward. Cannot tag resistant strains. |
| NK cell (Execute) | Single heavy hit on the *most wounded* target in range; instant kill below a health fraction. |
| Mast cell (Burst) | Hits everything in range, double damage on tagged targets. |
| Memory cell (Learn) | Weak initially; permanently gains damage from every kill nearby, up to a cap. |

### Pathogens

| Pathogen | Behaviour |
|---|---|
| Staph | Fast, weak, endless. |
| Biofilm | Armoured; armour only drops while tagged. |
| Flu virus | Splits into two weaker copies on death — unless flu immunity is maxed. |
| Spore | Regenerates unless tagged. |
| Toxin | Stuns non-clot, non-memory defenders it passes. |
| Resistant | Heavily armoured and untaggable; must be engulfed. |

### Case rules

- **Wound** — energy drains every second until a clot exists. Tetanus shield (at
  full staph immunity) bounces the first staph of each wave.
- **Virus** — every virus killed splits in two.
- **Poison** — pathogens damage defenders directly; antibodies resist far better
  than phagocytes.

### Run-level

Fever is a once-per-wave slow. Five tissue pips; a leak costs one; zero ends the
case. Clearing a case advances the day, banks a reward, and raises the strain's
immunity counter toward three. Three clears earn that strain's vaccine.

A fresh profile and "Start a new body" produce the *same* state — day 1, 240
banked, no immunity — from one shared factory. The prototype's day-4 opening was
demo staging.

### 5.1 Where the prototype is wrong

Each quirk is judged on whether it makes a better game. Every decision is
recorded in the implementation plan with its reasoning; the notable ones:

| Quirk | Judgement |
|---|---|
| `film` immunity is never incremented, so Biofilm serum can never be earned — a vaccine permanently displaying 0/3 | **Fix.** A visible goal the player cannot reach is a broken promise. Immunity increments per the strain actually cleared, not a two-way branch on illness type. |
| Tetanus shield tracks state on a field never reset at case start, so replaying a case silently loses the shield | **Fix.** Shield state moves into sim state and resets with the case. |
| Energy can settle at −1; only the display clamps it | **Fix.** Clamp at the source. A currency that goes negative is a bug wearing a display workaround. |
| Clot wear is applied per enemy in range, so a busy lane destroys a clot N× faster | **Decide deliberately.** Load-proportional wear is arguably the more interesting mechanic — a clot buckling under pressure reads well. Keep it, but make it intentional, tunable, and stated in the brief copy rather than emergent from a loop bug. |
| A newly engulfed enemy is not frozen until the next simulation step | **Fix.** A one-step lag between "engulfed" and "held" is invisible at 60 Hz and indefensible at any other rate. |
| Result sheet reports `+50` on case clear while banking `+180` | **Fix.** Report what was actually awarded. |
| Repeat clears could duplicate entries in `cleared` | **Fix.** Model as an ordered unique set. |

The distinction being drawn throughout: mechanics that are *surprising but good*
are kept and made deliberate; mechanics that are *merely broken* are repaired.

---

## 6. Screens

Ionic routes:

| Route | Screen |
|---|---|
| `/` | Map — body graph, nodes and links, current case pulsing |
| `/brief/:caseId` | Story, rule, shield status |
| `/play/:caseId` | Fight — board, dock, HUD, wave/result sheets |
| `/immunity` | Vaccine list with earn progress |
| `/season` | Day timeline including not-yet-playable entries |

---

## 7. Design system

### Colour is role, never decoration

Encoded as CSS custom properties in oklch, named by role:

| Token | Value | Meaning |
|---|---|---|
| `--threat` | `oklch(.66 .15 25)` | Pathogens, region under attack, the start-wave button |
| `--frontline` | `oklch(.66 .15 195)` | Phagocytes, tissue pips, regions held |
| `--support` | `oklch(.7 .14 145)` | Antibodies, tags, immunity, anything already won |
| `--control` | `oklch(.45 .14 320)` | Clots, anything that changes time rather than health |
| `--energy` | `oklch(.78 .13 80)` | Currency and the heart. Never a button fill. |

Neutrals: desk paper `#F4EFE6`, screen paper `#FBF7F0`, tissue field
`oklch(.95 .012 40)`, ink `#2C2A28`. Only two backgrounds ever appear on one
screen.

The night set is defined and left unused, exactly as the asset sheet instructs —
it belongs to a different art direction and is kept only so nobody reinvents it.

Type: Outfit for UI, DM Mono for numerals and labels. Self-hosted rather than
loaded from Google Fonts, so the game works offline and in a native shell.

### Motion rules, enforced in code

- Sheets rise 14 px over 250 ms. Nothing slides sideways. Nothing bounces.
- Only threats pulse. A pulsing ring always means *here, now*.
- Kills are instant — no death animation.
- The simulation pauses when the page is hidden. Backgrounding never costs a wave.

### Copy rules

Headlines are physical, not clinical. Real names imply honest behaviour. Never
scold the player — a lost region states what happened and offers the next move.
No exclamation marks, no emoji.

### Art

Procedural flat vector shapes drawn at runtime in Pixi — circles, rounded rects,
polylines — from a single `shapes.ts` vocabulary. No sprite atlas, no asset
pipeline, no binary assets in the repo. This is faithful to the stated direction
("shapes are flat, filled, and never outlined except to show a range or an empty
slot") and keeps the palette themeable from one place.

---

## 8. Persistence

A `ProgressRepository` port with two adapters: `localStorage` for web,
Capacitor `Preferences` for native.

The stored shape is versioned and validated on read. Where the prototype does
`try { ... } catch (e) {}` around both load and save — silently discarding
corrupt state and silently failing to persist — the port distinguishes the
cases: an unreadable or outdated save falls back to a fresh profile and reports
it; a failed *write* surfaces, because losing a cleared case without warning is
the one failure the player will notice and resent.

---

## 9. Testing

| Layer | Approach |
|---|---|
| Systems | Vitest, one focused suite per mechanic in §5 — behaviour, not magic numbers |
| Determinism | Same seed, same steps, identical state hash. Asserts reproducibility only. |
| Frame rate | 60 Hz and 120 Hz produce identical end state |
| Content | Structural invariants (§4). Never value assertions. |
| HUD | Vitest + Testing Library on snapshot-driven components |
| E2E | Playwright over the web build: place a defender, run a wave, assert HUD |

Systems are pure functions over state, so mechanics get real coverage without a
browser or a rendering harness.

**Tests assert behaviour, not balance.** "A tagged biofilm takes full damage
while an untagged one takes reduced damage" is a mechanic and is tested. "A
biofilm has 120 hp" is a tuning value and is not. A balance pass must be able to
move every number in `content/` without turning the suite red — if it cannot,
the suite is measuring the wrong thing.

The golden-run hash is a *reproducibility* net, not a balance freeze: it catches
unintended behavioural change, and it is expected and easy to re-bless whenever
tuning deliberately changes the run. Re-blessing is a one-command operation and
the diff is reviewed like any other.

---

## 10. iOS target

Capacitor is configured in the repo: `capacitor.config.ts`, portrait lock, real
`env(safe-area-inset-*)` handling in place of the prototype's hardcoded 44 px
status bar, and a documented build path.

**Constraint:** `npx cap add ios` requires macOS and Xcode. Development here is
on Windows, so the iOS *project* cannot be generated or verified in this
environment. Everything that does not require Xcode is committed and the single
Mac command is documented in the README. The web target is fully runnable and is
the development surface.

---

## 11. Repository structure

```
towerdefense-body-game/
├── .github/workflows/ci.yml
├── design/                     # imported Claude Design artifacts (reference)
├── docs/superpowers/specs/
├── public/
├── src/
│   ├── app/                    # Ionic React shell
│   │   ├── pages/              # MapPage, BriefPage, FightPage, ImmunityPage, SeasonPage
│   │   └── components/         # Hud, DefenderDock, TissuePips, WaveResultSheet, ...
│   ├── game/                   # pure simulation
│   │   ├── content/            # defenders, pathogens, cases, vaccines, body, later
│   │   ├── systems/            # spawn, movement, hazards, targeting, damage, economy, deaths
│   │   ├── loop.ts state.ts path.ts rng.ts types.ts
│   ├── render/                 # Pixi
│   │   ├── BoardRenderer.ts shapes.ts
│   │   └── layers/             # PathLayer, TowerLayer, EnemyLayer, BeamLayer
│   ├── progress/               # repository port + localStorage / Preferences adapters
│   ├── theme/                  # tokens.ts, variables.css
│   └── main.tsx
├── tests/e2e/
├── capacitor.config.ts
└── vite.config.ts
```

---

## 12. Recorded open questions

From the asset sheet. Not resolved by this work; recorded so they are not lost:

- Is Allergy too clever for the first hour, or is it the thing people tell their
  friends about?
- Should a lost region stay lost for the whole run, or heal after two days?
- Six defenders is a full dock on a phone. Is a seventh a replacement rather than
  an addition?
- Does the heart ever get attacked directly, or is it only ever the thing being
  protected?

---

## 13. Success criteria

1. All three cases are playable end to end on the web build, and clearing one
   advances progression correctly.
2. Simulation behaviour is identical at 60 Hz and 120 Hz.
3. A seeded run reproduces byte-identically across executions.
4. Every mechanic in §5 has a passing unit test, and every correction in §5.1 has
   a test proving the old behaviour is gone.
5. Every gameplay number in `content/` can be changed without any test failing
   except the re-blessable golden hash.
6. Every vaccine the immunity screen displays is reachable through play.
7. Progress survives a reload; a corrupt save yields a fresh profile rather than
   a crash; a failed write surfaces.
8. `src/game/` has no import from `render/`, `app/`, or any browser global.
9. The five screens honour the palette, motion rules and copy rules of §7.
10. The tuning panel adjusts a live simulation and exports a valid content
    module; it is absent from the production bundle.
11. iOS configuration is committed and the Mac-only step is documented.
