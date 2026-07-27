import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from './defenders';
import { maturedFormOf } from './maturation';
import { PATHOGENS } from './pathogens';
import { CASES } from './cases';
import { STRAIN_ROWS, VACCINES } from './vaccines';
import { BODY_LINKS, BODY_NODES } from './body';
import { BOARD_HEIGHT, BOARD_WIDTH, TAG_REWARD_MULTIPLIER } from './rules';

// Structural invariants only — never gameplay values. A balance pass must be able to change
// every number in content/ without turning this suite red (spec §4, §9).

describe('defender table coherence', () => {
  it('lists every defender in the dock order exactly once', () => {
    const orderSet = new Set(DEFENDER_ORDER);
    expect(orderSet.size).toBe(DEFENDER_ORDER.length);
    expect([...orderSet].sort()).toEqual(Object.keys(DEFENDERS).sort());
  });

  it('gives every defender table entry a kind matching its own key', () => {
    for (const [key, defender] of Object.entries(DEFENDERS)) {
      expect(defender.kind).toBe(key);
    }
  });
});

describe('pathogen table coherence', () => {
  it('gives every pathogen table entry a kind matching its own key', () => {
    for (const [key, pathogen] of Object.entries(PATHOGENS)) {
      expect(pathogen.kind).toBe(key);
    }
  });
});

describe('case coherence', () => {
  it('gives every case a unique id', () => {
    expect(new Set(CASES.map((c) => c.id)).size).toBe(CASES.length);
  });

  it('references only pathogens that exist, with a non-empty wave table and positive counts', () => {
    for (const c of CASES) {
      expect(c.waves.length).toBeGreaterThan(0);
      for (const wave of c.waves) {
        expect(wave.length).toBeGreaterThan(0);
        for (const entry of wave) {
          expect(PATHOGENS[entry.kind]).toBeDefined();
          expect(Number.isInteger(entry.count)).toBe(true);
          expect(entry.count).toBeGreaterThan(0);
        }
      }
    }
  });

  it('gives every case a path of at least two points', () => {
    for (const c of CASES) expect(c.path.length).toBeGreaterThanOrEqual(2);
  });

  it('gives every case at least one build spot, all within the board bounds', () => {
    for (const c of CASES) {
      expect(c.spots.length).toBeGreaterThan(0);
      for (const [x, y] of c.spots) {
        expect(x).toBeGreaterThanOrEqual(0);
        expect(x).toBeLessThanOrEqual(BOARD_WIDTH);
        expect(y).toBeGreaterThanOrEqual(0);
        expect(y).toBeLessThanOrEqual(BOARD_HEIGHT);
      }
    }
  });

  it('anchors every case to a body node that exists', () => {
    const nodeIds = new Set(BODY_NODES.map((n) => n.id));
    for (const c of CASES) expect(nodeIds.has(c.node)).toBe(true);
  });
});

describe('vaccine reachability', () => {
  it('credits every case to a strain that has a vaccine', () => {
    const strainsWithVaccines = new Set(
      VACCINES.map((v) => v.strain).filter((strain) => strain !== undefined),
    );
    for (const c of CASES) {
      expect(strainsWithVaccines, `case ${c.id} credits ${c.credits}, which has no vaccine`).toContain(c.credits);
    }
  });

  it('gives every earnable vaccine at least one case that credits it — spec success criterion 6', () => {
    const credited = new Set(CASES.map((c) => c.credits));
    for (const v of VACCINES) {
      if (v.strain === undefined) continue;
      expect(credited, `no case credits ${v.strain}; ${v.name} can never be earned`).toContain(v.strain);
    }
  });

  /**
   * The third time this class of defect has shipped: `film` immunity that was never incremented,
   * then Chickenpox at `gate: 99` against a maximum of three clears. A gate the player cannot
   * reach renders as LOCKED forever, which reads as something they are failing at.
   */
  it('gates every gated vaccine at a number of clears the player can actually reach', () => {
    for (const v of VACCINES) {
      if (v.gate === undefined) continue;
      expect(
        v.gate,
        `${v.name} opens at ${String(v.gate)} clears; the season only has ${String(CASES.length)} cases`,
      ).toBeLessThanOrEqual(CASES.length);
      expect(v.gate, `${v.name} is gated at zero, which is not a gate`).toBeGreaterThan(0);
    }
  });

  /** A row cannot be both earnable now and deferred to a rule that does not exist yet. */
  it('never marks a vaccine as later when it is already earnable', () => {
    for (const v of VACCINES) {
      if (v.later !== true) continue;
      expect(v.strain, `${v.name} is marked later but a case credits it`).toBeUndefined();
      expect(v.gate, `${v.name} is marked later but also carries a gate`).toBeUndefined();
    }
  });

  it('lists a strain row for every earnable vaccine, one to one', () => {
    const strains = VACCINES.map((v) => v.strain).filter((strain) => strain !== undefined).sort();
    expect(STRAIN_ROWS.map((r) => r.key).sort()).toEqual(strains);
  });
});

describe('body graph coherence', () => {
  it('gives every node a unique id', () => {
    expect(new Set(BODY_NODES.map((n) => n.id)).size).toBe(BODY_NODES.length);
  });

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

  it('is connected — every node is reachable from the core', () => {
    const [core] = BODY_NODES.filter((n) => n.core === true);
    expect(core).toBeDefined();
    if (core === undefined) return;

    const adjacency = new Map<string, string[]>();
    for (const node of BODY_NODES) adjacency.set(node.id, []);
    for (const [from, to] of BODY_LINKS) {
      adjacency.get(from)?.push(to);
      adjacency.get(to)?.push(from);
    }

    const visited = new Set<string>([core.id]);
    const queue: string[] = [core.id];
    let current: string | undefined;
    while ((current = queue.shift()) !== undefined) {
      for (const neighbour of adjacency.get(current) ?? []) {
        if (!visited.has(neighbour)) {
          visited.add(neighbour);
          queue.push(neighbour);
        }
      }
    }

    expect(visited.size).toBe(BODY_NODES.length);
  });
});

// Magnitude sanity. Deliberately loose — these bounds exist to catch a typo (an extra
// digit, a dropped sign, a NaN), never to constrain balance. Any value a designer would
// plausibly choose passes. If a bound ever blocks a real tuning decision, raise it.
describe('numeric sanity', () => {
  const FRACTIONS = new Set(['armour', 'slow', 'execute']);
  // Zero is a legitimate tuning choice nearly everywhere — unlock: 0 means "available
  // from the start". These few are structurally meaningless at zero, not merely unbalanced.
  const MUST_EXCEED_ZERO = new Set(['hp', 'speed', 'radius', 'cost', 'range']);
  const CEILINGS: Record<string, number> = {
    hp: 5000, speed: 1000, reward: 1000, radius: 100,
    cost: 5000, range: 1000, dps: 1000, dmg: 1000, dot: 1000,
  };

  function check(source: string, entries: Record<string, unknown>): void {
    for (const [field, value] of Object.entries(entries)) {
      if (typeof value !== 'number') continue;
      const where = `${source}.${field}`;
      expect(Number.isFinite(value), `${where} must be a finite number`).toBe(true);
      expect(value, `${where} must not be negative`).toBeGreaterThanOrEqual(0);
      if (MUST_EXCEED_ZERO.has(field)) {
        expect(value, `${where} is meaningless at zero`).toBeGreaterThan(0);
      }
      if (FRACTIONS.has(field)) {
        expect(value, `${where} is a fraction and must be at most 1`).toBeLessThanOrEqual(1);
      }
      const ceiling = CEILINGS[field];
      if (ceiling !== undefined) {
        expect(value, `${where} looks like a typo`).toBeLessThanOrEqual(ceiling);
      }
    }
  }

  it('gives every defender plausible numbers', () => {
    for (const [kind, stats] of Object.entries(DEFENDERS)) check(`DEFENDERS.${kind}`, { ...stats });
  });

  it('gives every pathogen plausible numbers', () => {
    for (const [kind, stats] of Object.entries(PATHOGENS)) check(`PATHOGENS.${kind}`, { ...stats });
  });

  it('gives every case plausible starting energy', () => {
    for (const c of CASES) check(`CASES.${c.id}`, { cost: c.startingEnergy });
  });
});

// Copy that quotes a tunable must derive it. These assert the sentence tracks the stat, so a
// retune cannot leave the brief telling the player a number the simulation no longer uses.
describe('brief copy stays true to the stats it describes', () => {
  it('quotes the execute threshold as a percentage of the real value', () => {
    const shown = `${String(Math.round(DEFENDERS.nk.execute * 100))}%`;
    expect(DEFENDER_BLURBS.nk.text).toContain(shown);
  });

  it('quotes the phagocyte appetite the simulation actually rests on', () => {
    expect(DEFENDER_BLURBS.phago.text).toContain(String(DEFENDERS.phago.capacity));
  });

  it('quotes the tag bonus as a percentage of the real multiplier', () => {
    const shown = `${String(Math.round((TAG_REWARD_MULTIPLIER - 1) * 100))}%`;
    expect(DEFENDER_BLURBS.anti.text).toContain(shown);
  });

  it('names the real unlock requirement, or stays silent when there is none', () => {
    for (const [kind, stats] of Object.entries(DEFENDERS)) {
      const text = DEFENDER_BLURBS[stats.kind].text;
      if (stats.unlock === 0) {
        expect(text, `${kind} is available from the start`).not.toContain('to unlock');
      } else {
        expect(text, `${kind} unlocks after ${String(stats.unlock)}`).toContain('to unlock');
      }
    }
  });

  it('never scolds, exclaims, or uses an emoji — spec copy rules', () => {
    for (const blurb of Object.values(DEFENDER_BLURBS)) {
      expect(blurb.text).not.toContain('!');
      expect(blurb.text).not.toMatch(/\p{Extended_Pictographic}/u);
    }
  });
});

/**
 * A build spot no cell can fight from is dead content, the same class of defect as a vaccine that
 * cannot be earned.
 *
 * This used to measure the *minimum distance* from spot to vessel, and it is why the balance
 * problem reached a review instead of CI. Minimum distance says a spot is fine the moment one
 * range circle touches the path — but a circle that grazes the vessel tangentially covers almost
 * none of it, and an enemy crosses that sliver in a fraction of a second. Forearm spot 4 passed
 * the old test with a memory cell covering 15 units of vessel: a third of a second of a staph's
 * life, on a cell that fires every 1.3 s.
 *
 * What matters is how long an enemy actually spends inside the cell's reach, so that is what is
 * measured: the arc length of vessel inside the range circle, divided by a pathogen's speed.
 *
 * None of this asserts a particular range or a particular geometry. It says that whatever those
 * are, every spot the case offers is a place a player can fight from.
 */
describe('build spots are usable', () => {
  /**
   * The floor, in seconds an enemy spends inside the circle. One second is a low bar on purpose —
   * it is roughly one action from the slowest-firing cell in the dock, so a spot under it cannot
   * host that cell at all. It is a dead-content detector, not a balance target.
   */
  const MIN_DWELL_SECONDS = 1;

  /**
   * Measured at the *slowest* pathogen, which is the most generous reading: the slowest thing on
   * the board dwells the longest, so a spot that fails even here fails for everything. Using the
   * fastest would make this a balance assertion, and content values are not asserted (spec §4).
   */
  const SLOWEST_SPEED = Math.min(...Object.values(PATHOGENS).map((p) => p.speed));

  /**
   * Arc length of `path` lying within `range` of `spot`. Solved per segment rather than sampled:
   * a point on segment A + t·d is inside the circle when |A + t·d − S|² ≤ r², a quadratic in t
   * whose roots clamped to [0, 1] bound exactly the covered stretch. Segments partition the path,
   * so summing them double-counts nothing.
   */
  function coveredArc(
    spot: readonly [number, number],
    path: readonly (readonly [number, number])[],
    range: number,
  ): number {
    let covered = 0;
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      if (a === undefined || b === undefined) continue;

      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const fx = a[0] - spot[0];
      const fy = a[1] - spot[1];

      const qa = dx * dx + dy * dy;
      if (qa === 0) continue;
      const qb = 2 * (fx * dx + fy * dy);
      const qc = fx * fx + fy * fy - range * range;

      const discriminant = qb * qb - 4 * qa * qc;
      if (discriminant <= 0) continue;

      const root = Math.sqrt(discriminant);
      const enter = Math.max(0, (-qb - root) / (2 * qa));
      const leave = Math.min(1, (-qb + root) / (2 * qa));
      if (leave > enter) covered += (leave - enter) * Math.sqrt(qa);
    }
    return covered;
  }

  function dwellSeconds(
    spot: readonly [number, number],
    path: readonly (readonly [number, number])[],
    range: number,
  ): number {
    return coveredArc(spot, path, range) / SLOWEST_SPEED;
  }

  /**
   * Distance is meant to be a trade-off — a spot far from the vessel should demand range — so a
   * spread from "any cell fits" down to "only the long-ranged reach" is the design. What is not
   * the design is a spot exactly one cell can use: if the player cannot afford that one cell, the
   * spot is dead ground, and nothing in the fiction explains why.
   *
   * Two is the floor because two is the smallest number that is still a choice.
   */
  it('gives at least two defenders a real stretch of vessel at every build spot', () => {
    for (const c of CASES) {
      c.spots.forEach((spot, index) => {
        const usable = Object.values(DEFENDERS)
          .filter((d) => dwellSeconds(spot, c.path, d.range) >= MIN_DWELL_SECONDS);
        const detail = Object.values(DEFENDERS)
          .map((d) => `${d.kind} ${dwellSeconds(spot, c.path, d.range).toFixed(2)}s`)
          .join(', ');
        expect(
          usable.length,
          `${c.id} spot ${String(index)} holds only ${String(usable.length)} defender(s) over the vessel for ${String(MIN_DWELL_SECONDS)}s — ${detail}`,
        ).toBeGreaterThanOrEqual(2);
      });
    }
  });

  /**
   * The same defect one tier up, and the one this block used to be blind to: it iterated
   * `DEFENDERS`, so it did not know maturation existed.
   *
   * Reach is the dominant stat in this game, and nothing had said so. Every defender's range sits
   * in a narrow band just above the offsets the build spots are laid at, so a form that trims a
   * few units of reach does not cover slightly less vessel — it falls off a cliff and covers none.
   * The high-affinity antibody's range took it from 5.30s of the slowest pathogen at throat spot 3
   * to 0.00s: a cell the player paid to grow, standing on a spot it could no longer fight from.
   *
   * So: **a matured form may never drop a cell below the dwell floor at a spot its base form was
   * above.** Stated per spot rather than as "a form may not reduce range", because what matters is
   * the geometry — a form is free to give up reach it was never using.
   */
  it('never takes a grown cell off a stretch of vessel the cell it grew from covered', () => {
    for (const c of CASES) {
      for (const kind of DEFENDER_ORDER) {
        const form = maturedFormOf(kind);
        if (form === null) continue;
        const grownRange = form.stats.range ?? DEFENDERS[kind].range;

        c.spots.forEach((spot, index) => {
          const base = dwellSeconds(spot, c.path, DEFENDERS[kind].range);
          if (base < MIN_DWELL_SECONDS) return;
          const grown = dwellSeconds(spot, c.path, grownRange);
          expect(
            grown,
            `growing ${kind} into ${form.name} on ${c.id} spot ${String(index)} drops it from ${base.toFixed(2)}s of vessel to ${grown.toFixed(2)}s`,
          ).toBeGreaterThanOrEqual(MIN_DWELL_SECONDS);
        });
      }
    }
  });

  it('keeps at least one spot per case the cheapest defender can actually fight from', () => {
    const cheapest = Object.values(DEFENDERS).reduce((a, b) => (a.cost <= b.cost ? a : b));
    for (const c of CASES) {
      const usable = c.spots.filter(
        (spot) => dwellSeconds(spot, c.path, cheapest.range) >= MIN_DWELL_SECONDS,
      );
      expect(
        usable.length,
        `${c.id} offers nowhere the opening cell (${cheapest.label}) can hold anything for ${String(MIN_DWELL_SECONDS)}s`,
      ).toBeGreaterThan(0);
    }
  });
});
