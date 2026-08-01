import { describe, expect, it } from 'vitest';
import { dwellSeconds } from '../coverage';
import {
  DEFENDERS, DEFENDER_BLURBS, DEFENDER_ORDER, unlockPhrase,
} from './defenders';
import { maturedFormOf } from './maturation';
import { PATHOGENS } from './pathogens';
import { CASES, caseHasRule } from './cases';
import { STRAIN_NAME, STRAIN_ROWS, VACCINES } from './vaccines';
import { BODY_LINKS, BODY_NODES, CASE_REGIONS, ENTRY_REGIONS, INTERIOR_REGIONS } from './body';
import { BOARD_HEIGHT, BOARD_WIDTH, IMMUNITY_MAX, TAG_REWARD_MULTIPLIER } from './rules';
import type { CaseRuleKind, Point } from '../types';

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

  /**
   * The map counts held regions against `CASE_REGIONS`, so a case anchored anywhere else is a
   * region the player can hold and the counter will never credit — the numerator and the
   * denominator would be measuring different things. A joint is pass-through and nobody is ever
   * meant to hold it; the core is the one exception, defended rather than held, and only the case
   * named for it may sit there — everything else that reaches the core does so by losing a region,
   * never by claiming one.
   */
  it('anchors every case to a region a case can be fought over, never a joint, and the core only for the case named for it', () => {
    const regions = new Set(CASE_REGIONS.map((n) => n.id));
    for (const c of CASES) {
      if (c.node === 'heart') {
        expect(c.id, 'a case sits on the core without being the heart case').toBe('heart');
        continue;
      }
      expect(regions, `case ${c.id} sits on ${c.node}, which is not a region to hold`)
        .toContain(c.node);
    }
  });

  it('gives the core the one case that is fought on it, and no other', () => {
    const onCore = CASES.filter((c) => c.node === 'heart');
    expect(onCore).toHaveLength(1);
    expect(onCore[0]?.id).toBe('heart');
  });

  it('gives every case a region of its own, so two cases never claim one node', () => {
    const nodes = CASES.map((c) => c.node);
    expect(new Set(nodes).size).toBe(nodes.length);
  });

  /**
   * A season cannot promise more regions than the body has to give — but the core is defended
   * rather than held, so it is not one of those regions and the heart case does not count against
   * this. Counting it would turn a season of ten holdable regions and one defended core into a
   * denominator of eleven, which is not what `CASE_REGIONS.length` (the map's own denominator)
   * measures.
   */
  it('never lists more holdable cases than there are regions to hold', () => {
    const holdable = CASES.filter((c) => c.node !== 'heart');
    expect(holdable.length).toBeLessThanOrEqual(CASE_REGIONS.length);
  });

  /**
   * A case credits a strain, and the brief shows that strain's held copy over the wave table. So a
   * case crediting something it never sends tells a vaccinated player their serum is working on a
   * board where nothing it applies to turns up — the same shape of broken promise as the Tetanus
   * caveat in `vaccines.ts`, one step further out.
   *
   * Every `StrainId` is the name of a pathogen as well as of a vaccine, which is what makes this
   * checkable without a second table mapping one to the other.
   */
  it('credits every case to a strain it actually fights', () => {
    for (const c of CASES) {
      const sent = new Set(c.waves.flat().map((entry) => entry.kind));
      expect(sent, `case ${c.id} credits ${c.credits} and never sends one`).toContain(c.credits);
    }
  });
});

/**
 * The rules a case declares, held to what makes a list of them meaningful.
 *
 * None of this is a balance value: it rules out a case that names one rule twice, and a rule the
 * union offers that no case ever plays — which is a branch in `hazards.ts` that nothing reaches.
 */
describe('case rules', () => {
  it('never names the same rule twice on one case', () => {
    for (const c of CASES) {
      const kinds = c.rules.map((rule) => rule.kind);
      expect(new Set(kinds).size, `${c.id} carries ${kinds.join(', ')}`).toBe(kinds.length);
    }
  });

  /**
   * Every member of `CaseRuleKind` is played somewhere. The union is the simulation's list of
   * things a case can do, and a member no case carries is a hazard branch, a copy line and a test
   * that answer to nothing — the same dead-content defect as an unreachable vaccine, one layer in.
   *
   * The list is written out rather than derived from the cases, because deriving it from the thing
   * under test is the vacuous shape this suite has found sixteen times.
   */
  it('plays every rule the simulation can be asked for', () => {
    const played = new Set(CASES.flatMap((c) => c.rules.map((rule) => rule.kind)));
    const declared: readonly CaseRuleKind[] = [
      'wound', 'virus', 'poison', 'dormant', 'amnesia', 'allergy', 'novel',
    ];
    for (const kind of declared) {
      expect(played, `no case is played under the ${kind} rule`).toContain(kind);
    }
  });
});

/**
 * The amnesia rule's data, held to the two things that make it a rule rather than a field.
 *
 * Neither is a gameplay value. What they rule out is a case that carries the label and takes
 * nothing, and a case that takes an immunity while telling the player it is holding.
 */
describe('the amnesia wipe', () => {
  it('is carried by every amnesia case and by no other', () => {
    for (const c of CASES) {
      if (caseHasRule(c, 'amnesia')) {
        expect(c.wipes, `${c.id} is an amnesia case that wipes nothing`).toBeDefined();
      } else {
        expect(c.wipes, `${c.id} wipes an immunity without being an amnesia case`).toBeUndefined();
      }
    }
  });

  it('never wipes the strain its own case credits', () => {
    for (const c of CASES) {
      if (c.wipes === undefined) continue;
      expect(c.wipes, `${c.id} credits ${c.credits} and wipes it in the same breath`)
        .not.toBe(c.credits);
    }
  });

  /**
   * A wipe of something the player cannot have earned yet is a rule that does nothing on a first
   * run. A strain needs `IMMUNITY_MAX` clears, one per case that credits it, so this counts the
   * cases before the wipe and asks whether the season has actually handed the immunity over.
   *
   * It is a claim about ordering, not about difficulty: move the amnesia case earlier, or credit
   * its strain less often, and the rule quietly becomes inert. That is exactly the failure the
   * design predicted for putting this rule too early, and nothing else would catch it.
   */
  it('takes an immunity the season has already given the player', () => {
    CASES.forEach((c, index) => {
      if (c.wipes === undefined) return;
      const earned = CASES.slice(0, index).filter((earlier) => earlier.credits === c.wipes).length;
      expect(
        earned,
        `${c.id} wipes ${c.wipes}, which only ${String(earned)} of the ${String(index)} cases before it credit — the player cannot hold it yet`,
      ).toBeGreaterThanOrEqual(IMMUNITY_MAX);
    });
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

  /**
   * A vaccine needs `IMMUNITY_MAX` clears, and a strain credited by fewer cases than that is a row
   * the immunity screen can never fill in a single season — earnable in principle, unearnable in a
   * run. The one-case check above cannot see it: film was credited by exactly one case for three
   * cases' worth of the season and read as reachable the whole time.
   */
  it('credits every strain often enough that a season can actually finish it', () => {
    for (const row of STRAIN_ROWS) {
      const credits = CASES.filter((c) => c.credits === row.key).length;
      expect(
        credits,
        `${String(credits)} case(s) credit ${row.key}; ${String(IMMUNITY_MAX)} clears are needed to hold ${row.name}`,
      ).toBeGreaterThanOrEqual(IMMUNITY_MAX);
    }
  });

  it('lists a strain row for every earnable vaccine, one to one', () => {
    const strains = VACCINES.map((v) => v.strain).filter((strain) => strain !== undefined).sort();
    expect(STRAIN_ROWS.map((r) => r.key).sort()).toEqual(strains);
  });

  /**
   * `STRAIN_NAME` is built by folding `STRAIN_ROWS` and asserted to be total by a cast, which the
   * compiler takes on trust. Copy interpolates it — the amnesia case's rule line names the vaccine
   * it takes away — so a missing entry does not throw, it prints the word "undefined" onto the
   * brief screen.
   *
   * The keys are compared against the rows rather than against the lookup's own values, because a
   * check that read the lookup would agree with whatever the fold produced. That is the vacuous
   * shape this repo has now found sixteen times.
   */
  it('names every strain a row exists for, so interpolated copy cannot print undefined', () => {
    expect(Object.keys(STRAIN_NAME).sort()).toEqual(STRAIN_ROWS.map((r) => r.key).sort());
    for (const [key, name] of Object.entries(STRAIN_NAME)) {
      expect(name, `${key} has an empty name`).not.toBe('');
    }
  });
});

/**
 * The last line of defence for copy assembled from a lookup. Every sentence the player reads off a
 * case is checked for the two words a failed interpolation leaves behind — this is cheap, it holds
 * copy that has not been written yet, and it does not know or care which field went missing.
 */
describe('case copy is assembled, never half-assembled', () => {
  it('never shows the player a hole where a value should be', () => {
    for (const c of CASES) {
      const ruleCopy = Object.fromEntries(
        c.rules.flatMap((rule) => [[`${rule.kind}.label`, rule.label], [`${rule.kind}.sub`, rule.sub]]),
      );
      for (const [field, line] of Object.entries({
        region: c.region, title: c.title, story: c.story, ...ruleCopy,
      })) {
        expect(line, `${c.id}.${field} reads "${line}"`).not.toMatch(/undefined|NaN/);
      }
    }
  });

  it('never scolds, exclaims, or uses an emoji — spec copy rules', () => {
    for (const c of CASES) {
      for (const line of [c.story, ...c.rules.map((rule) => rule.sub)]) {
        expect(line, `${c.id}: "${line}"`).not.toContain('!');
        expect(line).not.toMatch(/\p{Extended_Pictographic}/u);
      }
    }
  });
});

/**
 * The shape of the season's boards, and the one thing in this file that is about variety rather
 * than about coherence.
 *
 * **It exists because seven cases were authored without it and came out as one board.** Measured
 * over days 1 to 7: every vessel entered off the *left* edge in the upper third of the board and
 * left through the *floor*; between 32 and 48 per cent of every path ran downward and at most 9
 * per cent ran up; and the five build spots sat a mean 53 to 65 units off the vessel in all seven,
 * a spread of twelve units inside a defender range band twenty-two units wide. The rule each case
 * carried was the only thing that changed, and a player who has read the rule has read the case.
 *
 * Nothing caught it, and nothing could have: `dwellSeconds` says a spot is usable, the clear-rate
 * band says a case is winnable, and a season of identical boards satisfies both. So the sameness
 * survived twelve tuning passes and reached a person instead.
 *
 * What is asserted here is deliberately weak — the weakest claim that would have failed on the
 * seven. Geometry is an author's judgement, and a gate that specified it would be authoring by
 * assertion. This says only that the season does not enter every board from one side.
 */
describe('the season is more than one board', () => {
  type Edge = 'left' | 'right' | 'top' | 'bottom';

  /**
   * Which edge a point sits at or beyond, or null for a point inside the board. A point exactly on
   * an edge counts: the shipped convention is that a vessel enters from off-screen and ends flush
   * with the floor, and both read as "off the board" to a player.
   *
   * A corner reports the axis it is furthest out on, which is the direction a body arrives from.
   */
  function edgeOf(point: Point): Edge | null {
    const [x, y] = point;
    const out: readonly (readonly [Edge, number])[] = [
      ['left', -x], ['right', x - BOARD_WIDTH], ['top', -y], ['bottom', y - BOARD_HEIGHT],
    ];
    const worst = out.reduce((a, b) => (a[1] >= b[1] ? a : b));
    return worst[1] >= 0 ? worst[0] : null;
  }

  function ends(path: readonly Point[]): { readonly entry: Point; readonly exit: Point } {
    const entry = path[0];
    const exit = path[path.length - 1];
    if (entry === undefined || exit === undefined) throw new Error('a case path with no ends');
    return { entry, exit };
  }

  /**
   * A vessel that began or ended inside the board would have bodies appearing out of nothing and
   * vanishing into it. Every case already does this; it is written down because the two ends are
   * also what the diversity check below reads, and a path that stopped short would make that check
   * quietly meaningless rather than red.
   */
  it('starts and finishes every vessel off the board, so nothing appears from nowhere', () => {
    for (const c of CASES) {
      const { entry, exit } = ends(c.path);
      expect(edgeOf(entry), `${c.id} enters at [${entry.join(', ')}], which is on the board`).not.toBeNull();
      expect(edgeOf(exit), `${c.id} leaves at [${exit.join(', ')}], which is on the board`).not.toBeNull();
    }
  });

  it('does not bring every case in from the same side of the board', () => {
    const entries = CASES.map((c) => edgeOf(ends(c.path).entry));
    const distinct = new Set(entries);
    expect(
      distinct.size,
      `every case in the season enters from the ${[...distinct].join('')} — the board is the same board each time`,
    ).toBeGreaterThan(1);
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

  /**
   * The joints, named rather than derived, and this is the one place in the suite that names
   * content on purpose.
   *
   * `CASE_REGIONS` is `BODY_NODES` minus the core minus these, and the map's denominator is its
   * length — so every check written against `CASE_REGIONS` moves when the flags move, and a joint
   * quietly promoted back to a region passes all of them. Naming the four here is what makes the
   * denominator a decision the season answers to instead of whatever the table currently says.
   * Changing this list is allowed; changing it by accident is what this stops.
   */
  it('routes through four joints, and gives a case to everything else', () => {
    const joints = BODY_NODES.filter((n) => n.connective === true).map((n) => n.id).sort();
    expect(joints).toEqual(['kneeL', 'kneeR', 'shoulder', 'shoulderR']);
  });

  it('sorts every node into exactly one of the core, a joint, and a region to hold', () => {
    for (const node of BODY_NODES) {
      const roles = [node.core === true, node.connective === true].filter(Boolean).length;
      expect(roles, `${node.id} is both the core and a joint`).toBeLessThanOrEqual(1);
    }
    expect(CASE_REGIONS.map((n) => n.id).sort()).toEqual(
      BODY_NODES
        .filter((n) => n.core !== true && n.connective !== true)
        .map((n) => n.id)
        .sort(),
    );
  });

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
  });

  /**
   * `entry` is documented as never sitting on the core or a joint, but `ENTRY_REGIONS` and
   * `INTERIOR_REGIONS` are both filtered from `CASE_REGIONS`, which has already dropped the core
   * and the joints — so `entry: true` on `heart` or a shoulder would vanish from both derived
   * lists and trip nothing there. This reads `BODY_NODES` directly, before that filtering happens,
   * so it is the one check that can actually catch that mistake.
   */
  it('never marks the core or a joint as a door', () => {
    for (const node of BODY_NODES) {
      if (node.core === true || node.connective === true) {
        expect(node.entry, `${node.id} is the core or a joint and also a door`).not.toBe(true);
      }
    }
  });

  /**
   * The claim connectivity-from-the-core cannot make, and the one the season actually depends on:
   * a sickness that starts at a door has to be able to walk to every region a case is fought over
   * *without* going through the core.
   *
   * Nothing asserted this, and the body failed it. `lungL` and `lungR` hung off the heart alone,
   * so the only step into a lung was out of the core — which `stepSickness` forbids until every
   * road, both lungs included, has already fallen. Neither lung could ever catch fire, so the core
   * could never be besieged, the last stand could never be fought, `isRunWon` could never be true,
   * and two authored cases were dead content. Every test in the suite passed: the graph was
   * connected, the cases were anchored, the doors were doors. Reachability *in the direction the
   * sickness actually spreads* is the thing none of them said.
   *
   * The core is exempt because it is what the walk is not allowed to pass through — it is reached
   * by taking the roads, which is the ending this rule exists to make possible, not by spreading
   * into like a region. The four joints are exempt because nobody fights over them: they are
   * pass-through, they hold no case, and they do not count toward the map's denominator, so a
   * joint the sickness could not enter would cost the season nothing.
   */
  it('lets a sickness reach every case-bearing region from a door without passing through the core', () => {
    const adjacency = new Map<string, string[]>();
    for (const node of BODY_NODES) adjacency.set(node.id, []);
    for (const [from, to] of BODY_LINKS) {
      adjacency.get(from)?.push(to);
      adjacency.get(to)?.push(from);
    }

    const [core] = BODY_NODES.filter((n) => n.core === true);
    expect(core).toBeDefined();
    if (core === undefined) return;

    const reached = new Set<string>(ENTRY_REGIONS.map((n) => n.id));
    const queue: string[] = [...reached];
    let current: string | undefined;
    while ((current = queue.shift()) !== undefined) {
      for (const neighbour of adjacency.get(current) ?? []) {
        if (neighbour === core.id || reached.has(neighbour)) continue;
        reached.add(neighbour);
        queue.push(neighbour);
      }
    }

    const stranded = CASE_REGIONS.map((n) => n.id).filter((id) => !reached.has(id));
    expect(stranded, `no illness can ever reach ${stranded.join(', ')}, so its case can never be played`)
      .toEqual([]);
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

  /**
   * Checking for the substring "to unlock" alone would pass copy naming the wrong unit — "Clear
   * three cases to unlock" contains it just as well as "Live three days to unlock" does, and the
   * gate reads days. Asserted against `unlockPhrase(stats.unlock)`, the same function and the same
   * value `isUnlocked` reads off `DEFENDERS[kind].unlock`, so a copy that drifts from the gate it
   * describes fails here rather than shipping.
   */
  it('names the real unlock requirement, its count and its unit, or stays silent when there is none', () => {
    for (const [kind, stats] of Object.entries(DEFENDERS)) {
      const text = DEFENDER_BLURBS[stats.kind].text;
      if (stats.unlock === 0) {
        expect(text, `${kind} is available from the start`).not.toContain('to unlock');
      } else {
        expect(text, `${kind} unlocks after ${unlockPhrase(stats.unlock)}`)
          .toContain(`${unlockPhrase(stats.unlock)} to unlock`);
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
 *
 * The geometry itself is `src/game/coverage.ts` rather than a local function, because it was a
 * local function and a second copy of it in a scratch script is where an authoring problem was
 * eventually found. This suite owns the *floor*; the same measurement read as a number rather than
 * as a bar is printed by `tests/sweep/balance.sweep.ts`.
 */
describe('build spots are usable', () => {
  /**
   * The floor, in seconds an enemy spends inside the circle. One second is a low bar on purpose —
   * it is roughly one action from the slowest-firing cell in the dock, so a spot under it cannot
   * host that cell at all. It is a dead-content detector, not a balance target.
   */
  const MIN_DWELL_SECONDS = 1;

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
