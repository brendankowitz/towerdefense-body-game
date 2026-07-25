import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER } from './defenders';
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

// A build spot no cell can shoot from is dead content, the same class of defect as a vaccine
// that cannot be earned. This does not assert any particular range — only that whatever the
// ranges are, every spot a case offers can be used by something.
describe('build spots are usable', () => {
  function distanceToPath(spot: readonly [number, number], path: readonly (readonly [number, number])[]): number {
    let best = Number.POSITIVE_INFINITY;
    for (let i = 0; i < path.length - 1; i += 1) {
      const a = path[i];
      const b = path[i + 1];
      if (a === undefined || b === undefined) continue;
      const vx = b[0] - a[0];
      const vy = b[1] - a[1];
      const lengthSquared = vx * vx + vy * vy;
      const along = lengthSquared === 0
        ? 0
        : Math.max(0, Math.min(1, ((spot[0] - a[0]) * vx + (spot[1] - a[1]) * vy) / lengthSquared));
      const dx = a[0] + along * vx - spot[0];
      const dy = a[1] + along * vy - spot[1];
      best = Math.min(best, Math.sqrt(dx * dx + dy * dy));
    }
    return best;
  }

  /**
   * Distance is meant to be a trade-off — a spot far from the vessel should demand range —
   * so a spread from "any cell fits" down to "only the long-ranged reach" is the design.
   * What is not the design is a spot exactly one cell can use: if the player cannot afford
   * that one cell, the spot is dead ground, and nothing in the fiction explains why.
   *
   * Two is the floor because two is the smallest number that is still a choice. This asserts
   * no particular range; it says that whatever the ranges are, every spot offers a decision.
   */
  it('offers a choice of at least two defenders at every build spot', () => {
    const ranges = Object.values(DEFENDERS).map((d) => d.range);
    for (const c of CASES) {
      c.spots.forEach((spot, index) => {
        const reach = distanceToPath(spot, c.path);
        const usable = ranges.filter((range) => range >= reach).length;
        expect(
          usable,
          `${c.id} spot ${String(index)} sits ${reach.toFixed(0)} from the vessel, which only ${String(usable)} defender(s) can cover`,
        ).toBeGreaterThanOrEqual(2);
      });
    }
  });

  it('keeps at least one spot per case that the cheapest defender can use', () => {
    const cheapest = Object.values(DEFENDERS).reduce((a, b) => (a.cost <= b.cost ? a : b));
    for (const c of CASES) {
      const affordable = c.spots.filter((spot) => distanceToPath(spot, c.path) <= cheapest.range);
      expect(
        affordable.length,
        `${c.id} offers nowhere the opening cell (${cheapest.label}) can be used`,
      ).toBeGreaterThan(0);
    }
  });
});
