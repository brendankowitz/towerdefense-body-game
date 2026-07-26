# Body Defense — holistic review

**Date:** 2026-07-26
**Reviewer:** the author of `docs/superpowers/plans/2026-07-25-body-defense-implementation.md`
**Under review:** branch `feat/body-defense-app` at `7f98268`
**Method:** read `src/**`, `tests/e2e/**` and the two specs in full; ran the shipped simulation
headlessly against exhaustive board searches; ran `npm run verify` and the unit suite.

This is a review of an implementation of my own plan, so the parts I specified are held to a
harder standard than the parts I did not. Several defects below originate in the plan.

---

## Verification actually run

| Command | Result |
|---|---|
| `npm test` | 51 files, **610 passed**, 0 failed |
| `npm run verify` | **exit 0** — lint, both typechecks, tests, production build |

Everything below is measured against the code at that commit, not against what any document
says the code does.

---

## 0. The one-paragraph verdict

The engineering is genuinely good. The simulation is pure, deterministic, frame-rate
independent and honestly tested; the layering is real and enforced; persistence distinguishes
the failures that matter; the renderer keeps React out of the frame loop. That is worth saying
once. What is wrong is that **the game is not a game yet**: two of the three cases cannot be
won by any board the player can afford, the difficulty curve is inverted, the phase system has
a hole in it, and the balancing tool the whole plan was built around silently does nothing to
half the cells it claims to tune. The failures are concentrated in exactly the places the plan
deferred to "playtest later" and then never playtested. The balance failure is not deep: nine
stat changes, all reachable from the tuning panel that already exists, turn zero winnable cases
into a monotonic difficulty curve (§5, candidate D — verified against the shipped simulation).

---

## 1. Top findings, in severity order

### F1 — `placeDefender` is not phase-gated, and the UI does not gate it either

`src/game/commands.ts:38-52` refuses an occupied spot, an unknown spot, and insufficient
energy. It does not check the phase. `reabsorbDefender` (line 96) and `matureDefender`
(line 109) both open with `if (!isBuildPhase(state)) return false;`. The comment above
`isBuildPhase` (line 54-59) states the rule the code does not enforce:

> When the board may be rearranged. Reabsorbing and maturing both answer to this: a cell
> pulled out mid-wave would be free to farm and replace, which is not a decision either.

Placing *is* rearranging the board, and it is the half that adds power rather than removing it.

The React layer does not close the gap. `FightPage.tsx:137` calls `placeDefender` from
`onSpotTap` unconditionally, and `DefenderDock` (`src/app/components/DefenderDock.tsx:58`) is
live in every phase — `selectDefender` has no phase guard either. `startWave` clears the
selection, so the player has to tap a dock card first, which is one extra tap, not a barrier.

Demonstrated against the shipped code (scratch harness, forearm, wound rule):

```
placed clot in build phase: true energy 100
phase after startWave: wave
clot destroyed after 7.28s of wave; phase=wave, energy=100
MID-WAVE placeDefender on the now-empty spot: true | phase wave | towers 1
mid-wave reabsorbDefender: false (build-phase only)
mid-wave matureDefender:  false (build-phase only)
```

The clot dies 7.3 s into wave 1 and can be rebuilt immediately, mid-wave, for 70. The wound
rule — "energy drains every second until a clot exists" — is meant to force one opening
purchase; instead it becomes a pay-as-you-bleed tap loop. More generally, build/fight phases
exist to make placement a commitment, and the commitment is not enforced.

**No test covers this**, and the absence is legible: `commands.test.ts` has
`'refuses while a wave is running, and pays nothing out'` for reabsorb (line 243) and
`'refuses while a wave is running, and charges nothing'` for mature (line 340), and nothing of
that shape for place.

**Fix:** add `if (!isBuildPhase(state)) return false;` as the first line of `placeDefender`,
add the same guard to `selectDefender`, disable the dock while `phase === 'wave'`, and add the
matching test. If mid-wave placement is wanted as a *feature* (an emergency buy), it should be
a stated rule with its own cost, not an unguarded function.

### F2 — no case is winnable in a real run, and the difficulty curve is inverted

I searched every board the player could actually build, playing the shipped simulation on a
fixed timestep: every assignment of a defender kind to each of the five spots, restricted to
the kinds unlocked at that point in progression (`clearedCount` 0 / 1 / 2 for forearm / throat
/ stomach), buying cheapest-first at every build phase with the real economy.

| Case | Unlocked cells | Boards searched | Clears | Best result |
|---|---|---|---|---|
| forearm (day 1) | phago, clot, anti, nk | 1024 | **0** | reaches wave 5, loses |
| throat (day 2) | + mast | 3125 | **0** | **reaches wave 2**, loses |
| stomach (day 3) | + mem | 7776 | **3** | clears with 2 pips left |

Two things follow, and the second is not in any document.

**The recorded claim is wrong.** `tests/e2e/wave.spec.ts:55-66` states: *"A headless sweep of
every defender composition across all three cases, with reach-aware buying, produced zero
clears. No case is currently winnable end to end."* Stomach is winnable, by three boards, all
variations of `anti, mast, anti, nk, anti` (cost 565, opening energy 250). Trace of one:

```
wave 1 opens: energy 60, board 0:anti 2:anti      -> 12 kills, 0 through, 5 pips
wave 2 opens: energy 17, board +4:anti 3:nk       -> 16 kills, 0 through, 5 pips
wave 3 opens: energy 154, board +1:mast           -> 21 kills, 0 through, 5 pips
wave 4 opens: energy 480                          -> 25 kills, 1 through, 4 pips
wave 5 opens: energy 737                          -> CLEARED, 2 pips
```

It does not help the player, because stomach is case three and the two before it are
unwinnable — but a statement about the game's balance that is written into a test file and a
commit message should be true, and this one is not. It is the same class of error the plan
warns about: reporting a result rather than reproducing it.

**The curve is inverted.** Case 2 is by far the hardest — the best of 3125 boards reaches
wave 2 of 5 — while case 3 is beatable. Throat is the wall. Diagnosis in §5.

### F3 — the tuning panel cannot tune half the cells on the board

`statsFor` (`src/game/systems/stats.ts:28-38`) merges `MATURED_FORMS[kind].stats` *on top of*
the live `DEFENDERS` table. `MATURED_FORMS` (`src/game/content/maturation.ts`) is not exposed
by `tuning.ts`, has no panel UI, and is not emitted by `exportContentModules`. Every stat a
matured form names is therefore frozen against the tuning panel. Measured against the shipped
modules:

```
after applyDefenderTuning('phago', { dps: 999, range: 200 }):
  DEFENDERS.phago            999 200
  plain phagocyte dps/range  999 200
  MACROPHAGE dps/range        26  70    <-- unchanged
after applyDefenderTuning('clot', { slow: 0.9, wear: 1 }):
  FIBRIN MESH slow/wear      0.16  21   <-- unchanged
after applyDefenderTuning('anti', { range: 300, rate: 0.1, tag: 60 }):
  HIGH-AFFINITY range/rate/tag 78 3 9   <-- unchanged
```

Three of six defenders have a matured form. A balance session that moves phagocyte range
moves it for the unmatured cell and not for the macrophage — silently, with no indication in
the panel. Spec §13.10 says the panel "adjusts a live simulation"; for a grown cell it does
not, and §4.1's promise that "balancing is a playtest loop" is broken for exactly the tier the
player reaches late in a case.

Two smaller members of the same defect:

- **The tag burn is not tunable per-cell and is read outside `statsFor`.**
  `applyMovement` does `enemy.hp -= DEFENDERS.anti.dot * dt` (`src/game/systems/movement.ts:46`).
  The maturation module documents why (`maturation.ts:22-25`) and the reasoning is sound, but
  the consequence is that the antibody's *only* source of damage is a global constant applied
  per tagged enemy with no reference to the cell that laid the mark. Given §5 says the tagged
  burn is one of three things a tag does, and given the antibody turns out to be the only cell
  that covers most build spots (§5 below), this deserves to be a per-tower stat.
- **A live range change does not repaint the board.** `TowerLayer.signatureOf`
  (`src/render/layers/TowerLayer.ts:49-57`) packs kind, health, spent, holding, flash and
  matured — not the range it draws from `statsFor(tower).range` (line 96/99). Tune a range in
  the panel and the range ring on screen keeps the old radius until something else about the
  cell changes. The same is true of `#drawSpots`'s reach preview signature (line 240-243).

### F4 — three more tests that cannot fail

Six were already found. Here are three more, each with the mutation that proves it.

**(a) `spawn.test.ts:73` — "shuffles a mixed wave rather than leaving it grouped by kind".**

```ts
expect(queue.join(',')).not.toBe([...queue].sort().join(','));
```

Wave 4 of forearm is 15 staph, 4 film, 1 mrsa. An *unshuffled* queue is
`staph×15, film×4, mrsa`, and the alphabetically sorted queue is `film×4, mrsa, staph×15`.
They differ, so the assertion passes with no shuffle at all. Verified:

```
unshuffled === sorted ? false
assertion "not.toBe(sorted)" passes with NO shuffle: true
```

*Mutation that must fail and does not:* delete the Fisher–Yates loop in `buildQueue`
(`src/game/systems/spawn.ts:22-29`). *Fix:* assert against the unshuffled expansion of the
wave table — build the grouped queue in the test and assert the real one is not equal to it.

**(b) `spawn.test.ts:66` — "differs between waves of the same case".** Compares wave 0 (8
staph) against wave 2 (12 staph + 3 film). They differ in *length*, so the assertion holds
whatever the seed does. *Mutation:* make `waveSeed` ignore `waveIndex`
(`src/game/rng.ts:29`) — the test still passes. *Fix:* compare two waves with identical
composition, or compare `buildQueue` output for the same wave table under two indices.

**(c) `tests/lint/boundaries.test.ts` — does not test the boundary it is named for.** The
fixtures live under `tests/lint/fixtures/**`, which `eslint.config.js:83-94` gives its *own*
`no-restricted-imports` block (`['pixi.js', 'react', '@render/*']`). The block that actually
guards the simulation is `files: ['src/game/**/*.ts']` at line 41-69. *Mutation:* delete the
entire `src/game/**` block from `eslint.config.js` — both boundary tests still pass. The
config comment admits this ("it does not prove these two lists agree"), which makes it a known
gap rather than an accident, but spec criterion 8 is nominally enforced by this test and it is
not enforced by this test.

*Fix, with the wrinkle:* linting a virtual path does not work — `projectService: true` rejects
a file that is not in a tsconfig project:

```
errors: 1
   null - Parsing error: ...\src\game\__probe.ts was not found by the project service.
```

So put a real fixture at a real path under `src/game/` (e.g. `src/game/__fixtures__/boundary-violation.ts`),
add it to `globalIgnores` and to the tsconfig excludes, and lint it with `ignore: false` — or
add `allowDefaultProject` for that one path. Either way the fixture must sit where the rule
applies.

**Two weaker cases worth a look, not defects:**

- `state.test.ts:55` "resets the spent tetanus shield at case start" sets
  `first.shieldedWave = 4` and then asserts a *different, freshly constructed* state is null.
  The mutation of `first` is dead code; the assertion only restates the object literal. The
  real D2 coverage lives in `run.test.ts:256` and `spawn.test.ts:183` and is good.
- `content.invariants.test.ts:253` "offers a choice of at least two defenders at every build
  spot" measures the *minimum distance* from spot to path. That admits a spot whose range
  circle grazes the vessel tangentially. Forearm spot 4 passes it and gives a phagocyte
  **0 units** of vessel coverage. See §5 — this invariant is the one that should have caught
  the balance problem and it measures the wrong quantity.

### F5 — Chickenpox is the "unreachable vaccine" defect, reintroduced

Spec §5.1 lists as its first correction: *"`film` immunity is never incremented, so Biofilm
serum can never be earned — a vaccine permanently displaying 0/3. **Fix.** A visible goal the
player cannot reach is a broken promise."*

`src/game/content/vaccines.ts:19` ships:

```ts
{ name: 'Chickenpox', gate: 99, tier: 2, effect: 'Stops a cleared case reopening later', cost: 'Survive a dormancy case first' },
```

`vaccineRows` (`progression.ts:96-99`) renders `gate: 99` against `profile.cleared.length`,
which maxes at 3. The season screen therefore shows a vaccine permanently marked LOCKED, with
a cost line describing a case type that does not exist. That is the same broken promise in a
different row. `progression.test.ts:209` loops `count` from 0 to `CASES.length` and asserts
`locked` throughout, so the suite ratifies it.

Two related, smaller: **MMR** shows `AVAILABLE` at two clears and there is no purchase action
anywhere in the app and no amnesia rule for it to block; and the **bank** (`CASE_CLEAR_BANK`,
180 per clear, shown on the map as `data-testid="bank"`) has no sink — nothing in the codebase
ever spends it.

**Fix:** either delete the Chickenpox and MMR rows until the rules that give them meaning
land (the four proposed in `2026-07-26-case-rules-4-to-12-design.md`), or render them under an
explicit "later in the season" heading that does not read as an achievable row. And add an
invariant to `content.invariants.test.ts`: every gated vaccine's `gate` must be `<= CASES.length`.

---

## 2. The eleven success criteria (spec §13)

| # | Criterion | Verdict |
|---|---|---|
| 1 | All three cases playable end to end; clearing one advances progression | **Unmet.** Forearm and throat are unwinnable by every affordable board (F2); stomach is winnable but unreachable behind them. Progression *machinery* is correct and unit-tested (`progression.test.ts`), and `FightPage.test.tsx:325` proves a clear banks and persists — but only by setting `result = 'case'` by construction. Nothing has ever completed a case through play. |
| 2 | Identical at 60 Hz and 120 Hz | **Met.** `loop.test.ts:66` uses 144 Hz, which does not divide 1/60, plus a jittered-frame test (line 74) and a stuttering 30 Hz test (line 84), all comparing at equal step counts. This is the defect the plan introduced and it is properly fixed. |
| 3 | A seeded run reproduces byte-identically | **Met.** `loop.test.ts:108` and `golden.test.ts:129`. `hashState` omits `spawnTimer`, `shieldedWave`, `feverUsed` and queue *contents* (only length), which is a small hole — a shuffle-order change is only caught once it changes what spawns — but reproducibility itself holds. |
| 4 | Every mechanic in §5 has a unit test; every §5.1 correction has a test proving the old behaviour is gone | **Met, with one gap.** Every defender, pathogen, case rule and run-level rule has a focused suite, and D2/D3/D4/D5/D6/D9/D10/D11/D22 each have a named test. The gap: **poison damage stacks per enemy in range** (`movement.ts:74` calls `applyPoison` once per enemy) and nothing tests or documents that. Clot wear got a decision (D10), brief copy and a test; identical stacking in poison got none of the three. With 34 bodies in stomach wave 5 a phagocyte at 10 dps/enemy dies in well under a second. Either make it a decision like D10 or divide it out. |
| 5 | Every gameplay number in `content/` can change without failing anything but the golden hash | **Met.** I read every content-facing assertion. `content.invariants.test.ts` is structural; the magnitude bounds are loose enough to be typo-catchers; brief copy is derived from the stats it quotes and tested for that; `golden.test.ts` funds each board from the costs it is about to pay. Two blemishes: `tests/e2e/screens.spec.ts:60` hardcodes `'0/3'` and line 32 `'0 of 3 clears done'` instead of deriving from `IMMUNITY_MAX`; `wave.spec.ts` is the one sanctioned balance-coupled test and says so loudly. |
| 6 | Every vaccine the immunity screen displays is reachable | **Partially met at best, and unmet in spirit.** The immunity screen renders only `STRAIN_ROWS` (three), each reachable in principle. The *season* screen renders all six `VACCINES`, and Chickenpox (`gate: 99`) can never leave LOCKED (F5). And since no case is winnable, no vaccine is reachable in fact. |
| 7 | Progress survives reload; corrupt save yields a fresh profile; failed write surfaces | **Met, and well.** `LocalStorageProgressRepository` separates read failure (quiet, fresh profile) from write failure (rejects, `saveError`, `SaveErrorBanner`); `parseProfile` is total and range-checked; `persistence.spec.ts` crosses the real storage boundary and deliberately avoids an init script that would re-seed on reload. One note: `parseProfile` rejects a `cleared` entry naming a case that no longer exists, so renaming a case id discards every save without a version bump. |
| 8 | `src/game/` has no import from `render/`, `app/`, or any browser global | **Met in the config; not proven by the test.** `eslint.config.js:41-69` restricts the imports, the browser globals, `Math.random`, `Math.hypot` and `Date.now`; `tsconfig.game.json` compiles the layer with no DOM lib. Both run in `npm run verify` and it passes. The dedicated test does not exercise the rule (F4c). |
| 9 | The five screens honour palette, motion and copy rules | **Met, as far as is mechanically checkable.** Palette is oklch role tokens resolved in one place (`theme/tokens.ts`), with `src/game` owning the vocabulary and `theme` importing it type-only. Only threats pulse (`BodyMap.tsx:67`, `board-modifier`). No death animation — `EnemyLayer`'s header says so and the code has nowhere to put one. Copy rules have mechanical tests for `!` and emoji in `DEFENDER_BLURBS`, `MATURED_FORMS` names and `PlacedCells`. Not covered anywhere: sheet rise 14 px / 250 ms, "nothing slides sideways", "only two backgrounds per screen" — those are a design review, and the spec says so. |
| 10 | Tuning panel adjusts a live simulation and exports a valid content module; absent from production | **Partially met.** Absence from production is well covered (dynamic import behind `import.meta.env.DEV`, `production.spec.ts` asserts no `tuning` request and no handle). Live adjustment works for base stats and wave counts and fails silently for every matured form (F3), and the board does not repaint ranges. The exporter emits entries without the type annotation that `defenders.ts` carries, so "paste over the const" needs care. |
| 11 | iOS configuration committed, Mac-only step documented | **Met.** `capacitor.config.ts` carries app id, `webDir`, `contentInset: 'never'` with its reason, launch background. The README's "What has and has not been verified here" section is the most honest thing in the repository — it states plainly that Xcode has never run, that portrait lock is an Info.plist edit on the Mac (so it is documented, not configured, which matches reality), and that Capacitor `Preferences` has only ever been exercised through its web fallback. |

Score: **6 met, 4 partially met, 1 unmet.**

---

## 3. Correctness — other findings

Ordered by severity below F1–F5.

**C1. Poison stacks per enemy and nobody decided that.** Covered under criterion 4 above.
`applyPoison` is called inside the per-enemy loop (`movement.ts:74`), so N bodies within
`POISON_RADIUS` do N × dps to every non-clot cell. This is the mechanism that makes stomach
punish phagocytes so hard, and it is precisely the kind of emergent-from-a-loop behaviour that
§5.1 says should be "made intentional, tunable, and stated in the brief copy". The stomach
brief says only "Pathogens damage your defenders." A test asserting that two enemies do twice
the damage of one would pin whichever way it is decided.

**C2. `MAX_STEPS_PER_FRAME` and `MAX_FRAME_SECONDS` do not agree.** `loop.ts:6-7`:
`MAX_FRAME_SECONDS = 0.25`, `MAX_STEPS_PER_FRAME = 8`. 0.25 s is 15 fixed steps; the loop can
only take 8, and line 109 then throws the remainder away. So any frame longer than ~133 ms
silently loses simulation time — and at 2× speed, any frame longer than ~67 ms does. On a
mid-range phone under a wave of fifty entities that is reachable. It is not a determinism bug
(the loop tests drive equal step counts) but it is a "the wave got easier because your phone
stuttered" bug. Either raise `MAX_STEPS_PER_FRAME` to `ceil(MAX_FRAME_SECONDS * FAST_MULTIPLIER / STEP_SECONDS)`
= 30, or lower `MAX_FRAME_SECONDS` so the two mean the same thing.

**C3. `step` ordering is right, and the comment explaining it is subtly incomplete.**
`step.ts:47-80` runs spawn → bleed → acquire → movement → defenders → deaths. Acquisition
before movement is correct and is D9. But `applyToxinStun` and `applyPoison` are called from
inside `applyMovement` (`movement.ts:73-74`) *after* the enemy has been moved and possibly
marked as leaked — so a leaker stuns and poisons on the way out, which the D11 comment does
name. What no comment names is that hazards therefore run *before* `runDefenders` in the same
step, so a cell stunned this step loses this step's action. That is a defensible choice; it is
just not written down, and it interacts with C1 to make stomach brutal.

**C4. `collectHeld` and `engulf` both do a linear `find` over `state.enemies` per phagocyte
per step.** `step.ts:15`, `damage.ts:37`, `TowerLayer.ts:278`. With five towers and fifty
enemies that is 250 comparisons a step — irrelevant now, and the honest note is that it is
irrelevant now. Flagged only because the plan's stated reason for choosing Pixi over
`@pixi/react` was iOS WebView cost, and this is the kind of thing that gets copied into the
ten-case version.

**C5. `PlacedCells` keeps `chosenSpot` across a wave.** The component returns `null` during a
wave (`PlacedCells.tsx:36`) but stays mounted, so `chosenSpot` survives. If the chosen cell
dies during the wave, the next build phase shows the chip row with no actions and no
explanation until the player taps again. Cosmetic; a `useEffect` clearing the selection when
the phase leaves build would close it.

**C6. `advanceToNextWave` does not clear `waveKills` / `waveLeaks`.** `startWave` does
(`commands.ts:132-133`), so the result sheet is correct in practice — but between
`advanceToNextWave` and the next `startWave` the HUD snapshot still carries the previous
wave's counters. Nothing renders them in that window today. Worth making `advanceToNextWave`
own it so a future build-phase readout cannot inherit stale numbers.

**C7. `parseProfile` and content coupling.** Noted under criterion 7. Renaming or removing a
`CaseId` silently invalidates every save. `STORAGE_VERSION` exists for exactly this; the
convention should be written down: changing `CaseId` requires a version bump.

---

## 4. Structure and clarity

**The layering is honest.** `app → render → game`, `app → progress → game`, `theme → game`
type-only. `src/game/types.ts:21-25` puts the `PaletteToken` vocabulary in the simulation and
has the theme import it, which inverts the dependency correctly and is the single nicest
structural decision in the repo. `tsconfig.game.json` compiling the layer with no DOM lib is a
second, independent enforcement — belt and braces, and the right two.

**Module sizes are sane.** No file does two jobs badly. The systems are one mechanic each and
read as their own names. `ViewPool` is the only real abstraction in the render layer and it
earns its place, with a docstring that states its own worst case honestly.

Where it is less good:

- **`commands.ts` is doing three things.** It holds selection (`selectDefender`,
  `isUnlocked`, `unlockedDefenders`), board editing (`place`, `reabsorb`, `mature`, `towerAt`,
  `refundOf`, `reabsorbValue`, `totalSpent`) and run flow (`startWave`, `advanceToNextWave`,
  `restartCase`, `triggerFever`, `toggleSpeed`). Those are three unrelated vocabularies in one
  170-line file. The reason to split is not size, it is F1: the phase rule is stated once in
  `isBuildPhase` and then obeyed by two of the three board-editing commands. Extract
  `board.ts` (place / reabsorb / mature / refund) from `commands.ts` and the missing guard
  becomes visible by inspection, because the three functions that must share it would sit
  together.
- **`progression.ts` is the simulation module that is really a view model.** `strainRows`,
  `vaccineRows`, `seasonRows` and `regionName` produce display strings — including
  `'DONE'`, `'HELD'`, `'LOCKED'`, `'NONE EXISTS'` and a title-cased region name — inside
  `src/game`. They are pure and testable there, which is the argument for it, but `src/game`
  is documented as "the ruleset", and screen copy in it means a copy change is a simulation
  change. Move the three `*Rows` functions to `src/app/state/` and leave `Profile`,
  `createFreshProfile`, `clearCase` and `nextCaseId` in the game layer.
- **`tuning.ts` mixes three concerns** behind one file: mutating live tables, listing them
  for a UI, and generating TypeScript source. `exportContentModules` in particular is a
  code generator living in `src/game/content/`. It is dev-only and tree-shaken, so this is a
  clarity point rather than a correctness one — but `literal()` and `entrySource()` are a
  serialiser, and they belong beside the panel that calls them.
- **`testing.ts` re-declares `TowerBase`** (`src/game/testing.ts:51-58`) rather than importing
  the shape from `types.ts`, because `TowerBase` is not exported. Two definitions of the same
  invariant, and the test copy is the one that will drift. Export the interface.
- **`ViewPool.createdCount`'s docstring contradicts the class docstring.** Line 53 says "Never
  exceeds the peak simultaneous entity count"; lines 34-41 explain, correctly, that it can
  reach peak plus single-frame turnover. Fix the property comment.

**Would a new developer understand each module in under a minute?** Yes, for everything in
`src/game/systems/`, `src/render/` and `src/progress/`. No, for `commands.ts` (three
vocabularies) and `progression.ts` (rules and copy). The comment density is high and mostly
earns itself — the comments explain *why*, per the standard — with one exception worth naming:
`maturation.ts` spends 30 lines of prose on a 40-line table, including a paragraph explaining
why a field is absent. That is the plan's voice leaking into the source.

---

## 5. The balance problem — diagnosis and prescription

### The mechanism

It is not damage, and it is not economy first. **It is that the build spots are further from
the vessel than the range of every cell that deals damage.**

Distance from each spot to the nearest point on the path, and the arc length of vessel each
cell would actually cover from it (measured over the compiled path; "seconds" is dwell time
for a staph at speed 50):

| Case | Spot | Reach | phago (56) | clot (62) | mast (54) | nk (78) | mem (82) | anti (94) |
|---|---|---|---|---|---|---|---|---|
| forearm | 0 | 55.2 | 19u / 0.4s | 74u | 0 | 141u | 152u | 182u |
| forearm | 1 | 45.5 | 65u / 1.3s | 84u | 58u | 131u | 141u | 169u |
| forearm | 2 | 48.0 | 58u / 1.2s | 76u | 49u | 114u | 123u | 147u |
| forearm | 3 | 73.7 | **0** | **0** | **0** | 34u | 50u | 86u |
| forearm | 4 | 81.7 | **0** | **0** | **0** | **0** | 15u | 96u |
| throat | 0 | 58.0 | **0** | 79u | **0** | 151u | 163u | 193u |
| throat | 1 | 39.9 | 134u | 152u | 128u | 216u | 234u | 273u |
| throat | 2 | 74.0 | **0** | **0** | **0** | 21u | 36u | 73u |
| throat | 3 | 78.0 | **0** | **0** | **0** | **0** | 51u | 148u |
| throat | 4 | 73.5 | **0** | **0** | **0** | 23u | 38u | 74u |
| stomach | 0 | 81.1 | **0** | **0** | **0** | **0** | 24u | 78u |
| stomach | 1 | 40.8 | 136u | 159u | 122u | 207u | 226u | 289u |
| stomach | 2 | 58.2 | **0** | 43u | **0** | 90u | 128u | 128u |
| stomach | 3 | 64.4 | **0** | **0** | **0** | 86u | 95u | 120u |
| stomach | 4 | 73.5 | **0** | **0** | **0** | 18u | 33u | 70u |

Union coverage of the whole vessel with all five spots occupied by one kind: phagocyte
**18–22%**, mast cell **16–17%**, antibody **73–81%**.

So:

1. **The mast cell — cost 150, the dock's dedicated area-damage cell — is placeable on
   exactly one spot per case.** Eleven of fifteen spots give it zero coverage. It unlocks
   after one clear and is, for eleven-fifteenths of the game, unbuyable content.
2. **The only cell that covers the board is the antibody, whose entire damage output is a
   4/s burn over a 6 s mark — 24 damage per tag, against a staph with 26 hp.** The cell that
   can reach is the cell that cannot kill. That is why every winning stomach board is three
   antibodies plus a killer cell plus the one mast spot.
3. **The phagocyte works despite 0.4 s of coverage** only because engulf freezes its prey:
   dwell time is irrelevant to it, which is why forearm's spots 0–2 are usable at all. Its
   throughput is the real limit — 26 hp at 15 dps is 1.73 s, plus a 0.7 s gap and a 3.4 s rest
   every fourth meal, so **one phagocyte kills a staph every ~3.1 s**. Forearm wave 5 sends 26
   bodies over an 11.4 s spawn window.
4. **The clot buckles too fast to be a wall.** 100 hp, 13/s wear *per body inside it*: 7.7 s
   with one body, **2.6 s with three**. Its matured form is worse — fibrin at 21/s lasts 1.6 s
   under three. It is a purchase that pays for about one spawn cluster.

`content.invariants.test.ts:253` was written to prevent exactly this — "a build spot no cell
can shoot from is dead content" — and it passes, because it measures minimum distance rather
than covered arc. Forearm spot 4 sits 81.7 from the vessel; two cells' ranges exceed that, so
the invariant is satisfied, and one of those two (mem, range 82) covers **15 units** of vessel:
0.3 s of a staph's life. **The invariant should be rewritten to measure covered arc length,
with a floor stated in seconds of dwell** — something like "at least two defenders must cover
≥ 1.0 s of vessel at the slowest pathogen speed". That single change turns the balance problem
into a CI failure instead of a playtest discovery.

### What I would change, with numbers — and what those numbers actually produce

I ran four candidate tunings through the shipped simulation, sweeping every affordable board
at the correct unlock tier for each case, and counting clears. **All of these are stat changes
reachable from the tuning panel; none of them move a build spot.** Geometry turned out not to
be necessary, which is the one place the diagnosis was more pessimistic than the evidence.

| Candidate | forearm | throat | stomach |
|---|---|---|---|
| **shipped** | 0 / 1024 | 0 / 3125 | 3 / 7776 (0.04%) |
| **A** — `phago.range` 74, `mast.range` 72, `clot.range` 76 | 0 / 1024 | 0 / 3125 | 17 / 7776 (0.2%) |
| **B** — A + `clot.wear` 6, `anti.dot` 6 | 36 / 1024 (3.5%) | 54 / 3125 (1.7%) | 181 / 7776 (2.3%) |
| **C** — B + `startingEnergy` forearm 260, throat 300 | 59 / 1024 (5.8%) | 244 / 3125 (7.8%) | 181 / 7776 (2.3%) |
| **D** — C + `mast.unlock` 0, `mem.unlock` 1 | **295 / 3125 (9.4%)** | **492 / 7776 (6.3%)** | **181 / 7776 (2.3%)** |

Read across, three things fall out:

- **Range alone fixes nothing.** Candidate A makes every spot placeable and still produces zero
  clears in the first two cases. Reach is a necessary condition, not the binding one.
- **The binding constraints are the clot's lifetime and the antibody's burn.** Candidate B is
  the first row with clears in all three cases, and the only things it adds are
  `clot.wear` 13 → 6 and `anti.dot` 4 → 6.
- **Candidate D is the one I would ship**, because it is the only row whose clear rate falls
  monotonically across the three cases — **9.4% → 6.3% → 2.3%**. That is a difficulty curve.
  The shipped content has no curve at all; candidate C still has throat easier than forearm.

The full change set for D:

| Change | From | To | Why |
|---|---|---|---|
| `phago.range` | 56 | **74** | one placeable spot per case is not a choice; 74 opens 12 of 15 spots and keeps the phagocyte shorter-ranged than nk (78), mem (82) and anti (94) |
| `mast.range` | 54 | **72** | the dock's area cell is currently buildable on exactly one spot per case |
| `clot.range` | 62 | **76** | the wall has to be placeable where the crowd is |
| `clot.wear` | 13 | **6** | 100/(6×3) = 5.6 s under three bodies instead of 2.6 s — long enough to be a wall for one spawn cluster, short enough to still visibly buckle (D10 is preserved) |
| `anti.dot` | 4 | **6** | 6 × 6 s tag = 36 damage per mark: kills a staph, hurts a spore. Makes the only board-covering cell a real contributor without making it the primary killer |
| forearm `startingEnergy` | 170 | **260** | the cheapest board that clears forearm even with unlimited money costs 400; 170 buys one antibody and one phagocyte, and wave 1 pays back 98 |
| throat `startingEnergy` | 215 | **300** | throat wave 1 is 6 virus that become 18 bodies against at most two cells |
| `mast.unlock` | 1 | **0** | four unlocked cells is a 1024-board search space and, before this change, none of them win |
| `mem.unlock` | 2 | **1** | same argument one case later; it also gives throat's splitting rule the cell that grows on kills |

Not swept, but I would apply it for consistency: fibrin `wear` 21 → **10**, keeping the matured
clot's trade (holds harder, dies faster) at the same ratio as the base cell. It is invisible to
the sweep because `MATURED_FORMS` is not tunable (F3) — which is itself the argument for fixing
F3 before the balance pass rather than after.

Optional, and no longer required: **the four dead build spots.** Forearm spot 4 (reach 81.7),
stomach spot 0 (81.1), throat spot 3 (78.0) and forearm spot 3 (73.7) still give the front line
zero coverage even at range 74. Pulling each ~25 units toward the vessel would make all five
spots of every case a real choice rather than three real ones and two antibody parking spaces.
I would do it, but as level design after the tuning lands, not as part of the fix.

**Playtest rather than compute:**

- Whether `anti.dot` at 6 makes antibody-spam the answer everywhere. The sweep already hints
  that it might: under candidate C, throat's best board is five antibodies and 191 of its 244
  clears finish on 3 pips, which reads as one dominant strategy rather than a spread of
  viable ones. The sweep can tell you *whether* boards clear; only play tells you whether the
  same board clears all three cases. If it does, the answer is not to lower `dot` but to raise
  `anti.cost` and shorten `anti.tag`.
- Whether the clot at `wear: 6` feels like a wall or a speed bump. The number that matters is
  "does the player see it break", and 5.6 s under three bodies is right at the edge of visible.
- Whether mast at day 1 makes the phagocyte pointless. If so, mast's cost (150) is the lever,
  not its range.
- The whole poison stacking question (C1). Whether stomach should punish a phagocyte at
  10 dps × N bodies or at a flat 10 dps is a feel question, and the current answer was never
  chosen.

**How to verify a candidate before shipping it.** Everything above is measurable without a
browser: the simulation is pure and deterministic, so an exhaustive sweep over the 4^5 / 5^5 /
6^5 boards the player can actually afford, playing the real `step` on the real fixed timestep,
takes minutes. **Do not target "the case is winnable" — target a win rate.** Zero clears is the
current failure; 3 clears in 7776 (stomach today) is barely better, because the player will
never find them. I would aim for **5–15% of affordable boards clearing**, falling as the season
goes on, with the best boards finishing on 4–5 pips and naive boards losing on wave 3–4. That
distribution is a difficulty curve; a binary "some board somewhere wins" is not.

By that standard candidate D lands forearm (9.4%) and throat (6.3%) in the band and leaves
stomach at 2.3% — tight for a third case, and the one number I would keep pushing on. The
lever there is `mast.range` or stomach's opening energy, not the poison rule, because stomach's
difficulty is currently coming from an undecided mechanic (C1) rather than a chosen one.

---

## 6. What the process cost

Stated plainly, because the same team will build cases four to ten.

**Convention is not isolation.** Two agents ran mutation harnesses over a shared working tree
and corrupted other agents' verification runs. The plan's own lesson list records this
(`"Do not run a snapshot-and-restore harness over a whole directory while another agent may be
editing it"`) — as a discipline rule. Discipline is the wrong layer. Every agent that mutates
tracked files to test something needs a git worktree of its own; the harness then cannot reach
another agent's files whatever it does. The cost was not just the corrupted runs: it is that
after one such incident, nobody could fully trust a green run they had not personally
reproduced, which is exactly the condition in which "610 tests pass" stops meaning anything.

**"Done" must mean verified, not written.** Several agents reported completion while still
writing, and one reported a design it had not built. The fix is mechanical: a completion report
is not accepted without the command and its output pasted in. The plan already says
*"Before claiming a test proves something, reintroduce the defect and watch that exact test
fail"* — and F4 shows three tests that were never put through that. The rule existed; nothing
enforced it. Make the enforcement cheap: require every task's report to name (a) the command
run, (b) its exit status, and (c) for any new test, the mutation that was made to watch it
fail.

**A claim in a comment is a claim.** `wave.spec.ts:55-66` states a sweep result that is not
true (F2). It reads authoritative — a specific method, a specific conclusion, a `test.fixme`
built around it — and it is wrong. Findings that shape the code belong in a file with a date
and a way to re-run them, not in a prose comment in a test that cannot check them. If a
headless sweep is the evidence, the sweep should be a committed script.

**The plan was too confident about numbers it had not played.** Spec §4 is right that content
values are tunable and should not be asserted. But "tunable" was allowed to become "will be
tuned later", and later never had an owner. The single process change with the highest value:
**land the balance harness in the same phase as the content**, so a case is not "built" until a
sweep says it is winnable at a target rate. That is a one-file script and it would have caught
F2 on day one instead of at the end.

**What went right, and should be repeated.** The plan's "Writing tests that can actually fail"
section is the most valuable artifact in the repository — every item in it is a real defect
that a mutation run found. It should be a standing checklist, not a section of one plan. And
the decision log (D2–D22, referenced by number from both the code and the tests) made this
review possible: every surprising behaviour I found had either a decision number attached or
was a defect, and that binary is exactly what a reviewer needs.

---

## 7. Ranked action list

1. Phase-gate `placeDefender` and `selectDefender`; disable the dock during a wave; add the test. (F1)
2. Rewrite `content.invariants.test.ts`'s build-spot invariant to measure covered arc length in seconds of dwell, not minimum distance. (F4/§5)
3. Apply candidate D from §5 (`phago.range` 74, `mast.range` 72, `clot.range` 76, `clot.wear` 6, `anti.dot` 6, forearm/throat opening energy 260/300, `mast.unlock` 0, `mem.unlock` 1) and commit the sweep script that verifies it: 9.4% / 6.3% / 2.3% clear rates, monotonic across the three cases. (F2)
4. Expose `MATURED_FORMS` through `tuning.ts` and the panel, and include range in `TowerLayer`'s signature. (F3)
5. Fix the three tests that cannot fail, each by reintroducing the defect first. (F4)
6. Decide the poison-stacking rule, give it a decision number, a brief line and a test. (C1)
7. Remove or re-frame the Chickenpox and MMR rows; add the `gate <= CASES.length` invariant. (F5)
8. Reconcile `MAX_STEPS_PER_FRAME` with `MAX_FRAME_SECONDS` × `FAST_MULTIPLIER`. (C2)
9. Split `board.ts` out of `commands.ts`; move the `*Rows` view models out of `src/game`. (§4)
10. Correct the sweep claim in `wave.spec.ts` and commit the sweep script that produced it. (§6)
