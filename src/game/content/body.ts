import type { BodyNodeId } from '../types';

export interface BodyNode {
  readonly id: BodyNodeId;
  readonly x: number;
  readonly y: number;
  readonly r: number;
  readonly label?: string;
  readonly core?: true;
  /**
   * A joint the body routes through, not a place illness settles. Drawn and linked so the graph
   * still reads as a body, but never a case and never counted as a region to hold.
   *
   * This is what the map's denominator is made of, so it decides what the game promises. Every
   * non-core node used to count, which put `0 / 14` under a season of three cases and read as an
   * unfinished game whatever those cases were. Four joints marked here leave ten regions — a
   * number the season can actually reach. `content.invariants.test.ts` holds cases off them.
   */
  readonly connective?: true;
}

export const BODY_NODES: readonly BodyNode[] = [
  { id: 'sinus', x: 187, y: 56, r: 24, label: 'SINUS' },
  { id: 'throat', x: 187, y: 108, r: 19, label: 'THROAT' },
  { id: 'lungL', x: 128, y: 148, r: 21 },
  { id: 'lungR', x: 246, y: 148, r: 21 },
  { id: 'heart', x: 187, y: 176, r: 30, core: true, label: 'HEART · CORE' },
  { id: 'stomach', x: 187, y: 254, r: 23, label: 'STOMACH' },
  { id: 'gut', x: 187, y: 322, r: 19 },
  { id: 'shoulder', x: 104, y: 196, r: 15, connective: true },
  { id: 'forearm', x: 64, y: 252, r: 26, label: 'FOREARM' },
  { id: 'shoulderR', x: 270, y: 196, r: 15, connective: true },
  { id: 'handR', x: 310, y: 252, r: 22, label: 'HAND' },
  { id: 'kneeL', x: 146, y: 386, r: 15, connective: true },
  { id: 'kneeR', x: 228, y: 386, r: 15, connective: true },
  { id: 'footL', x: 146, y: 452, r: 21 },
  { id: 'footR', x: 228, y: 452, r: 21 },
];

/**
 * The regions a season can be fought over: everything that is neither the core nor a joint.
 *
 * Derived rather than counted by hand, and exported rather than re-filtered at each call site, so
 * the map's denominator and the invariant that keeps cases off joints read the same list.
 */
export const CASE_REGIONS: readonly BodyNode[] = BODY_NODES.filter(
  (node) => node.core !== true && node.connective !== true,
);

export const BODY_LINKS: readonly (readonly [BodyNodeId, BodyNodeId])[] = [
  ['sinus', 'throat'], ['throat', 'heart'], ['heart', 'lungL'], ['heart', 'lungR'],
  ['heart', 'stomach'], ['stomach', 'gut'], ['heart', 'shoulder'], ['shoulder', 'forearm'],
  ['heart', 'shoulderR'], ['shoulderR', 'handR'], ['gut', 'kneeL'], ['gut', 'kneeR'],
  ['kneeL', 'footL'], ['kneeR', 'footR'],
];

export const BODY_MAP_VIEWBOX = { width: 374, height: 500 } as const;
