# The Memory Response Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put earned immunity on the board — tagging calls help, help arrives beside the cells the player placed, and what it does depends on how well the body knows the strain.

**Architecture:** Arrivals are *environment*, not board: a deterministic function of the case, the profile's immunity and the run's seed, so the board sweep's enumeration never changes. Everything lands behind one flag that defaults **off**, so no measured number moves until the instrument says what the feature is worth. The last three tasks turn it on, measure it, and re-tune the season.

**Tech Stack:** TypeScript 5.9, React 19 + Ionic, Pixi 8 for the board, Vitest for units, Playwright for end-to-end, the existing seeded `createRng` for every roll.

## Global Constraints

- `src/game/**` may not import from `render/`, `app/` or `theme/`, and may not touch `window`, `document`, `Math.random`, `Math.hypot` or `Date.now`. Enforced by `eslint.config.js` and `tsconfig.game.json`; `tests/lint/boundaries.test.ts` proves it. `npm run verify` includes `typecheck:game` — it is the gate, and it has been silently red before.
- Every roll uses `createRng(state)` and writes `rng.state` back, on **every** return path. A run replays identically from its seed or every number this plan produces is noise.
- Structural invariants only in `content.invariants.test.ts` — never a gameplay value.
- Comments explain *why*, never *what*. Copy never scolds; no exclamation marks, no emoji.
- **No balance number is chosen by feel.** Every constant this plan introduces is measured by Task 9 and its measurement written beside it, exactly as `cases.ts` and `rules.ts` already record theirs.
- **Every constant lands in `rules.ts` in the task that first reads it**, carrying a placeholder value and a comment saying Task 9 measures it. `MOUNT_CLUSTER_RADIUS` arrives in Task 2, `RECOGNITION_PER_CALL` and `RESPONSE_PER_CLEAR` in Task 4, `ARRIVAL_USES` in Task 5. A task that references a constant no earlier task created will not compile, and a task that quietly inlines a number instead of naming it has hidden a dial from the sweep that has to find it.
- **The test helpers the task code below calls** — `armed`, `arrivedAt`, `mountPosition`, `everSendsKiller` — are yours to write in `arrivals.test.ts`. They are named rather than spelled out because each is two lines of fixture; keep them in the shape `src/game/testing.ts` already uses, and put them there instead if a second file needs them.
- **Arrivals stay off until Task 9.** Tasks 2–8 build behind `ARRIVALS_ENABLED = false`, so `npm run sweep` reports the eleven shipped rates unchanged at every commit before then. Any task that moves a rate before Task 9 has a bug.
- Commit after every task; `npm run verify` green before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `tests/sweep/playBoard.ts` | *modify* — an arrivals axis, crossed the way `MaturationPolicy` already is |
| `src/game/content/rules.ts` | *modify* — the feature's constants, all measured in Task 9 |
| `src/game/content/cases.ts` | *modify* — mount points per case; the retune in Task 10 |
| `src/game/coverage.ts` | *reused* — mount points answer to the same dwell measure as build spots |
| `src/game/arrivals.ts` | *create* — recognition, the roll, what arrives and what it does |
| `src/game/types.ts` | *modify* — `Arrival`, and `SimState` carries recognition and arrivals |
| `src/game/systems/damage.ts` | *modify* — arrivals act in the same pass the cells do |
| `src/game/systems/spawn.ts` | *unchanged* — arrivals are not enemies and do not share its queue |
| `src/render/layers/ArrivalLayer.ts` | *create* — help coming, and help spending itself |
| `tests/sweep/arrivals.sweep.ts` | *create* — what the response is worth, per case and per strain |

---

## Phase 1 — The instrument, before the feature

### Task 1: An arrivals axis on the board sweep

**Files:**
- Modify: `tests/sweep/playBoard.ts`, `src/game/content/rules.ts`
- Test: `tests/sweep/playBoard.test.ts`

**Interfaces:**
- Produces: `ARRIVALS_ENABLED: boolean` in `rules.ts`; `ArrivalPolicy = 'none' | 'earned'`; `playBoard(caseId, daysElapsed, board, maturation, kinds, arrivals)`

The design's own conclusion is that this needs an axis on an instrument that exists, not a new instrument — and that the axis comes first, so nothing is ever tuned against a game the harness cannot see.

- [ ] **Step 1: Write the failing test**

```ts
describe('the arrivals axis', () => {
  /**
   * The axis has to be a real parameter before anything reads it, so every number recorded from
   * here on says which side of it it was measured on. Under `'none'` the harness plays the game
   * that shipped, which is what every rate in `cases.ts` was measured against.
   */
  it('plays the shipped game under none, whatever the flag says', () => {
    const board = boardOf('phago');
    expect(playBoard(CASE_ID, CLEARED, board, 'never', EVERY_GROWABLE, 'none'))
      .toEqual(playBoard(CASE_ID, CLEARED, board, 'never', EVERY_GROWABLE, 'none'));
  });

  it('is off by default, so no recorded rate moves before it is measured', () => {
    expect(ARRIVALS_ENABLED).toBe(false);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sweep/playBoard.test.ts -t 'arrivals axis'`
Expected: FAIL — `playBoard` takes five arguments.

- [ ] **Step 3: Implement**

Add the sixth parameter to `playBoard` and thread it into `createSimState` as `arrivals`. Document it in the same voice as `MaturationPolicy`: state what each value models and that `'none'` is the game every recorded rate belongs to. In `rules.ts`:

```ts
/**
 * Whether earned immunity sends help to the board at all.
 *
 * Off until `tests/sweep/arrivals.sweep.ts` has measured what turning it on is worth, because the
 * eleven clear rates in `cases.ts` were every one of them measured without it. A feature that
 * changes every number in the project may not arrive before the instrument that can see it.
 */
export const ARRIVALS_ENABLED = false;
```

- [ ] **Step 4: Run the suite and the sweep**

Run: `npm run verify`, then `SWEEP_CASES=forearm npm run sweep`
Expected: green; forearm still 34/243 (14.0%).

- [ ] **Step 5: Commit**

```bash
git add tests/sweep src/game/content/rules.ts
git commit -m "Give the board sweep an axis for help it did not buy"
```

---

## Phase 2 — The model

### Task 2: Mount points, and the floor they answer to

**Files:**
- Modify: `src/game/content/cases.ts`, `src/game/content/content.invariants.test.ts`

**Interfaces:**
- Produces: `CaseDefinition.mounts: readonly Point[]`

- [ ] **Step 1: Write the failing test**

```ts
describe('mount points', () => {
  /**
   * Help that arrives where nothing can happen is decoration. The same measure that keeps a build
   * spot honest keeps a mount point honest — `coverage.ts` is the shared definition, and this is
   * the floor from the build-spot block applied one tier out.
   */
  it('puts every mount point over a stretch of vessel something could act on', () => {
    const cheapest = Object.values(DEFENDERS).reduce((a, b) => (a.cost <= b.cost ? a : b));
    for (const c of CASES) {
      c.mounts.forEach((mount, index) => {
        expect(
          dwellSeconds(mount, c.path, cheapest.range),
          `${c.id} mount ${String(index)} covers nothing worth arriving at`,
        ).toBeGreaterThanOrEqual(1);
      });
    }
  });

  /**
   * Clustered on the build spots, because the body reinforces where the player committed. A mount
   * point far from every spot is help arriving where nothing exploits it.
   */
  it('clusters every mount point near a build spot', () => {
    for (const c of CASES) {
      c.mounts.forEach((mount, index) => {
        const nearest = Math.min(...c.spots.map(([x, y]) => Math.hypot(x - mount[0], y - mount[1])));
        expect(nearest, `${c.id} mount ${String(index)} is ${nearest.toFixed(0)} from any spot`)
          .toBeLessThanOrEqual(MOUNT_CLUSTER_RADIUS);
      });
    }
  });

  it('gives every case at least one', () => {
    for (const c of CASES) expect(c.mounts.length).toBeGreaterThan(0);
  });
});
```

`Math.hypot` is banned in `src/game/**` but this is a test file under `src/game/content/` — check `eslint.config.js` before using it, and use `distance` from `state.ts` if the rule applies.

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — `mounts` does not exist on `CaseDefinition`.

- [ ] **Step 3: Implement**

Add `mounts` to `CaseDefinition` and author them for all eleven cases. Use the grid-search method recorded in `2026-07-31-season-shape-review.md` §5, with the target being coverage rather than a matched profile: search positions within `MOUNT_CLUSTER_RADIUS` of a build spot that clear the dwell floor, and take the best-spread set. Two per case is the starting number; Task 9 measures whether that is right.

- [ ] **Step 4: Verify**

Run: `npm run verify`, then `npm run sweep` unfiltered.
Expected: green; all eleven rates unmoved — nothing reads `mounts` yet.

- [ ] **Step 5: Commit**

```bash
git add src/game/content
git commit -m "Author the places help can arrive"
```

---

### Task 3: Recognition — what tagging accumulates

**Files:**
- Create: `src/game/arrivals.ts`, `src/game/arrivals.test.ts`
- Modify: `src/game/types.ts`, `src/game/systems/damage.ts`

**Interfaces:**
- Produces: `SimState.recognition: Partial<Record<StrainId, number>>`, `noteRecognition(state, enemy)`

- [ ] **Step 1: Write the failing test**

```ts
describe('recognition', () => {
  it('counts a tagged body toward the strain it belongs to', () => {
    const state = simFor('forearm', { immunity: { staph: IMMUNITY_MAX } });
    const enemy = addEnemy(state, 'staph');

    noteRecognition(state, enemy);

    expect(state.recognition.staph).toBe(1);
  });

  /**
   * No memory, no secondary response — the formula says it and no special case is needed. A body
   * the profile has never beaten three times still gets marked, it just calls nothing.
   */
  it('counts nothing for a strain the body has no memory of', () => {
    const state = simFor('forearm', { immunity: { staph: 0 } });
    noteRecognition(state, addEnemy(state, 'staph'));
    expect(state.recognition.staph ?? 0).toBe(0);
  });

  /** Only strains are tracked. A pollen or a toxin is not something a vaccine was ever earned for. */
  it('counts nothing for a body no vaccine exists for', () => {
    const state = simFor('sinus', { immunity: { staph: IMMUNITY_MAX } });
    noteRecognition(state, addEnemy(state, 'pollen'));
    expect(Object.values(state.recognition).every((value) => (value ?? 0) === 0)).toBe(true);
  });

  /** Across waves, like the allergy rule's counter: a running total of the response, not of a wave. */
  it('carries across a wave boundary', () => {
    const state = simFor('forearm', { immunity: { staph: IMMUNITY_MAX } });
    noteRecognition(state, addEnemy(state, 'staph'));
    startWave(state);
    expect(state.recognition.staph).toBe(1);
  });

  /**
   * The amnesia rule, and the most dramatic thing it could possibly do — for free.
   *
   * `createSimState` masks the wiped strain to zero at the boundary, and this reads `state.immunity`
   * like everything else, so help for that strain stops arriving without a single line knowing the
   * rule exists. Asserted rather than assumed, because it is also the most confusing thing the rule
   * could do if it happened by accident: the case that takes your memory away is the case where the
   * body stops answering.
   */
  it('sends nothing for a strain an amnesia case has taken away', () => {
    const wiping = CASES.find((c) => caseHasRule(c, 'amnesia'));
    expect(wiping, 'no amnesia case in the season').toBeDefined();
    if (wiping?.wipes === undefined) return;

    const held = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX };
    const state = simFor(wiping.id, { immunity: held });
    noteRecognition(state, addEnemy(state, wiping.wipes));

    expect(state.recognition[wiping.wipes] ?? 0).toBe(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — cannot resolve `./arrivals`.

- [ ] **Step 3: Implement**

`noteRecognition` is called from the antibody's `tag` pass in `damage.ts`, at the point a mark is actually laid — not where one is attempted, so a body already carrying a mark counts nothing. `PathogenKind` and `StrainId` overlap on three members; the mapping is that overlap and nothing else, which is what makes this checkable without a second table.

- [ ] **Step 4: Verify**

Run: `npm run verify`
Expected: green. The golden snapshot must **not** move — recognition is a counter nothing reads yet, and `hashState` does not hash it until Task 4.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "Let a mark be remembered by the strain it was laid on"
```

---

### Task 4: The roll, and an arrival

**Files:**
- Modify: `src/game/arrivals.ts`, `src/game/types.ts`, `src/game/hash.ts`
- Test: `src/game/arrivals.test.ts`

**Interfaces:**
- Produces: `Arrival`, `callArrivals(state): void`

- [ ] **Step 1: Write the failing test**

```ts
describe('calling for help', () => {
  /** The threshold is the whole of the pacing: below it nothing is spent and nothing is rolled. */
  it('rolls nothing until recognition reaches the threshold', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL - 1 });
    const before = state.rngState;
    callArrivals(state);
    expect(state.arrivals).toEqual([]);
    expect(state.rngState, 'a roll was spent below the threshold').toBe(before);
  });

  it('spends the threshold and rolls once it is reached', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL });
    callArrivals(state);
    expect(state.recognition.staph).toBe(0);
    expect(state.rngState).not.toBe(0);
  });

  /**
   * A rate, not a draw: one roll proves nothing about a probability. Walked over many seeds, a body
   * that knows a strain calls help more often than one that half knows it.
   */
  it('calls help more often the better the body knows the strain', () => {
    const rate = (memory: number): number => {
      let called = 0;
      for (let seed = 1; seed <= 400; seed += 1) {
        const state = armed({ recognition: RECOGNITION_PER_CALL, memory, rngState: seed });
        callArrivals(state);
        if (state.arrivals.length > 0) called += 1;
      }
      return called;
    };

    expect(rate(IMMUNITY_MAX)).toBeGreaterThan(rate(1));
    expect(rate(0), 'no memory called help').toBe(0);
  });

  it('never puts two arrivals on one mount point', () => {
    const state = armed({ recognition: RECOGNITION_PER_CALL * 20 });
    for (let call = 0; call < 20; call += 1) callArrivals(state);
    const used = state.arrivals.map((arrival) => arrival.mountIndex);
    expect(new Set(used).size).toBe(used.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — `callArrivals is not a function`.

- [ ] **Step 3: Implement**

The roll runs off `state.rngState` and writes it back on every path, including the paths where nothing arrives — a generator consumed without its state stored makes a run unreplayable, and `seedOutbreak` in `front.ts` is the pattern.

Add `arrivals` and `recognition` to `hashState`, for the same reason `inflammation` is hashed: two runs identical in every other field and one call apart are different games.

- [ ] **Step 4: Verify**

Run: `npm run verify`, and re-bless the golden snapshot (`npx vitest run src/game/golden.test.ts -u`) — the hash gains two fields, so the change is expected and the diff should be reviewed rather than waved through.

- [ ] **Step 5: Commit**

```bash
git add src/game
git commit -m "Answer a call for help, or roll and find nothing came"
```

---

### Task 5: Antibodies arrive, and are spent

**Files:**
- Modify: `src/game/arrivals.ts`, `src/game/systems/damage.ts`
- Test: `src/game/arrivals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('an antibody arrival', () => {
  it('marks bodies in reach of the mount point it landed on', () => {
    const state = arrivedAt(0, 'antibody');
    const near = addEnemy(state, 'staph', mountPosition(state, 0));
    const far = addEnemy(state, 'staph', { x: 0, y: 0 });

    stepArrivals(state, STEP_SECONDS);

    expect(isTagged(near)).toBe(true);
    expect(isTagged(far)).toBe(false);
  });

  /**
   * Ammunition, not a timer. Against a particulate target an antibody is degraded with what it
   * bound, so each mark spends one use and the arrival leaves when it is out — and the player can
   * count what is left rather than guessing at a clock they cannot see.
   */
  it('spends one use per body it marks, and leaves when it is out', () => {
    const state = arrivedAt(0, 'antibody');
    for (let i = 0; i < ARRIVAL_USES; i += 1) addEnemy(state, 'staph', mountPosition(state, 0));

    stepArrivals(state, STEP_SECONDS);

    expect(state.arrivals).toEqual([]);
  });

  it('never spends a use on a body already carrying a mark', () => {
    const state = arrivedAt(0, 'antibody');
    const enemy = addEnemy(state, 'staph', mountPosition(state, 0));
    enemy.tag = DEFENDERS.anti.tag;

    stepArrivals(state, STEP_SECONDS);

    expect(state.arrivals[0]?.uses).toBe(ARRIVAL_USES);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — `stepArrivals is not a function`.

- [ ] **Step 3: Implement**

Arrivals act in the same pass the cells do, from `step`, so an arrival and a cell cannot disagree about the order of a frame. A mark laid by an arrival is the same mark the antibody lays — same field, same duration — so everything downstream that reads `isTagged` gets it for free.

- [ ] **Step 4: Verify and commit**

Run: `npm run verify`; re-bless golden if the trajectory moves, and say why in the commit.

```bash
git commit -m "Land help that marks, and spends itself doing it"
```

---

### Task 6: Killers arrive, and can only kill what is marked

**Files:**
- Modify: `src/game/arrivals.ts`, `src/game/content/rules.ts`
- Test: `src/game/arrivals.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
describe('a killer arrival', () => {
  /**
   * ADCC, and the guardrail the whole design rests on. A free killer that could hit anything would
   * stack with every board and make placement matter less; one that can only touch what is marked
   * is worth exactly what the player's own tagging makes it worth.
   */
  it('kills a marked body and cannot touch an unmarked one', () => {
    const state = arrivedAt(0, 'killer');
    const marked = addEnemy(state, 'staph', mountPosition(state, 0));
    const bare = addEnemy(state, 'staph', mountPosition(state, 0));
    marked.tag = DEFENDERS.anti.tag;
    const bareHp = bare.hp;

    stepArrivals(state, STEP_SECONDS);

    expect(marked.hp).toBeLessThan(marked.maxHp);
    expect(bare.hp, 'an unmarked body was hit').toBe(bareHp);
  });

  it('spends nothing on a board with nothing marked', () => {
    const state = arrivedAt(0, 'killer');
    addEnemy(state, 'staph', mountPosition(state, 0));
    stepArrivals(state, STEP_SECONDS);
    expect(state.arrivals[0]?.uses).toBe(ARRIVAL_USES);
  });

  /**
   * What memory buys, and it comes from the biology rather than being assigned: a first exposure
   * produces IgM, and IgG — the isotype ADCC runs on — is what repeat exposure produces.
   */
  it('is only ever sent to a body that has finished the strain', () => {
    for (let memory = 0; memory < IMMUNITY_MAX; memory += 1) {
      expect(arrivalKindFor(memory), `${String(memory)} clears sent a killer`).not.toBe('killer');
    }
    expect(everSendsKiller(IMMUNITY_MAX)).toBe(true);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Expected: FAIL — `arrivalKindFor is not a function`.

- [ ] **Step 3: Implement**

The mix is a function of memory alone: below `IMMUNITY_MAX` only antibodies are sent; at it, both. Do not add a second constant for the ratio until Task 9 says one is needed.

- [ ] **Step 4: Verify and commit**

```bash
git commit -m "Send killers that answer to a mark, and nothing else"
```

---

## Phase 3 — Seeing it

### Task 7: Help arriving, and running out

**Files:**
- Create: `src/render/layers/ArrivalLayer.ts`, `src/render/layers/ArrivalLayer.test.ts`
- Modify: `src/render/BoardRenderer.ts`, `src/render/effects.ts`

- [ ] **Step 1: Write the failing test**

Follow `TowerLayer.test.ts`'s shape: build a state with an arrival, draw, and assert the layer drew something at the mount position; age it past its life and assert it stopped.

- [ ] **Step 2–4: Implement, verify, commit**

Two readings, in the vocabulary the board already speaks. **The entrance** is a moment — it fires on a discrete event the player caused, so it lands on a beat they will connect to their own tagging. Reuse `growthRingRadius`'s inward-closing shape if it fits; a new expanding front would read as a burst, which means something else on this board. **What is left** is a count: an arrival with two uses must look different from one with five, because ammunition the player cannot count is a timer wearing a different hat.

Reduced motion drops the entrance and keeps the count.

---

### Task 8: A brief that says what the body will do

**Files:**
- Modify: `src/app/components/Brief.tsx`, `src/app/components/Brief.test.tsx`

The brief already shows the held copy for the strain a case credits. Extend it to say what memory will actually send against *this* wave table — nothing, marks, or marks and killers — derived from the profile and the strains the case sends rather than written per case.

A `novel` case shows nothing here, for the same reason it shows no wave table.

---

## Phase 4 — Measuring it, then paying for it

### Task 9: What the response is worth

**Files:**
- Create: `tests/sweep/arrivals.sweep.ts`, `vitest.sweep-arrivals.config.ts`
- Modify: `package.json`, `src/game/content/rules.ts`

- [ ] **Step 1: Build the comparison**

Cross every case with `ArrivalPolicy` and with the immunity the strain could be at, and report **the difference** — that difference is what the memory response is worth, per case and per strain. `maturation.sweep.ts` is the model for the shape, including its rule that a comparison narrowing its own coverage must log what it skipped.

- [ ] **Step 2: Choose the constants**

`RECOGNITION_PER_CALL`, `RESPONSE_PER_CLEAR`, `ARRIVAL_USES`, `MOUNT_CLUSTER_RADIUS`, and the number of mount points per case. For each: sweep a spread, report what a step is worth, choose, and write the measurement into `rules.ts` beside the constant.

**A target to defend rather than assume:** help should be worth enough that a player notices holding a vaccine, and not so much that the board stops being the decision. State the number you are aiming at and show the measurement that meets it.

- [ ] **Step 3: Turn it on**

`ARRIVALS_ENABLED = true`, with the measurement that justified it in the comment.

- [ ] **Step 4: Commit**

```bash
git commit -m "Measure what earned immunity is worth on a board"
```

---

### Task 10: Re-tune the season

**Files:**
- Modify: `src/game/content/cases.ts`

Every one of the eleven rates moves once arrivals are on — free marks make phagocytes better and the antibody less mandatory, free kills move it further. Re-tune each case back inside the 5–15% band with both curve checks passing, and record what each lever was worth in the case's own comment, as every tuning in that file already does.

Expect the levers to behave as `2026-07-31-season-shape-review.md` §6 records: spot offset dominates, early-wave mass is income rather than difficulty, and a poison case has an interior optimum.

**Do not** reach for `ARRIVALS_ENABLED` to make a case behave. It is a feature flag for staging this plan, not a balance dial.

---

### Task 11: Re-measure the run

**Files:**
- Modify: `src/game/content/rules.ts`, `tests/sweep/runSweep.ts`

Easier cases mean more ground held, which changes how often a wall stands and how often the core is reached — so the front line's four pacing numbers answer to this too. Re-run `npm run sweep:runs` and report whether `OUTBREAK_INTERVAL`, `SIEGE_BASE_DAYS`, `DOOR_RESIST_PER_CLEAR` and the heart's difficulty still hold. Move only what the measurement says to move, and record the new reading beside the old.

The run sweep's own report already carries the shipped season's shape; update it, and say which way arrivals moved each figure.

---

## What this plan does not build

Nothing is deferred out of it. The one thing deliberately left alone is the arrival *fiction* beyond
what the biology gives: no third arrival kind, no complement, no affinity maturation as a separate
stat. Three effects from one number is the design; a fourth would be a new idea and wants its own
document.
