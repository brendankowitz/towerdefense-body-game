# The Front Line Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the map from a menu into a front line — outbreaks enter at the body's doors, walk toward the heart one step a day against the player's one action a day, and immunity becomes the thing that keeps ground held.

**Architecture:** A new pure module `src/game/front.ts` holds the whole layer as data and total functions over it, in the same style as `progression.ts`: the simulation never sees it, the screens read it, and only its own functions write it. The body graph gains one flag and a breadth-first distance-to-core helper. The front is persisted inside `Profile`, which means a storage version bump. Nothing inside a fight changes.

**Tech Stack:** TypeScript 5.9, React 19 + Ionic for the screens, Vitest for units, Playwright for end-to-end, the existing seeded `createRng` for every roll.

## Global Constraints

- `src/game/**` may not import from `render/`, `app/` or `theme/`, and may not touch `window`, `document`, `Math.random`, `Math.hypot` or `Date.now`. Enforced by `eslint.config.js` and `tsconfig.game.json`; `tests/lint/boundaries.test.ts` proves it.
- Every roll uses `createRng(state)` and writes `rng.state` back, exactly as `scheduleDormancy` does. A run must replay identically from its seed.
- Structural invariants only in `content.invariants.test.ts` — never a gameplay value. A balance pass must be able to change every number in `content/` without turning the suite red.
- Copy rules: no exclamation marks, no emoji, never scold the player. Asserted for case copy in `content.invariants.test.ts`.
- Pacing numbers (seed interval, resistance per clear, door chance) are **placeholders until Task 13 measures them**. Do not tune them by feel; the task that measures them is in this plan.
- Commit after every task. Run `npm run verify` before every commit.

---

## File Structure

| File | Responsibility |
|---|---|
| `src/game/content/body.ts` | *modify* — one flag per node: which regions are doors |
| `src/game/graph.ts` | *create* — the body as a graph: neighbours, steps to the core |
| `src/game/front.ts` | *create* — the front line: state, the sickness's turn, win and loss |
| `src/game/content/rules.ts` | *modify* — the layer's constants, named in one place |
| `src/game/progression.ts` | *modify* — `Profile` carries the front; day-based unlock helper |
| `src/game/commands.ts` | *modify* — `isUnlocked` reads days rather than clears |
| `src/game/systems/stats.ts` | *modify* — `maturationOffer` reads days rather than clears |
| `src/progress/parseProfile.ts` | *modify* — parse and range-check the front; version bump |
| `src/app/components/BodyMap.tsx` | *modify* — draw infected, held, besieged |
| `src/app/pages/MapPage.tsx` | *modify* — choose a front to fight; shore up |
| `src/app/pages/FightPage.tsx` | *modify* — a win holds a region, a loss ends the day |
| `src/app/components/Season.tsx` | *modify* — a record of the run, not a forecast |
| `src/game/content/vaccines.ts` | *modify* — earned, never bought |
| `src/game/content/cases.ts` | *modify* — the heart case |
| `tests/sweep/runSweep.ts` | *create* — plays whole runs; the pacing instrument |

---

## Phase 1 — The model

### Task 1: The body's doors

**Files:**
- Modify: `src/game/content/body.ts`
- Test: `src/game/content/content.invariants.test.ts`

**Interfaces:**
- Produces: `BodyNode.entry?: true`, `ENTRY_REGIONS: readonly BodyNode[]`, `INTERIOR_REGIONS: readonly BodyNode[]`

- [ ] **Step 1: Write the failing test**

In `content.invariants.test.ts`, inside `describe('body graph coherence')`:

```ts
  /**
   * Every region a case can be fought over is either a door illness comes in at or somewhere it
   * only reaches by spreading. Naming the doors here rather than deriving them is deliberate: the
   * front line's whole shape is which nodes can seed an outbreak, so it answers to a decision
   * rather than to whatever the table currently says.
   */
  it('sorts every case-bearing region into a door or an interior', () => {
    const doors = ENTRY_REGIONS.map((n) => n.id).sort();
    expect(doors).toEqual(
      ['footL', 'footR', 'forearm', 'handR', 'sinus', 'stomach', 'throat'].sort(),
    );

    const interior = INTERIOR_REGIONS.map((n) => n.id).sort();
    expect(interior).toEqual(['gut', 'lungL', 'lungR'].sort());

    expect(doors.length + interior.length).toBe(CASE_REGIONS.length);
    for (const id of doors) expect(interior).not.toContain(id);
  });
```

Add `ENTRY_REGIONS, INTERIOR_REGIONS` to the existing `./body` import.

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/content/content.invariants.test.ts -t 'door or an interior'`
Expected: FAIL — `ENTRY_REGIONS is not defined`.

- [ ] **Step 3: Implement**

In `body.ts`, add to the `BodyNode` interface:

```ts
  /**
   * A door: somewhere illness gets into the body from outside, and so somewhere an outbreak can
   * start. The case fiction already says which these are — a kitchen knife, new boots, the
   * shellfish, grass season — and the regions without it are the ones whose stories are about
   * something that came from somewhere else and settled.
   *
   * Never on the core and never on a joint; `content.invariants.test.ts` holds that.
   */
  readonly entry?: true;
```

Add `entry: true` to `sinus`, `throat`, `stomach`, `forearm`, `handR`, `footL`, `footR`. Then:

```ts
/** Regions an outbreak can start in. */
export const ENTRY_REGIONS: readonly BodyNode[] = CASE_REGIONS.filter((n) => n.entry === true);

/** Regions the sickness can only reach by spreading into them. */
export const INTERIOR_REGIONS: readonly BodyNode[] = CASE_REGIONS.filter((n) => n.entry !== true);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/content/content.invariants.test.ts`
Expected: PASS, all tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/content/body.ts src/game/content/content.invariants.test.ts
git commit -m "Name the doors illness comes in at"
```

---

### Task 2: How far anything is from the core

**Files:**
- Create: `src/game/graph.ts`
- Test: `src/game/graph.test.ts`

**Interfaces:**
- Produces: `neighboursOf(node: BodyNodeId): readonly BodyNodeId[]`, `stepsToCore(node: BodyNodeId): number`, `CORE_ROADS: readonly BodyNodeId[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { BODY_NODES } from './content/body';
import { CORE_ROADS, neighboursOf, stepsToCore } from './graph';

describe('the body as a graph', () => {
  it('gives the core a distance of nothing to itself', () => {
    expect(stepsToCore('heart')).toBe(0);
  });

  it('counts the steps a spreading sickness would actually take', () => {
    // heart → shoulder → forearm, and heart → stomach → gut → kneeL → footL.
    expect(stepsToCore('shoulder')).toBe(1);
    expect(stepsToCore('forearm')).toBe(2);
    expect(stepsToCore('footL')).toBe(4);
  });

  it('reaches every node in the body, so nothing is unreachable scenery', () => {
    for (const node of BODY_NODES) {
      expect(Number.isFinite(stepsToCore(node.id)), `${node.id} is cut off`).toBe(true);
    }
  });

  it('links are two-way — a neighbour of mine has me as a neighbour', () => {
    for (const node of BODY_NODES) {
      for (const other of neighboursOf(node.id)) {
        expect(neighboursOf(other), `${node.id} and ${other} disagree`).toContain(node.id);
      }
    }
  });

  /** What the heart falls to: everything one step from it, joints included. */
  it('names every road to the core', () => {
    expect([...CORE_ROADS].sort())
      .toEqual(['lungL', 'lungR', 'shoulder', 'shoulderR', 'stomach', 'throat'].sort());
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/graph.test.ts`
Expected: FAIL — cannot resolve `./graph`.

- [ ] **Step 3: Implement**

```ts
import { BODY_LINKS, BODY_NODES } from './content/body';
import type { BodyNodeId } from './types';

/**
 * The body as a graph, which is what the front line walks over.
 *
 * Built once at module load from `BODY_LINKS`, because the body does not change during a run and
 * the sickness asks these questions every day. Lives beside `progression.ts` rather than in
 * `content/` for the same reason `coverage.ts` does: it is a fact derived from content, not content.
 */
const ADJACENCY: ReadonlyMap<BodyNodeId, readonly BodyNodeId[]> = (() => {
  const map = new Map<BodyNodeId, BodyNodeId[]>();
  for (const node of BODY_NODES) map.set(node.id, []);
  for (const [from, to] of BODY_LINKS) {
    map.get(from)?.push(to);
    map.get(to)?.push(from);
  }
  return map;
})();

export function neighboursOf(node: BodyNodeId): readonly BodyNodeId[] {
  return ADJACENCY.get(node) ?? [];
}

/** The core, and the thing every distance here is measured to. */
const CORE: BodyNodeId = 'heart';

/**
 * Steps from each node to the core, breadth-first. Infinity for a node the links never reach,
 * which `graph.test.ts` refuses to allow — an unreachable region is one the sickness can never
 * take and the player can therefore never lose.
 */
const DISTANCE: ReadonlyMap<BodyNodeId, number> = (() => {
  const distance = new Map<BodyNodeId, number>([[CORE, 0]]);
  const queue: BodyNodeId[] = [CORE];
  let current: BodyNodeId | undefined;
  while ((current = queue.shift()) !== undefined) {
    const step = (distance.get(current) ?? 0) + 1;
    for (const next of neighboursOf(current)) {
      if (distance.has(next)) continue;
      distance.set(next, step);
      queue.push(next);
    }
  }
  return distance;
})();

export function stepsToCore(node: BodyNodeId): number {
  return DISTANCE.get(node) ?? Number.POSITIVE_INFINITY;
}

/**
 * Every road to the core. The heart falls when the sickness holds all of them at once — not to a
 * single breach and not to a countdown, which is what makes the run a campaign and gives the
 * player one defensive rule they can hold in their head: keep a road open.
 */
export const CORE_ROADS: readonly BodyNodeId[] = neighboursOf(CORE);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/graph.test.ts`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/graph.ts src/game/graph.test.ts
git commit -m "Measure the body in steps to the heart"
```

---

### Task 3: The front, as data

**Files:**
- Create: `src/game/front.ts`
- Modify: `src/game/content/rules.ts`
- Test: `src/game/front.test.ts`

**Interfaces:**
- Produces: `Front`, `RegionState`, `createFront(seed: number): Front`, `stateOf(front: Front, node: BodyNodeId): RegionState`, `hotCases(front: Front): readonly CaseId[]`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { CASE_REGIONS } from './content/body';
import { createFront, hotCases, stateOf } from './front';

const SEED = 7;

describe('a fresh front', () => {
  it('starts with one region under attack and everything else untouched', () => {
    const front = createFront(SEED);
    const hot = CASE_REGIONS.filter((n) => stateOf(front, n.id) === 'hot');
    expect(hot).toHaveLength(1);
    expect(hotCases(front)).toHaveLength(1);
  });

  it('starts the sickness at a door, never somewhere it could not have got in', () => {
    const front = createFront(SEED);
    const [first] = front.infected;
    expect(first).toBeDefined();
    const node = CASE_REGIONS.find((n) => n.id === first);
    expect(node?.entry, 'the sickness started somewhere it could not have entered').toBe(true);
  });

  it('holds nothing and has spent no days', () => {
    const front = createFront(SEED);
    expect(front.held).toEqual([]);
    expect(front.day).toBe(1);
  });

  it('reads every other region as cold, including the core', () => {
    const front = createFront(SEED);
    expect(stateOf(front, 'heart')).toBe('cold');
    expect(stateOf(front, 'footR')).toBe('cold');
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/front.test.ts`
Expected: FAIL — cannot resolve `./front`.

- [ ] **Step 3: Implement the constants**

In `content/rules.ts`:

```ts
/**
 * The front line, and every number it runs on. All four are pacing values and pacing is a property
 * of a whole run, so none of them may be chosen by feel — `tests/sweep/runSweep.ts` is the
 * instrument that measures them and the only thing that should move them.
 *
 * `OUTBREAK_INTERVAL` is days between new doors opening. `SIEGE_BASE_DAYS` is how long ground with
 * no immunity behind it holds, so a wall is `SIEGE_BASE_DAYS + response`. `DOOR_RESIST_PER_CLEAR`
 * is the chance one clear of a strain buys that an outbreak of it never takes hold.
 */
export const OUTBREAK_INTERVAL = 4;
export const SIEGE_BASE_DAYS = 1;
export const DOOR_RESIST_PER_CLEAR = 0.25;

/** Bank spent to add one day to a wall. The only thing that competes with fighting for a day. */
export const SHORE_UP_COST = 120;
```

- [ ] **Step 4: Implement the front**

```ts
import { CASE_BY_ID, CASES } from './content/cases';
import { ENTRY_REGIONS } from './content/body';
import { createRng } from './rng';
import type { BodyNodeId, CaseId } from './types';

/**
 * The layer above the fight: which ground the sickness holds, which ground the player does, and
 * what it costs to change either.
 *
 * Pure and total, in the same shape as `progression.ts` — the simulation never reads it, the
 * screens never write it, and every roll runs off `rngState` and writes it back so a whole run
 * replays from its seed. That is what makes `runSweep.ts` able to measure a season at all.
 */
export type RegionState = 'cold' | 'hot' | 'held' | 'besieged';

export interface Front {
  /** Nodes the sickness holds, joints included. */
  readonly infected: readonly BodyNodeId[];
  /** Regions cleared and still standing. */
  readonly held: readonly BodyNodeId[];
  /** Days of wall left on a held region currently under attack. Absent means not under attack. */
  readonly siege: Readonly<Partial<Record<BodyNodeId, number>>>;
  readonly day: number;
  readonly rngState: number;
}

/** The node a case is fought over, by case. Built once; the mapping never changes during a run. */
const NODE_OF: ReadonlyMap<CaseId, BodyNodeId> = new Map(CASES.map((c) => [c.id, c.node]));

const CASE_AT: ReadonlyMap<BodyNodeId, CaseId> = new Map(CASES.map((c) => [c.node, c.id]));

export function caseAt(node: BodyNodeId): CaseId | null {
  return CASE_AT.get(node) ?? null;
}

export function nodeOf(caseId: CaseId): BodyNodeId {
  return NODE_OF.get(caseId) ?? CASE_BY_ID[caseId].node;
}

/**
 * A fresh body, with one outbreak already at a door — the run opens on something happening to you
 * rather than on an empty map with nothing to do.
 */
export function createFront(seed: number): Front {
  const rng = createRng(seed);
  const index = Math.floor(rng.next() * ENTRY_REGIONS.length);
  const door = ENTRY_REGIONS[index] ?? ENTRY_REGIONS[0];
  if (door === undefined) throw new Error('the body has no doors for illness to come in at');

  return {
    infected: [door.id],
    held: [],
    siege: {},
    day: 1,
    rngState: rng.state,
  };
}

export function stateOf(front: Front, node: BodyNodeId): RegionState {
  if (front.infected.includes(node)) return 'hot';
  if (!front.held.includes(node)) return 'cold';
  return front.siege[node] === undefined ? 'held' : 'besieged';
}

/** Every case the player could fight today, in season order so the list is stable to read. */
export function hotCases(front: Front): readonly CaseId[] {
  return CASES.filter((c) => front.infected.includes(c.node)).map((c) => c.id);
}
```

- [ ] **Step 5: Run it to verify it passes**

Run: `npx vitest run src/game/front.test.ts`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add src/game/front.ts src/game/front.test.ts src/game/content/rules.ts
git commit -m "Give the run a front line to fight over"
```

---

### Task 4: The sickness takes a step

**Files:**
- Modify: `src/game/front.ts`
- Test: `src/game/front.test.ts`

**Interfaces:**
- Produces: `stepSickness(front: Front, immunity: Readonly<Record<StrainId, number>>): Front`

- [ ] **Step 1: Write the failing test**

```ts
import { SIEGE_BASE_DAYS } from './content/rules';
import { stepSickness } from './front';
import { stepsToCore } from './graph';

const NO_IMMUNITY = { staph: 0, film: 0, virus: 0 } as const;

describe('the sickness takes one step a day', () => {
  it('moves toward the core rather than wandering', () => {
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = stepSickness(before, NO_IMMUNITY);

    const taken = after.infected.filter((node) => !before.infected.includes(node));
    expect(taken).toHaveLength(1);
    const [next] = taken;
    expect(next).toBeDefined();
    if (next === undefined) return;
    expect(stepsToCore(next)).toBeLessThan(stepsToCore('footL'));
  });

  it('takes exactly one node however many fronts it has', () => {
    const before: Front = {
      infected: ['footL', 'handR', 'sinus'], held: [], siege: {}, day: 1, rngState: 1,
    };
    const after = stepSickness(before, NO_IMMUNITY);
    expect(after.infected).toHaveLength(before.infected.length + 1);
  });

  /** Held ground is a wall: the step is spent on the siege and takes no new ground. */
  it('cannot walk through ground the player holds', () => {
    const before: Front = { infected: ['shoulder'], held: ['heart'], siege: {}, day: 1, rngState: 1 };
    const after = stepSickness(before, NO_IMMUNITY);

    expect(after.infected).toEqual(before.infected);
    expect(after.siege.heart).toBe(SIEGE_BASE_DAYS - 1 + 0);
  });

  it('takes a wall once its days run out, and the region stops being held', () => {
    const under: Front = { infected: ['shoulder'], held: ['heart'], siege: { heart: 0 }, day: 1, rngState: 1 };
    const after = stepSickness(under, NO_IMMUNITY);

    expect(after.held).not.toContain('heart');
    expect(after.infected).toContain('heart');
    expect(after.siege.heart).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/front.test.ts -t 'one step a day'`
Expected: FAIL — `stepSickness is not a function`.

- [ ] **Step 3: Implement**

```ts
import { SIEGE_BASE_DAYS } from './content/rules';
import { neighboursOf, stepsToCore } from './graph';
import type { StrainId } from './types';

/** Days a region holds out for: what it was cleared on top of, plus the base every wall has. */
export function wallDays(
  node: BodyNodeId, immunity: Readonly<Record<StrainId, number>>,
): number {
  const caseId = caseAt(node);
  const strain = caseId === null ? null : CASE_BY_ID[caseId].credits;
  return SIEGE_BASE_DAYS + (strain === null ? 0 : immunity[strain]);
}

/**
 * The sickness's whole turn, and deliberately one step however many fronts it has: the day is
 * one-for-one with the player's, so a run is a race rather than a rout. It steps wherever it is
 * closest to the core, which makes it predictable — a player can see which fire is about to get
 * worse and plan against it, and that is the difference between pressure and harassment.
 */
export function stepSickness(
  front: Front, immunity: Readonly<Record<StrainId, number>>,
): Front {
  const options = front.infected
    .flatMap((from) => neighboursOf(from).map((to) => ({ from, to })))
    .filter(({ to }) => !front.infected.includes(to))
    .sort((a, b) => stepsToCore(a.to) - stepsToCore(b.to) || a.to.localeCompare(b.to));

  const move = options[0];
  if (move === undefined) return front;

  if (!front.held.includes(move.to)) {
    return { ...front, infected: [...front.infected, move.to] };
  }

  // A wall. The step is spent on it either way — that is the whole point of holding ground.
  const left = front.siege[move.to] ?? wallDays(move.to, immunity);
  if (left > 0) {
    return { ...front, siege: { ...front.siege, [move.to]: left - 1 } };
  }

  const siege = { ...front.siege };
  delete siege[move.to];
  return {
    ...front,
    infected: [...front.infected, move.to],
    held: front.held.filter((node) => node !== move.to),
    siege,
  };
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/front.test.ts`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/front.ts src/game/front.test.ts
git commit -m "Let the sickness walk toward the heart"
```

---

### Task 5: A new door opens

**Files:**
- Modify: `src/game/front.ts`
- Test: `src/game/front.test.ts`

**Interfaces:**
- Produces: `seedOutbreak(front: Front, immunity: Readonly<Record<StrainId, number>>): Front`

- [ ] **Step 1: Write the failing test**

```ts
import { DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL } from './content/rules';
import { seedOutbreak } from './front';

const FULL_IMMUNITY = { staph: IMMUNITY_MAX, film: IMMUNITY_MAX, virus: IMMUNITY_MAX } as const;

describe('new outbreaks open doors', () => {
  it('opens nothing on a day that is not a seeding day', () => {
    const front: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 3 };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });

  it('opens a door on a seeding day', () => {
    const front: Front = {
      infected: ['footL'], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3,
    };
    const after = seedOutbreak(front, NO_IMMUNITY);
    expect(after.infected.length).toBe(front.infected.length + 1);
  });

  /**
   * The door roll, asserted as a rate rather than as one outcome: a single draw proves nothing
   * about a probability. Walked over many seeds, a body that has met everything three times must
   * shrug off far more than a body that has met nothing.
   */
  it('shrugs off more outbreaks the more immunity the body carries', () => {
    const attempts = 400;
    const caught = (immunity: Readonly<Record<StrainId, number>>): number => {
      let count = 0;
      for (let seed = 1; seed <= attempts; seed += 1) {
        const front: Front = {
          infected: [], held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: seed,
        };
        if (seedOutbreak(front, immunity).infected.length > 0) count += 1;
      }
      return count;
    };

    const naive = caught(NO_IMMUNITY);
    const seasoned = caught(FULL_IMMUNITY);
    expect(naive, 'a body with no immunity should catch nearly everything').toBeGreaterThan(attempts * 0.9);
    expect(seasoned, 'a seasoned body should shrug most of it off').toBeLessThan(naive);
    expect(DOOR_RESIST_PER_CLEAR * IMMUNITY_MAX).toBeLessThanOrEqual(1);
  });

  it('never opens a door the sickness is already standing in', () => {
    const front: Front = {
      infected: ENTRY_REGIONS.map((n) => n.id), held: [], siege: {}, day: OUTBREAK_INTERVAL, rngState: 3,
    };
    expect(seedOutbreak(front, NO_IMMUNITY).infected).toEqual(front.infected);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/front.test.ts -t 'open doors'`
Expected: FAIL — `seedOutbreak is not a function`.

- [ ] **Step 3: Implement**

```ts
import { DOOR_RESIST_PER_CLEAR, IMMUNITY_MAX, OUTBREAK_INTERVAL } from './content/rules';

/**
 * A new outbreak, every `OUTBREAK_INTERVAL` days, at a door the sickness is not already in.
 *
 * The roll is the one place in this layer where luck decides anything, and it is the right place:
 * catching something is exactly what immunity is a chance against. What it may never do is undo
 * work the player did — a wall is days, not a roll — so a bad draw here costs a region the player
 * had not taken yet and never one they had.
 */
export function seedOutbreak(
  front: Front, immunity: Readonly<Record<StrainId, number>>,
): Front {
  if (front.day % OUTBREAK_INTERVAL !== 0) return front;

  const doors = ENTRY_REGIONS.filter((node) => !front.infected.includes(node.id));
  if (doors.length === 0) return front;

  const rng = createRng(front.rngState);
  const door = doors[Math.floor(rng.next() * doors.length)];
  const shrugged = rng.next();
  const rngState = rng.state;
  if (door === undefined) return { ...front, rngState };

  const caseId = caseAt(door.id);
  const strain = caseId === null ? null : CASE_BY_ID[caseId].credits;
  const resistance = strain === null
    ? 0
    : Math.min(1, immunity[strain] * DOOR_RESIST_PER_CLEAR);

  if (shrugged < resistance) return { ...front, rngState };
  return { ...front, infected: [...front.infected, door.id], rngState };
}

/** Named so the roll and the copy that explains it read the same number. */
export const MAX_DOOR_RESISTANCE = Math.min(1, IMMUNITY_MAX * DOOR_RESIST_PER_CLEAR);
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/front.test.ts`
Expected: PASS, 12 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/front.ts src/game/front.test.ts
git commit -m "Open a new door every few days, unless the body knows better"
```

---

### Task 6: Winning, losing, and holding ground

**Files:**
- Modify: `src/game/front.ts`
- Test: `src/game/front.test.ts`

**Interfaces:**
- Produces: `holdRegion(front, node): Front`, `shoreUp(front, node, immunity): Front`, `isCoreBesieged(front): boolean`, `isRunWon(front): boolean`, `isRunLost(front): boolean`, `endDay(front, immunity): Front`

- [ ] **Step 1: Write the failing test**

```ts
import { CASE_REGIONS } from './content/body';
import { CORE_ROADS } from './graph';
import { endDay, holdRegion, isCoreBesieged, isRunWon, shoreUp } from './front';

describe('holding and losing the body', () => {
  it('turns a region the player cleared from hot to held', () => {
    const before: Front = { infected: ['forearm'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = holdRegion(before, 'forearm');
    expect(after.infected).not.toContain('forearm');
    expect(after.held).toContain('forearm');
  });

  it('lifts a siege when the region under it is retaken', () => {
    const before: Front = {
      infected: ['stomach'], held: ['gut'], siege: { gut: 0 }, day: 1, rngState: 1,
    };
    expect(holdRegion(before, 'stomach').siege.gut).toBe(0);
    expect(holdRegion({ ...before, infected: ['gut'] }, 'gut').siege.gut).toBeUndefined();
  });

  it('besieges the core only when every road to it is taken', () => {
    const most: Front = { infected: CORE_ROADS.slice(1), held: [], siege: {}, day: 1, rngState: 1 };
    expect(isCoreBesieged(most)).toBe(false);
    expect(isCoreBesieged({ ...most, infected: [...CORE_ROADS] })).toBe(true);
  });

  it('is won when every region is held at once', () => {
    const all = CASE_REGIONS.map((n) => n.id);
    expect(isRunWon({ infected: [], held: all, siege: {}, day: 9, rngState: 1 })).toBe(true);
    expect(isRunWon({ infected: [], held: all.slice(1), siege: {}, day: 9, rngState: 1 })).toBe(false);
  });

  /**
   * The run ends when the sickness is *on* the core, which it can only be by winning the heart
   * case — being besieged is not being lost, and that gap is the whole last stand.
   */
  it('is lost only once the sickness is standing on the core', () => {
    const besieged: Front = { infected: [...CORE_ROADS], held: [], siege: {}, day: 9, rngState: 1 };
    expect(isCoreBesieged(besieged)).toBe(true);
    expect(isRunLost(besieged)).toBe(false);
    expect(isRunLost({ ...besieged, infected: [...CORE_ROADS, 'heart'] })).toBe(true);
  });

  /**
   * Winning the heart case does not clear the roads — it puts the player on the core, which the
   * sickness then has to break like any other wall. One rule, reused, and it means the last stand
   * buys time rather than resetting the campaign.
   */
  it('turns a won heart case into a wall the sickness has to break again', () => {
    const besieged: Front = { infected: [...CORE_ROADS, 'heart'], held: [], siege: {}, day: 9, rngState: 1 };
    const after = holdRegion(besieged, 'heart');
    expect(isRunLost(after)).toBe(false);
    expect(after.held).toContain('heart');
  });

  it('adds a day to a wall when a region is shored up', () => {
    const front: Front = { infected: [], held: ['throat'], siege: {}, day: 2, rngState: 1 };
    expect(shoreUp(front, 'throat', NO_IMMUNITY).siege.throat)
      .toBe(wallDays('throat', NO_IMMUNITY) + 1);
  });

  it('advances the day, steps the sickness and seeds in one call', () => {
    const before: Front = { infected: ['footL'], held: [], siege: {}, day: 1, rngState: 1 };
    const after = endDay(before, NO_IMMUNITY);
    expect(after.day).toBe(2);
    expect(after.infected.length).toBeGreaterThan(before.infected.length);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/front.test.ts -t 'holding and losing'`
Expected: FAIL — `holdRegion is not a function`.

- [ ] **Step 3: Implement**

```ts
import { CASE_REGIONS } from './content/body';
import { CORE_ROADS } from './graph';

/** A case cleared: the sickness is off that ground and the player is on it. */
export function holdRegion(front: Front, node: BodyNodeId): Front {
  const siege = { ...front.siege };
  delete siege[node];
  return {
    ...front,
    infected: front.infected.filter((id) => id !== node),
    held: front.held.includes(node) ? front.held : [...front.held, node],
    siege,
  };
}

/**
 * The bank's only sink, and the only thing that competes with fighting for a day. Reinforcing
 * ground rather than buying a cell keeps the season screen's rule intact — what immunity does is
 * still earned, and what this buys is time.
 */
export function shoreUp(
  front: Front, node: BodyNodeId, immunity: Readonly<Record<StrainId, number>>,
): Front {
  if (!front.held.includes(node)) return front;
  const left = front.siege[node] ?? wallDays(node, immunity);
  return { ...front, siege: { ...front.siege, [node]: left + 1 } };
}

/** The heart falls to a campaign, never to one breach: every road at once or nothing. */
export function isCoreBesieged(front: Front): boolean {
  return CORE_ROADS.every((road) => front.infected.includes(road));
}

export function isRunWon(front: Front): boolean {
  return CASE_REGIONS.every((node) => front.held.includes(node.id));
}

/**
 * The sickness standing on the core, which it reaches only by winning the case there. Besieged is
 * not lost: every road being taken is what *starts* the last stand, and the gap between the two is
 * the one fight the whole run has been protecting.
 */
export function isRunLost(front: Front): boolean {
  return front.infected.includes('heart');
}

/** The sickness's whole day: it takes its step, then something new may get in. */
export function endDay(front: Front, immunity: Readonly<Record<StrainId, number>>): Front {
  const stepped = stepSickness(front, immunity);
  const advanced = { ...stepped, day: stepped.day + 1 };
  return seedOutbreak(advanced, immunity);
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `npx vitest run src/game/front.test.ts`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add src/game/front.ts src/game/front.test.ts
git commit -m "Hold ground, shore it up, and lose the body when every road falls"
```

---

## Phase 2 — The run carries it

### Task 7: The profile carries the front

**Files:**
- Modify: `src/game/progression.ts`, `src/progress/parseProfile.ts`, `src/progress/ProgressRepository.ts`
- Test: `src/game/progression.test.ts`, `src/progress/parseProfile.test.ts`

**Interfaces:**
- Consumes: `Front`, `createFront`, `holdRegion`, `nodeOf` from Task 3–6
- Produces: `Profile.front: Front`, `clearCase` holds the region it cleared

- [ ] **Step 1: Write the failing test**

In `progression.test.ts`:

```ts
  it('carries a front line from the first day of a new body', () => {
    const profile = createFreshProfile();
    expect(profile.front.day).toBe(1);
    expect(profile.front.infected).toHaveLength(1);
  });

  it('holds the region a cleared case was fought over', () => {
    const profile = createFreshProfile();
    const [firstHot] = hotCases(profile.front);
    expect(firstHot).toBeDefined();
    if (firstHot === undefined) return;

    const after = clearCase(profile, firstHot, 12);
    expect(after.front.held).toContain(nodeOf(firstHot));
    expect(after.front.infected).not.toContain(nodeOf(firstHot));
  });
```

In `parseProfile.test.ts`:

```ts
  it('rejects a save written before the body had a front line', () => {
    const old = JSON.stringify({
      version: 1,
      profile: { cleared: [], immunity: { staph: 0, film: 0, virus: 0 }, day: 3, bank: 400, kills: 9 },
    });
    expect(parseProfile(old)).toBeNull();
  });
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run src/game/progression.test.ts src/progress/parseProfile.test.ts`
Expected: FAIL — `profile.front` is undefined; the old save parses.

- [ ] **Step 3: Implement**

In `progression.ts`, add to `Profile`:

```ts
  /**
   * The run's front line. It lives on the profile because it is what a run *is* now — the day, the
   * ground held and the ground lost — and a save that restored the cleared list without it would
   * put the player back on a map with no sickness on it.
   */
  readonly front: Front;
```

`createFreshProfile` seeds it: `front: createFront(FRESH_PROFILE.seed)`, with `seed` added to `FRESH_PROFILE` in `rules.ts`. `clearCase` gains `front: holdRegion(profile.front, nodeOf(caseId))`.

In `ProgressRepository.ts`, bump `STORAGE_VERSION` to `2`, with a comment naming the reason: a
version-1 save has a cleared list and no front, and restoring it would put the player on a map with
no sickness on it and no day to spend.

In `parseProfile.ts`, beside the checks already there:

```ts
const NODE_IDS = new Set<string>(BODY_NODES.map((node) => node.id));

function parseNodes(value: unknown): BodyNodeId[] | null {
  if (!Array.isArray(value)) return null;
  const nodes: BodyNodeId[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string' || !NODE_IDS.has(entry)) return null;
    nodes.push(entry as BodyNodeId);
  }
  return nodes;
}

/**
 * Total, like everything else here: anything that is not exactly a front is a corrupt save, and
 * the repository already turns null into a fresh body rather than a crash. A siege on ground the
 * save does not claim to hold is the one cross-field check worth making — it is what a
 * hand-edited or half-written save looks like.
 */
function parseFront(value: unknown): Front | null {
  if (typeof value !== 'object' || value === null) return null;
  const raw = value as Record<string, unknown>;

  const infected = parseNodes(raw.infected);
  const held = parseNodes(raw.held);
  if (infected === null || held === null) return null;
  if (typeof raw.day !== 'number' || !Number.isInteger(raw.day) || raw.day < 1) return null;
  if (typeof raw.rngState !== 'number' || !Number.isFinite(raw.rngState)) return null;
  if (typeof raw.siege !== 'object' || raw.siege === null) return null;

  const siege: Partial<Record<BodyNodeId, number>> = {};
  for (const [node, days] of Object.entries(raw.siege)) {
    if (!NODE_IDS.has(node)) return null;
    if (typeof days !== 'number' || !Number.isInteger(days) || days < 0) return null;
    if (!held.includes(node as BodyNodeId)) return null;
    siege[node as BodyNodeId] = days;
  }

  return { infected, held, siege, day: raw.day, rngState: raw.rngState };
}
```

Call it from `parseProfile` and return `null` when it does.

- [ ] **Step 4: Run the suites**

Run: `npx vitest run src/game src/progress`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game/progression.ts src/game/progression.test.ts src/progress
git commit -m "Save the front line with the run it belongs to"
```

---

### Task 8: The dock unlocks on days

**Files:**
- Modify: `src/game/commands.ts`, `src/game/systems/stats.ts`, `src/game/state.ts`, `tests/sweep/playBoard.ts`
- Test: `src/game/commands.test.ts`, `src/game/systems/stats.test.ts`

**Interfaces:**
- Produces: `SimState.day: number` replacing `clearedCount` for unlock decisions

- [ ] **Step 1: Write the failing test**

```ts
  /**
   * A player can now arrive at day-six content having lost twice, and a three-cell dock against it
   * is a loss compounding into a worse one. The body learns whether or not you won.
   */
  it('opens a cell on the day it is due, however few cases were cleared', () => {
    const late = fresh({ day: DEFENDERS.mem.unlock + 1, clearedCount: 0 });
    expect(isUnlocked(late, 'mem')).toBe(true);

    const early = fresh({ day: DEFENDERS.mem.unlock - 1, clearedCount: 99 });
    expect(isUnlocked(early, 'mem')).toBe(false);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/commands.test.ts -t 'on the day it is due'`
Expected: FAIL — `SimInput` has no `day`.

- [ ] **Step 3: Implement**

Add `day: number` to `SimInput` and `SimState`; `isUnlocked` compares `state.day - 1` against `unlock` (day 1 is zero days elapsed); `maturationOffer` takes `daysElapsed` in place of `clearedCount`. `playBoard.ts`'s `unlockedKinds(clearedCount)` becomes `unlockedKinds(daysElapsed)` and the sweep passes the case's index, which is what it already passes — so no recorded rate moves. Update the docstrings in `defenders.ts` and `maturation.ts` to say days rather than clears.

- [ ] **Step 4: Run the full suite and the sweep**

Run: `npm test` then `SWEEP_CASES=forearm npm run sweep`
Expected: PASS; forearm still clears 14.0% of 243 boards.

- [ ] **Step 5: Commit**

```bash
git add src/game tests/sweep
git commit -m "Let the body learn on the days it lived, not the cases it won"
```

---

## Phase 3 — The screens

### Task 9: The map shows the front

**Files:**
- Modify: `src/app/components/BodyMap.tsx`, `src/app/pages/MapPage.tsx`
- Test: `src/app/components/BodyMap.test.tsx`, `src/app/pages/MapPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('draws every state the front line can be in', () => {
    const front: Front = {
      infected: ['sinus'], held: ['forearm'], siege: { forearm: 2 }, day: 5, rngState: 1,
    };
    render(<BodyMap front={front} onSelectCase={noop} />);

    expect(screen.getByTestId('map-node-sinus')).toHaveAttribute('data-state', 'hot');
    expect(screen.getByTestId('map-node-forearm')).toHaveAttribute('data-state', 'besieged');
    expect(screen.getByTestId('map-node-footR')).toHaveAttribute('data-state', 'cold');
  });

  it('says how long a besieged region has left, because that is the decision', () => {
    const front: Front = {
      infected: ['shoulder'], held: ['forearm'], siege: { forearm: 2 }, day: 5, rngState: 1,
    };
    render(<BodyMap front={front} onSelectCase={noop} />);
    expect(screen.getByTestId('map-siege-forearm')).toHaveTextContent('2');
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/components/BodyMap.test.tsx`
Expected: FAIL — `BodyMap` takes `cleared` and `activeNode`, not `front`.

- [ ] **Step 3: Implement**

`BodyMap` takes `front: Front` in place of `cleared` and `activeNode`, and reads `stateOf` directly
so the map and the model can never disagree:

```tsx
  const stateOf = (id: BodyNodeId): NodeState => {
    if (id === 'heart' && !front.infected.includes('heart')) return 'core';
    if (joints.has(id) && !front.infected.includes(id)) return 'link';
    return frontStateOf(front, id);
  };
```

`NodeState` gains `'besieged'`, drawn as held ground wearing the threat ring the map already uses
for a hot node — the same vocabulary, so nothing new has to be learned — with the days left printed
under it:

```tsx
            {state === 'besieged' && (
              <text
                className="mono map-siege"
                data-testid={`map-siege-${node.id}`}
                x={node.x}
                y={node.y + node.r + 16}
                textAnchor="middle"
              >
                {String(front.siege[node.id] ?? 0)}
              </text>
            )}
```

Every hot region is tappable, not just one — `onSelectCase` takes the node it was tapped on.

`MapPage` lists the hot regions as the day's choices, shows the day, and offers **shore up** on a
held region when `bank >= SHORE_UP_COST`. Both actions end the day, so the page routes through the
same `endDay` the fight screen uses.

- [ ] **Step 4: Run the suites**

Run: `npx vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/components/BodyMap.tsx src/app/components/BodyMap.test.tsx src/app/pages/MapPage.tsx src/app/pages/MapPage.test.tsx
git commit -m "Draw the front line on the body"
```

---

### Task 10: A day ends whether you won it or not

**Files:**
- Modify: `src/app/pages/FightPage.tsx`, `src/app/state/ProfileProvider.tsx`
- Test: `src/app/pages/FightPage.test.tsx`

- [ ] **Step 1: Write the failing test**

```tsx
  it('ends the day and lets the sickness move when a case is lost', async () => {
    const { profile } = await renderFightLost();
    expect(profile.front.day).toBe(2);
    expect(profile.front.infected.length).toBeGreaterThan(1);
  });

  it('holds the region and ends the day when a case is cleared', async () => {
    const { profile } = await renderFightCleared();
    expect(profile.front.held).toHaveLength(1);
    expect(profile.front.day).toBe(2);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/pages/FightPage.test.tsx -t 'ends the day'`
Expected: FAIL — losing currently restarts the case in place and never touches the profile.

- [ ] **Step 3: Implement**

`ProfileProvider` gains one method, `endDay()`, which applies `front.endDay` and writes the profile;
`recordClear` gains the `holdRegion` call from Task 7. `FightPage`'s result handling becomes:

```tsx
      case 'case':
        recordClear(caseId, loop.state.totalKills);
        endDay();
        history.push('/');
        return;
      case 'lost':
        // A lost day is a day the sickness got. "Try this case again" was a free retry, which is
        // the one thing a front line cannot allow — the whole layer is that a day is spent either
        // way. Coming back tomorrow is the retry now.
        endDay();
        history.push('/');
        return;
```

The result sheet's copy follows: the losing call to action stops being "Try this case again" and
becomes something that says the day is over. Keep it plain and do not scold — the copy rules in
`content.invariants.test.ts` apply here too.

If `isRunLost(profile.front)` after `endDay`, the map shows the run as over and offers "Start a new
body", which `createFreshProfile` already does.

- [ ] **Step 4: Run the suites**

Run: `npx vitest run src/app`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app
git commit -m "Make a lost case cost a day rather than nothing"
```

---

### Task 11: Earned, never bought

**Files:**
- Modify: `src/game/content/vaccines.ts`, `src/game/progression.ts`
- Test: `src/game/content/vaccines.copy.test.ts`, `src/game/progression.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
  it('never asks the player to buy a vaccine, in any row', () => {
    for (const vaccine of VACCINES) {
      expect(vaccine.cost, `${vaccine.name} still carries a price`).toBeUndefined();
    }
  });

  it('applies the amnesia block once its gate is reached, without being bought', () => {
    const profile = { ...createFreshProfile(), cleared: CASES.slice(0, 2).map((c) => c.id) };
    expect(blocksAmnesia(profile)).toBe(true);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/content/vaccines.copy.test.ts`
Expected: FAIL — MMR carries `cost: 'Costs a day you don’t fight'`.

- [ ] **Step 3: Implement**

Drop `cost` from `VaccineEntry` and from the MMR row; drop the cost line from `Season.tsx`. Add `blocksAmnesia(profile)` to `progression.ts`, reading the MMR gate, and have `createSimState` skip the wipe when it is true. Chickenpox loses `later: true`, gains its gate, and `stepSickness` refuses to besiege a held region when it is earned.

- [ ] **Step 4: Run the suites**

Run: `npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/game src/app
git commit -m "Stop selling vaccines the screen said were earned"
```

---

## Phase 4 — The heart

### Task 12: The last stand

**Files:**
- Modify: `src/game/types.ts`, `src/game/content/cases.ts`, `src/game/content/content.invariants.test.ts`, `src/game/golden.test.ts`
- Test: as above, plus `tests/e2e/cases.spec.ts` picks it up for free

- [ ] **Step 1: Write the failing test**

```ts
  it('gives the core the one case that is fought on it, and no other', () => {
    const onCore = CASES.filter((c) => c.node === 'heart');
    expect(onCore).toHaveLength(1);
    expect(onCore[0]?.id).toBe('heart');
  });

  it('never lists more holdable cases than there are regions to hold', () => {
    const holdable = CASES.filter((c) => c.node !== 'heart');
    expect(holdable.length).toBeLessThanOrEqual(CASE_REGIONS.length);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/game/content/content.invariants.test.ts`
Expected: FAIL — no case sits on the heart, and the existing invariant forbids it.

- [ ] **Step 3: Implement**

`CaseId` gains `'heart'`. The invariant "anchors every case to a region a case can be fought over,
never the core or a joint" becomes "never a joint, and the core only for the case named for it" —
and the denominator invariant counts only holdable cases, because the heart is defended rather than
held and the map's `x / 10` must not become `x / 11`.

Author the case the way every other one in this repo was authored, in this order:

1. **A path with a shape no other case has.** Every entry-and-exit pair is taken (the season-shape
   review §5 has the table), so the heart's is the one shape left: it has no door. Run the vessel
   in and out on the *same* edge as a loop through the middle, which nothing else does, and which
   is what a systemic infection arriving from everywhere looks like.
2. **Five spots by profile matching**, with the grid-search method recorded in the season-shape
   review §5 — target the dwell profile of `vesper`, the case it most resembles in what it asks.
3. **Five waves and a rule.** Reuse `novel`: a strain that reached the core is by definition one
   nothing stopped, and the brief hiding the wave table is the truest thing it could do. Do not
   invent an eighth rule for one case.
4. **A golden scenario**, because `golden.test.ts` asserts it covers every case the season ships
   and will fail without one.

Its clear rate is measured in Task 13 against whole runs, not chosen here — this is the only case
in the game whose difficulty is a property of the run that reached it.

- [ ] **Step 4: Run the suites and the sweep**

Run: `npm run verify` then `SWEEP_CASES=heart npm run sweep`
Expected: PASS; the heart case reports a rate.

- [ ] **Step 5: Commit**

```bash
git add src/game tests
git commit -m "Put the heart on the board, once, at the end"
```

---

## Phase 5 — The instrument

### Task 13: A sweep that plays runs

**Files:**
- Create: `tests/sweep/runSweep.ts`, `tests/sweep/playRun.ts`, `tests/sweep/playRun.test.ts`
- Modify: `package.json` (a `sweep:runs` script), `vitest.sweep-runs.config.ts`

**Interfaces:**
- Consumes: everything in `front.ts`
- Produces: `playRun(seed, policy): RunOutcome`

- [ ] **Step 1: Write the failing test for the harness itself**

```ts
describe('playRun', () => {
  it('ends every run, one way or the other', () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const outcome = playRun(seed, 'nearestToCore');
      expect(outcome.stalled, `run ${String(seed)} never ended`).toBe(false);
      expect(['won', 'lost']).toContain(outcome.result);
    }
  });

  it('replays a seed identically, so a measurement is a measurement', () => {
    expect(playRun(4, 'nearestToCore')).toEqual(playRun(4, 'nearestToCore'));
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/sweep/playRun.test.ts`
Expected: FAIL — cannot resolve `./playRun`.

- [ ] **Step 3: Implement the harness**

`playRun` walks days: pick a hot case by policy, play it with `playBoard` at the day's dock, apply the result to the front, `endDay`, repeat until won, lost, or a step ceiling. Two policies to start — `nearestToCore` (fight the fire closest to the heart) and `cheapest` (fight whatever is easiest) — because a pacing number that only works under one policy is a number about a policy.

- [ ] **Step 4: Report and gate**

`runSweep.ts` plays many seeds under both policies and prints: share of runs won, median days survived, regions held at the end, how often the heart was reached. Gate only the two things that are unambiguously broken content — **no run may be unwinnable under every seed, and no run may be unlosable** — and leave the rest as a report, for the same reason the coverage report is a report.

- [ ] **Step 5: Choose the four pacing numbers**

With the instrument working, sweep `OUTBREAK_INTERVAL`, `SIEGE_BASE_DAYS`, `DOOR_RESIST_PER_CLEAR` and the heart case's difficulty, and put the measured numbers and what each lever was worth into `rules.ts` beside the constants — the way every tuning in `cases.ts` is recorded.

- [ ] **Step 6: Commit**

```bash
git add tests/sweep package.json vitest.sweep-runs.config.ts src/game/content/rules.ts
git commit -m "Measure a run the way the board sweep measures a board"
```

---

## Task 14: The season screen becomes a record

**Files:**
- Modify: `src/app/components/Season.tsx`, `src/game/progression.ts`
- Test: `src/app/components/Season.test.tsx`, `src/game/progression.test.ts`

- [ ] **Step 1: Write the failing test**

```tsx
  it('shows the run that happened rather than a schedule that cannot be known', () => {
    const rows = seasonRows(profileOnDay(6));
    expect(rows.map((r) => r.state)).not.toContain('next');
    expect(rows.filter((r) => r.state === 'done')).toHaveLength(2);
  });
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/app/components/Season.test.tsx`
Expected: FAIL — `seasonRows` still projects a fixed order onto future days.

- [ ] **Step 3: Implement**

`seasonRows` stops forecasting: with a front line the order is not knowable, so the screen becomes days lived, regions taken and lost, and what is burning now. `LATER` empties — the promise it carried is the thing this plan builds — and the naming-policy card stays.

- [ ] **Step 4: Run the suites**

Run: `npx vitest run src/app src/game`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app src/game
git commit -m "Make the season screen a record rather than a forecast"
```

---

## What this plan does not build

The in-fight half of the memory response — free, weak, strain-specific antibodies arriving during a
case — is **plan two**, and it is blocked on an instrument that does not exist: `playBoard` assigns
a kind to each of five spots and the economy fills it in, so units nobody bought are invisible to
it. Until that is fixed, adding them would put a second unpriced mechanic into a game whose every
recorded clear rate assumes there is none. Task 13 builds the run-level instrument; the board-level
one is the first task of plan two.
