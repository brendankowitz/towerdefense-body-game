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
