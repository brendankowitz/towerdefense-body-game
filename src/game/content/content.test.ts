import { describe, expect, it } from 'vitest';
import { DEFENDERS, DEFENDER_ORDER } from './defenders';
import { PATHOGENS } from './pathogens';
import { CASES } from './cases';
import { STRAIN_ROWS, VACCINES } from './vaccines';
import { BODY_LINKS, BODY_NODES } from './body';
import { BOARD_HEIGHT, BOARD_WIDTH } from './rules';

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
